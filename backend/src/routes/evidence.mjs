import { Router } from "express";
import multer from "multer";
import { ethers } from "ethers";
import { verifyEvidence } from "../agent/claude.mjs";
import { runProvenanceChecks } from "../trust-stack/provenance.mjs";
import {
  completeMilestoneOnChain,
  readEscrowState,
} from "../keeperhub/blockchain.mjs";
import { config } from "../config.mjs";
import { syncEscrowToEns } from "../keeperhub/sync.mjs";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) {
      return cb(new Error(`Unsupported image type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

function sendError(res, err, status = 400) {
  console.error("Evidence route error:", err.message);
  res.status(status).json({ ok: false, error: err.message });
}

/**
 * KeeperHub release path. Fires a webhook to the configured KH workflow,
 * waits for the milestone to flip to completed on-chain, then pulls the
 * tx hash from the MilestoneCompleted event. The MPC wallet sitting in
 * the contract's _agent slot signs — no Construct-controlled key touches
 * funds.
 */
async function releaseViaKeeperHub({ contractAddress, milestoneId }) {
  console.log("   🔑 Via KeeperHub MPC wallet...");

  const khResponse = await fetch(config.keeperHubWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.keeperHubApiKey && {
        Authorization: `Bearer ${config.keeperHubApiKey}`,
      }),
    },
    body: JSON.stringify({ contractAddress, milestoneId }),
  });

  if (!khResponse.ok) {
    const errText = await khResponse.text();
    throw new Error(`KeeperHub webhook ${khResponse.status}: ${errText}`);
  }

  const khTrigger = await khResponse.json().catch(() => ({}));
  console.log(
    `   ⏳ Execution ${khTrigger.executionId || "(no id)"} triggered — watching chain...`,
  );

  // Poll chain state until the milestone flips to completed.
  const provider = new ethers.JsonRpcProvider(config.network.rpcUrl);
  const startBlock = await provider.getBlockNumber();

  const POLL_INTERVAL_MS = 3000;
  const POLL_TIMEOUT_MS = 180_000;
  const startPoll = Date.now();

  let project;
  let completed = false;
  while (Date.now() - startPoll < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    project = await readEscrowState(contractAddress);
    if (project.milestones[milestoneId]?.completed) {
      completed = true;
      break;
    }
  }

  if (!completed) {
    throw new Error(
      "KeeperHub execution started but milestone not completed on-chain after 180s",
    );
  }

  // Pull tx hash from the MilestoneCompleted event. 0G indexers can lag —
  // retry with a widening window. If we still can't find it, fall back to
  // returning a contract address link so the user has somewhere to look.
  // The on-chain state is the source of truth; the tx hash is just for UX.
  let txHash = null;
  const lookbackBuffer = 5;
  const searchFrom = Math.max(0, startBlock - lookbackBuffer);

  // Lazy-load the artifact ABI for event filtering — avoid circular imports.
  const { readFileSync, existsSync } = await import("fs");
  const { fileURLToPath } = await import("url");
  const { dirname, join } = await import("path");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const artifactPath = join(
    __dirname,
    "../../../artifacts/contracts/MilestoneEscrow.sol/MilestoneEscrow.json",
  );
  let abi = null;
  if (existsSync(artifactPath)) {
    abi = JSON.parse(readFileSync(artifactPath, "utf8")).abi;
  }

  if (abi) {
    const contract = new ethers.Contract(contractAddress, abi, provider);
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        const filter = contract.filters.MilestoneCompleted(milestoneId);
        const events = await contract.queryFilter(filter, searchFrom);
        if (events.length > 0) {
          txHash = events[events.length - 1].transactionHash;
          break;
        }
      } catch (err) {
        console.log(`   ⚠️  Event query attempt ${attempt} errored — retrying`);
      }
      console.log(
        `   ⏳ Event not yet indexed (attempt ${attempt}/10) — waiting 3s...`,
      );
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log(
    txHash
      ? `   ✅ Tx confirmed: ${txHash.slice(0, 12)}...`
      : `   ✅ Milestone completed (tx hash unavailable — check ChainScan)`,
  );

  const completedMilestone = project.milestones[milestoneId];

  return {
    txHash: txHash || null,
    amountReleased: completedMilestone?.amountEth || null,
    payee: project.payee,
    agentGasRefunded: null, // KeeperHub MPC handles its own gas — no refund flow
    chainScanUrl: txHash
      ? `https://chainscan-galileo.0g.ai/tx/${txHash}`
      : `https://chainscan-galileo.0g.ai/address/${contractAddress}`,
  };
}

/**
 * Server-wallet fallback. Used when KEEPERHUB_WEBHOOK_URL is not set.
 * Signs completeMilestone() with the deployer key. NOT the production
 * path — only here to keep dev/test working without KH running.
 */
async function releaseViaServerWallet({ contractAddress, milestoneId }) {
  console.log("   ⚙️  Via server wallet (KH not configured)...");
  const release = await completeMilestoneOnChain(contractAddress, milestoneId);
  const project = await readEscrowState(contractAddress);
  return {
    txHash: release.txHash,
    amountReleased: release.milestone.amountEth,
    payee: project.payee,
    agentGasRefunded: null,
    chainScanUrl: release.txExplorerUrl,
  };
}

router.post("/verify", upload.array("images", 5), async (req, res) => {
  try {
    if (!config.anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY is not set in .env");
    }

    const { milestone: milestoneRaw, evidence = "" } = req.body ?? {};
    if (!milestoneRaw) {
      throw new Error("milestone (JSON-stringified) is required");
    }
    let milestone;
    try {
      milestone = JSON.parse(milestoneRaw);
    } catch {
      throw new Error("milestone must be valid JSON");
    }
    if (!milestone.name || !Array.isArray(milestone.acceptance_criteria)) {
      throw new Error("milestone must include name and acceptance_criteria[]");
    }

    // contractAddress + milestoneId are required if we want to actually
    // release on APPROVE. Without them, we can still verify but the
    // frontend has to handle release itself via the wallet-signed path.
    const contractAddress = req.body.contractAddress ?? null;
    const milestoneIdRaw = req.body.milestoneId ?? null;
    const milestoneId =
      milestoneIdRaw !== null ? Number.parseInt(milestoneIdRaw, 10) : null;

    const canRelease =
      contractAddress &&
      ethers.isAddress(contractAddress) &&
      Number.isInteger(milestoneId) &&
      milestoneId >= 0;

    // ─── Trust stack (always run on raw buffers) ────────────────
    const files = req.files ?? [];
    const provenanceResults = await Promise.all(
      files.map((f) =>
        runProvenanceChecks(f.buffer, f.mimetype, f.originalname).then((r) => ({
          ...r,
          filename: f.originalname,
        })),
      ),
    );

    // ─── Resize for Claude Vision (5MB base64 limit) ────────────
    const sharp = (await import("sharp")).default;
    const MAX_RAW_BYTES = 3_500_000;
    const images = await Promise.all(
      files.map(async (f) => {
        let buffer = f.buffer;
        let mediaType = f.mimetype;
        if (buffer.length > MAX_RAW_BYTES) {
          buffer = await sharp(f.buffer)
            .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
          mediaType = "image/jpeg";
        }
        return {
          base64: buffer.toString("base64"),
          mediaType,
          filename: f.originalname,
        };
      }),
    );

    // ─── Claude Vision verdict ──────────────────────────────────
    const verdict = await verifyEvidence(
      milestone,
      evidence,
      images,
      provenanceResults,
    );

    console.log(
      `   ${verdict.verdict === "APPROVE" ? "✅" : "🔼"} ${verdict.verdict} (${(
        (verdict.confidence ?? 0) * 100
      ).toFixed(0)}%)`,
    );

    // ─── Build response ─────────────────────────────────────────
    // Shape matches what frontend's apiVerifyEvidence expects:
    // { ok, result: { verdict, ..., releaseTxHash?, released?, ... }, provenance, meta }
    const result = {
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      reasoning: verdict.reasoning,
      criteria_check: verdict.criteria_check,
      provenance_assessment: verdict.provenance_assessment,
      pricing_assessment: verdict.pricing_assessment,
      milestone: milestone.name,
      milestoneId,
      released: false,
    };

    // ─── Release on APPROVE if we can ───────────────────────────
    if (verdict.verdict === "APPROVE" && canRelease) {
      console.log("   💸 Agent releasing funds...");
      try {
        const release = config.keeperHubWebhookUrl
          ? await releaseViaKeeperHub({ contractAddress, milestoneId })
          : await releaseViaServerWallet({ contractAddress, milestoneId });

        console.log(
          `   ✅ Released ${release.amountReleased} OG to ${release.payee}`,
        );

        result.released = true;
        result.releaseTxHash = release.txHash;
        result.amountReleased = release.amountReleased;
        result.payee = release.payee;
        result.agentGasRefunded = release.agentGasRefunded;
        result.chainScanUrl = release.chainScanUrl;

        // Cross-chain bookkeeping. Fire-and-forget — the user-facing result is
        // the 0G release; Sepolia ENS sync runs ~80s and shouldn't block the
        // verify response. Errors are logged; the frontend can retry via
        // /api/projects/sync-ens if the records look stale.
        const subname = req.body.subname ?? null;
        if (subname) {
          console.log(`   🌐 ENS sync: triggering for ${subname}...`);
          syncEscrowToEns({ subname, contractAddress })
            .then((sync) => {
              console.log(
                `   🌐 ENS sync done: ${sync.synced.length} written, ${sync.skipped.length} skipped, ${sync.errors.length} failed`,
              );
            })
            .catch((err) => {
              console.error(`   ❌ ENS sync failed: ${err.message}`);
            });
          result.ensSyncTriggered = true;
        } else {
          console.log("   ℹ️  No subname in request — skipping ENS sync");
          result.ensSyncTriggered = false;
        }
      } catch (releaseErr) {
        console.error("   ❌ Release failed:", releaseErr.message);
        result.released = false;
        result.releaseError = releaseErr.message;
      }
    } else if (verdict.verdict === "APPROVE" && !canRelease) {
      result.released = false;
      result.releaseError =
        "contractAddress + milestoneId required for autonomous release";
    } else {
      result.released = false;
      result.message =
        "Escalated to human review. Project owner can approve manually.";
    }

    res.json({
      ok: true,
      result,
      provenance: provenanceResults,
      meta: {
        imagesReceived: images.length,
        contractAddress,
        milestoneId,
        releasePath: config.keeperHubWebhookUrl ? "keeperhub" : "server-wallet",
      },
    });
  } catch (err) {
    if (err.name === "MulterError" || err.message?.startsWith("Unsupported")) {
      return sendError(res, err, 400);
    }
    const status = err.status >= 500 ? 502 : 400;
    sendError(res, err, status);
  }
});

export default router;
