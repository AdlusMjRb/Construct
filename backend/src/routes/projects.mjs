import { Router } from "express";
import { ethers } from "ethers";
import { generateMilestones } from "../agent/claude.mjs";
import { uploadSpec } from "../storage/storage.mjs";
import { config } from "../config.mjs";
import {
  mintSubname,
  slugifyLabel,
  setTextRecord,
  readTextRecord,
} from "../keeperhub/ens.mjs";
import { syncEscrowToEns } from "../keeperhub/sync.mjs";
import { registerSubname } from "../storage/subname-registry.mjs";

const router = Router();

function sendError(res, err, status = 400) {
  console.error("Projects route error:", err.message);
  res.status(status).json({ ok: false, error: err.message });
}

let cachedSigner = null;
function getSigner() {
  if (cachedSigner) return cachedSigner;
  if (!config.privateKey) {
    throw new Error(
      "DEPLOYER_PRIVATE_KEY is not set — required for 0G Storage uploads",
    );
  }
  const provider = new ethers.JsonRpcProvider(config.network.rpcUrl);
  cachedSigner = new ethers.Wallet(config.privateKey, provider);
  return cachedSigner;
}

router.post("/generate", async (req, res) => {
  try {
    if (!config.anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY is not set in .env");
    }

    const { description, budget, language } = req.body ?? {};
    if (typeof description !== "string" || description.trim().length === 0) {
      throw new Error("description is required");
    }

    let prompt = description.trim();
    if (budget) prompt += `\n\nTotal budget: ${budget} OG.`;
    if (language) prompt += `\n\nUser's preferred language: ${language}.`;

    const spec = await generateMilestones(prompt);

    const t0 = Date.now();
    const storage = await uploadSpec(spec, getSigner());
    const elapsedMs = Date.now() - t0;

    console.log(
      `   ✅ 0G Storage upload: rootHash=${storage.rootHash} ` +
        `(${elapsedMs}ms, ${storage.attempts} attempt(s), ${storage.specSize} bytes)`,
    );

    res.json({
      ok: true,
      spec,
      storage: { ...storage, elapsedMs },
    });
  } catch (err) {
    const status = err.status >= 500 ? 502 : 400;
    sendError(res, err, status);
  }
});

router.post("/mint-subname", async (req, res) => {
  try {
    const { escrowAddress, userWallet, projectTitle } = req.body ?? {};

    if (!ethers.isAddress(escrowAddress)) {
      throw new Error("escrowAddress is not a valid address");
    }
    if (!ethers.isAddress(userWallet)) {
      throw new Error("userWallet is not a valid address");
    }
    if (typeof projectTitle !== "string" || projectTitle.trim().length === 0) {
      throw new Error("projectTitle is required");
    }

    const label = slugifyLabel(projectTitle);
    const result = await mintSubname({
      label,
      ownerWallet: userWallet,
    });

    // Persist to local registry so by-owner lookups can find this project.
    // Don't fail the whole mint response if the write hiccups — the user
    // gets their subname regardless. Roadmap: real DB.
    try {
      await registerSubname({
        subname: result.fullName,
        tokenId: result.tokenId,
        currentOwner: userWallet,
        escrowAddress,
      });
      console.log(`   📒 registry: recorded ${result.fullName}`);
    } catch (regErr) {
      console.error(`   ⚠️  registry write failed: ${regErr.message}`);
    }

    res.json({
      ok: true,
      ...result,
      escrowAddress,
      sepoliaScanUrl: `https://sepolia.app.ens.domains/${result.fullName}`,
    });
  } catch (err) {
    sendError(res, err, err.message?.includes("KH") ? 502 : 400);
  }
});

router.post("/set-text", async (req, res) => {
  try {
    const { subname, key, value } = req.body ?? {};
    const result = await setTextRecord({ subname, key, value });
    res.json({ ok: true, ...result });
  } catch (err) {
    sendError(res, err, err.message?.includes("KH") ? 502 : 400);
  }
});

router.post("/set-records", async (req, res) => {
  try {
    const { subname, escrowAddress, payeeAddress, milestoneCount } =
      req.body ?? {};

    if (typeof subname !== "string" || !subname.endsWith(".construct.eth")) {
      throw new Error("subname must be a *.construct.eth name");
    }
    if (!ethers.isAddress(escrowAddress)) {
      throw new Error("escrowAddress is not a valid address");
    }
    if (!ethers.isAddress(payeeAddress)) {
      throw new Error("payeeAddress is not a valid address");
    }
    if (
      !Number.isInteger(milestoneCount) ||
      milestoneCount < 1 ||
      milestoneCount > 50
    ) {
      throw new Error("milestoneCount must be an integer between 1 and 50");
    }

    // Initial schema. project_manifest is populated on completion with the
    // 0G Storage hash of the full manifest, so we skip the empty stub here.
    const records = [
      { key: "escrow_address", value: escrowAddress },
      { key: "escrow_chain", value: "16602" },
      { key: "status", value: "in_progress" },
      { key: "payee", value: payeeAddress },
      { key: "milestone_count", value: String(milestoneCount) },
      { key: "current_milestone", value: "0" },
    ];

    console.log(
      `   🟧 set-records: firing ${records.length} sequential setText calls for ${subname}`,
    );

    // Sequential fire — KH's nonce lock can't handle parallel sends from the
    // same MPC wallet. Each setText must complete (or fail) before the next.
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
          status: "submitted",
          executionId: result.executionId ?? null,
        });
      } catch (err) {
        results.push({
          key: r.key,
          status: "failed",
          error: err?.message ?? String(err),
        });
      }
    }

    const failedCount = results.filter((r) => r.status === "failed").length;
    if (failedCount === records.length) {
      throw new Error(
        `All ${records.length} text record writes failed — check KH connectivity`,
      );
    }
    if (failedCount > 0) {
      console.warn(
        `   ⚠️  set-records: ${failedCount}/${records.length} writes failed for ${subname}`,
      );
    }

    res.json({
      ok: true,
      subname,
      submitted: records.length - failedCount,
      total: records.length,
      records: results,
    });
  } catch (err) {
    sendError(res, err, err.message?.includes("KH") ? 502 : 400);
  }
});

router.post("/sync-ens", async (req, res) => {
  try {
    const { contractAddress, subname } = req.body ?? {};

    if (!ethers.isAddress(contractAddress)) {
      throw new Error("contractAddress is not a valid address");
    }
    if (typeof subname !== "string" || !subname.endsWith(".construct.eth")) {
      throw new Error("subname must be a *.construct.eth name");
    }

    console.log(`   🌐 sync-ens (manual): ${subname} ↔ ${contractAddress}`);

    const result = await syncEscrowToEns({ subname, contractAddress });

    const failedCount = result.errors.length;
    if (
      failedCount > 0 &&
      result.synced.length === 0 &&
      result.skipped.length === 0
    ) {
      throw new Error(
        `All ENS sync writes failed — check KH connectivity. First error: ${result.errors[0]?.error}`,
      );
    }

    res.json({ ok: true, ...result });
  } catch (err) {
    sendError(res, err, err.message?.includes("KH") ? 502 : 400);
  }
});

router.get("/read-text", async (req, res) => {
  try {
    const { subname, key } = req.query;
    const value = await readTextRecord({ subname, key });
    res.json({ ok: true, subname, key, value });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
