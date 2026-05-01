import { Router } from "express";
import { ethers } from "ethers";
import { config } from "../config.mjs";
import { readEscrowState } from "../keeperhub/blockchain.mjs";
import { readTextRecord } from "../keeperhub/ens.mjs";
import { getAllSubnames, getSubname } from "../storage/subname-registry.mjs";
import { setTextRecord } from "../keeperhub/ens.mjs";
import { updateSubname } from "../storage/subname-registry.mjs";

const router = Router();

const NAME_WRAPPER_ADDRESS = "0x0635513f179D50A207757E05759CbD106d7dFcE8";
const NAME_WRAPPER_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
];

let _sepoliaProvider = null;
function getSepoliaProvider() {
  if (_sepoliaProvider) return _sepoliaProvider;
  if (!config.sepoliaRpcUrl) {
    throw new Error("SEPOLIA_RPC_URL is not set in .env");
  }
  _sepoliaProvider = new ethers.JsonRpcProvider(config.sepoliaRpcUrl);
  return _sepoliaProvider;
}

function sendError(res, err, status = 400) {
  console.error("Handover route error:", err.message);
  // Guard against double-send: if we've already responded for any reason,
  // log and bail rather than crashing the process with ERR_HTTP_HEADERS_SENT.
  if (res.headersSent) {
    console.warn("   ⚠️  sendError: headers already sent, skipping.");
    return;
  }
  res.status(status).json({ ok: false, error: err.message });
}

/**
 * GET /api/projects/by-owner/:wallet
 *
 * Returns all subnames currently held by this wallet according to the
 * NameWrapper. The backend registry is the candidate set, but Construct always
 * re-verifies ownership on-chain via balanceOf, so transferred subnames
 * surface correctly regardless of registry staleness.
 */
router.get("/by-owner/:wallet", async (req, res) => {
  try {
    const wallet = req.params.wallet;
    if (!ethers.isAddress(wallet)) {
      throw new Error("wallet is not a valid address");
    }

    const all = await getAllSubnames();
    if (all.length === 0) {
      return res.json({ ok: true, wallet, owned: [] });
    }

    const provider = getSepoliaProvider();
    const wrapper = new ethers.Contract(
      NAME_WRAPPER_ADDRESS,
      NAME_WRAPPER_ABI,
      provider,
    );

    const checks = await Promise.all(
      all.map(async (entry) => {
        try {
          const balance = await wrapper.balanceOf(
            wallet,
            BigInt(entry.tokenId),
          );
          return balance > 0n ? entry : null;
        } catch (err) {
          console.warn(
            `   ⚠️  by-owner: balanceOf failed for ${entry.subname}: ${err.message}`,
          );
          return null;
        }
      }),
    );

    const owned = checks.filter(Boolean);

    // Sort newest first by updatedAt (handover/repoint touches updatedAt,
    // fresh mint sets both mintedAt and updatedAt). Recipients care most
    // about "what did I just receive" so newest-first is right.
    owned.sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.mintedAt).getTime();
      const bTime = new Date(b.updatedAt || b.mintedAt).getTime();
      return bTime - aTime;
    });

    console.log(
      `   🔎 by-owner: ${wallet} holds ${owned.length}/${all.length} known subnames`,
    );

    res.json({ ok: true, wallet, owned });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/load/:subname", async (req, res) => {
  try {
    const subname = req.params.subname;
    if (!subname.endsWith(".construct.eth")) {
      throw new Error("subname must be a *.construct.eth name");
    }

    // Step 1: read the records that point us at the old escrow.
    const [escrowAddress, escrowChain, status, payee] = await Promise.all([
      readTextRecord({ subname, key: "escrow_address" }),
      readTextRecord({ subname, key: "escrow_chain" }),
      readTextRecord({ subname, key: "status" }),
      readTextRecord({ subname, key: "payee" }),
    ]);

    if (!escrowAddress || !ethers.isAddress(escrowAddress)) {
      throw new Error(
        `No valid escrow_address text record on ${subname}. Cannot load.`,
      );
    }

    // Step 2: handed_over status means recipient needs a fresh deploy
    // regardless of escrow state. Return early with minimal redeploy payload.
    if (status === "handed_over") {
      // Try to recover the spec from storage so the recipient at least sees
      // the milestone set they're inheriting. If storage fetch fails, return
      // an empty milestone list and let the frontend handle that case.
      let originalSpec = null;
      try {
        const oldEscrow = await readEscrowState(escrowAddress);
        const { downloadSpec } = await import("../storage/storage.mjs");
        originalSpec = await downloadSpec(oldEscrow.storageHash);
        const remainingMilestones = oldEscrow.milestones.filter(
          (m) => !m.completed,
        );
        const mergedRemaining = remainingMilestones.map((onChain) => {
          const fromSpec = originalSpec?.milestones?.find(
            (s) => s.name === onChain.name,
          );
          return {
            name: onChain.name,
            percentage: onChain.percentage,
            amountEth: onChain.amountEth,
            description: fromSpec?.description ?? "",
            acceptance_criteria: fromSpec?.acceptance_criteria ?? [],
            verification_confidence:
              fromSpec?.verification_confidence ?? "medium",
          };
        });
        return res.json({
          ok: true,
          mode: "redeploy",
          inheritedFrom: {
            subname,
            oldEscrowAddress: escrowAddress,
            oldEscrowChain: escrowChain,
            oldStatus: status,
            oldPayee: payee,
            oldStorageHash: oldEscrow.storageHash,
          },
          project: {
            title: originalSpec?.project_title ?? "Inherited Project",
            summary: originalSpec?.project_summary ?? "",
            canonical_language: originalSpec?.canonical_language ?? "en",
            suggested_payee: payee,
          },
          remainingMilestones: mergedRemaining,
          completedCount:
            oldEscrow.milestones.length - remainingMilestones.length,
          totalCount: oldEscrow.milestones.length,
        });
      } catch (err) {
        // Old escrow gone or storage unreachable. Recipient can still
        // redeploy under this subname, just without the spec recovery.
        console.warn(`   ⚠️  load (handed_over fallback): ${err.message}`);
        return res.json({
          ok: true,
          mode: "redeploy",
          inheritedFrom: {
            subname,
            oldEscrowAddress: escrowAddress,
            oldEscrowChain: escrowChain,
            oldStatus: status,
            oldPayee: payee,
            oldStorageHash: "",
          },
          project: {
            title: "Inherited Project",
            summary: "",
            canonical_language: "en",
            suggested_payee: payee || "",
          },
          remainingMilestones: [],
          completedCount: 0,
          totalCount: 0,
        });
      }
    }

    // Step 3: status is in_progress (or unknown). Probe the escrow.
    let oldEscrow;
    try {
      oldEscrow = await readEscrowState(escrowAddress);
    } catch (err) {
      // Escrow doesn't exist on-chain anymore (testnet wipe, failed deploy).
      // Surface this clearly to the frontend rather than crashing.
      console.warn(
        `   ⚠️  load: escrow ${escrowAddress} not found on-chain (${err.message})`,
      );
      return res.json({
        ok: true,
        mode: "redeploy",
        inheritedFrom: {
          subname,
          oldEscrowAddress: escrowAddress,
          oldEscrowChain: escrowChain,
          oldStatus: status,
          oldPayee: payee,
          oldStorageHash: "",
        },
        project: {
          title: "Inherited Project",
          summary: "",
          canonical_language: "en",
          suggested_payee: payee || "",
        },
        remainingMilestones: [],
        completedCount: 0,
        totalCount: 0,
      });
    }

    const remainingMilestones = oldEscrow.milestones.filter(
      (m) => !m.completed,
    );

    // Step 4: fetch spec for milestone descriptions/criteria.
    let originalSpec = null;
    try {
      const { downloadSpec } = await import("../storage/storage.mjs");
      originalSpec = await downloadSpec(oldEscrow.storageHash);
    } catch (err) {
      console.warn(
        `   ⚠️  load: 0G Storage fetch failed for ${oldEscrow.storageHash}: ${err.message}`,
      );
    }

    // Step 5: decide mode based on completion. If everything is done, the
    // project is in the "completed" state — frontend shows a history view
    // instead of routing to Shutter 2 or 3.
    const mode = remainingMilestones.length === 0 ? "completed" : "continue";

    const mergedRemaining = remainingMilestones.map((onChain) => {
      const fromSpec = originalSpec?.milestones?.find(
        (s) => s.name === onChain.name,
      );
      return {
        name: onChain.name,
        percentage: onChain.percentage,
        amountEth: onChain.amountEth,
        description: fromSpec?.description ?? "",
        acceptance_criteria: fromSpec?.acceptance_criteria ?? [],
        verification_confidence: fromSpec?.verification_confidence ?? "medium",
      };
    });

    res.json({
      ok: true,
      mode,
      inheritedFrom: {
        subname,
        oldEscrowAddress: escrowAddress,
        oldEscrowChain: escrowChain,
        oldStatus: status,
        oldPayee: payee,
        oldStorageHash: oldEscrow.storageHash,
      },
      project: {
        title: originalSpec?.project_title ?? "Inherited Project",
        summary: originalSpec?.project_summary ?? "",
        canonical_language: originalSpec?.canonical_language ?? "en",
        suggested_payee: payee,
      },
      remainingMilestones: mergedRemaining,
      completedCount: oldEscrow.milestones.length - remainingMilestones.length,
      totalCount: oldEscrow.milestones.length,
    });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * POST /api/projects/handover
 *
 * Called by the sender's frontend after they've signed the NFT transfer
 * on Sepolia. Updates the OLD subname's records to reflect the handover:
 *   - status -> "handed_over"
 *   - handed_over_to -> recipient address
 */
router.post("/handover", async (req, res) => {
  try {
    const { subname, newOwner } = req.body ?? {};

    if (typeof subname !== "string" || !subname.endsWith(".construct.eth")) {
      throw new Error("subname must be a *.construct.eth name");
    }
    if (!ethers.isAddress(newOwner)) {
      throw new Error("newOwner is not a valid address");
    }

    console.log(`   🤝 handover: ${subname} → ${newOwner}`);

    // Update the local registry cache. Doesn't matter if the writes below
    // fail — the registry truth is "this subname now belongs to newOwner".
    try {
      await updateSubname(subname, { currentOwner: newOwner });
      console.log(`   📒 registry: ${subname} owner → ${newOwner}`);
    } catch (regErr) {
      console.warn(`   ⚠️  registry update failed: ${regErr.message}`);
    }

    // Mark the old subname as handed over. Sequential writes (KH nonce
    // lock — same constraint as set-records). Fire-and-forget on errors.
    const writes = [
      { key: "status", value: "handed_over" },
      { key: "handed_over_to", value: newOwner },
    ];

    const results = [];
    for (const w of writes) {
      try {
        const r = await setTextRecord({ subname, key: w.key, value: w.value });
        results.push({
          key: w.key,
          status: "confirmed",
          executionId: r.executionId,
        });
      } catch (err) {
        console.error(`   ❌ handover write ${w.key} failed: ${err.message}`);
        results.push({ key: w.key, status: "failed", error: err.message });
      }
    }

    res.json({
      ok: true,
      subname,
      newOwner,
      records: results,
    });
  } catch (err) {
    sendError(res, err, err.message?.includes("KH") ? 502 : 400);
  }
});

/**
 * POST /api/projects/repoint
 *
 * Called by the recipient's frontend AFTER they've deployed a fresh escrow
 * on 0G. Updates the inherited subname's text records to point at the new
 * escrow, flipping status back to "in_progress". The same NFT now anchors
 * a new project — that's the whole loop.
 *
 * The recipient must have granted resolver approval to the MPC wallet
 * BEFORE calling this (handled in the frontend deploy flow). Otherwise
 * the setText calls will revert with a permission error.
 *
 * Sequential writes (KH nonce lock — same constraint as set-records).
 *
 * Note: we do NOT re-write `handed_over_to` here. KeeperHub's web3 Write
 * Contract action rejects empty-string values as "missing" for `string`
 * ABI parameters, which would fail the workflow on the seventh write.
 * The status flip from "handed_over" → "in_progress" is the meaningful
 * state change; readers should treat the project as active based on
 * status alone, regardless of stale handed_over_to data.
 */
router.post("/repoint", async (req, res) => {
  try {
    const { subname, newEscrowAddress, newPayee, newMilestoneCount } =
      req.body ?? {};

    if (typeof subname !== "string" || !subname.endsWith(".construct.eth")) {
      throw new Error("subname must be a *.construct.eth name");
    }
    if (!ethers.isAddress(newEscrowAddress)) {
      throw new Error("newEscrowAddress is not a valid address");
    }
    if (!ethers.isAddress(newPayee)) {
      throw new Error("newPayee is not a valid address");
    }
    if (
      !Number.isInteger(newMilestoneCount) ||
      newMilestoneCount < 1 ||
      newMilestoneCount > 50
    ) {
      throw new Error("newMilestoneCount must be an integer between 1 and 50");
    }

    console.log(
      `   🔁 repoint: ${subname} → escrow ${newEscrowAddress} (${newMilestoneCount} milestones)`,
    );

    // The full record set, in deterministic order. Same shape as the
    // initial mint set-records. handed_over_to is intentionally omitted
    // — see header comment for why.
    const records = [
      { key: "escrow_address", value: newEscrowAddress },
      { key: "escrow_chain", value: "16602" },
      { key: "status", value: "in_progress" },
      { key: "payee", value: newPayee },
      { key: "milestone_count", value: String(newMilestoneCount) },
      { key: "current_milestone", value: "0" },
    ];

    const results = [];
    for (const r of records) {
      try {
        const result = await setTextRecord({
          subname,
          key: r.key,
          value: r.value,
        });
        results.push({
          key: r.key,
          status: "confirmed",
          executionId: result.executionId ?? null,
        });
      } catch (err) {
        console.error(`   ❌ repoint: ${r.key} failed: ${err.message}`);
        results.push({
          key: r.key,
          status: "failed",
          error: err?.message ?? String(err),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    // Update the local registry so by-owner lookups return the new
    // escrow address for this subname. Cosmetic — by-owner re-checks
    // ownership on-chain regardless, but keeping the cache fresh
    // matters for /load lookups which read it.
    try {
      await updateSubname(subname, { escrowAddress: newEscrowAddress });
      console.log(`   📒 registry: ${subname} escrow → ${newEscrowAddress}`);
    } catch (regErr) {
      console.warn(`   ⚠️  registry update failed: ${regErr.message}`);
    }

    const failedCount = results.filter((r) => r.status === "failed").length;
    if (failedCount === records.length) {
      throw new Error(
        `All repoint writes failed — check KH connectivity and that the recipient has granted resolver approval`,
      );
    }
    if (failedCount > 0) {
      console.warn(
        `   ⚠️  repoint: ${failedCount}/${records.length} writes failed for ${subname}`,
      );
    }

    res.json({
      ok: true,
      subname,
      newEscrowAddress,
      records: results,
    });
  } catch (err) {
    sendError(res, err, err.message?.includes("KH") ? 502 : 400);
  }
});

export default router;
