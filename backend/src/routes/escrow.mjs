import { Router } from "express";
import { ethers } from "ethers";
import { config } from "../config.mjs";
import {
  readEscrowState,
  deployEscrow,
  fundEscrow,
  completeMilestoneOnChain,
} from "../keeperhub/blockchain.mjs";
import { uploadSpec } from "../storage/storage.mjs";

const router = Router();

function sendError(res, err, status = 400) {
  console.error("Escrow route error:", err.message);
  res.status(status).json({ ok: false, error: err.message });
}

let cachedSigner = null;
function getSigner() {
  if (cachedSigner) return cachedSigner;
  if (!config.privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is not set in .env");
  }
  const provider = new ethers.JsonRpcProvider(config.network.rpcUrl);
  cachedSigner = new ethers.Wallet(config.privateKey, provider);
  return cachedSigner;
}

let _artifactCache = null;
async function loadEscrowArtifact() {
  if (_artifactCache) return _artifactCache;
  const fs = await import("fs");
  const path = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const p = path.join(
    __dirname,
    "../../../artifacts/contracts/MilestoneEscrow.sol/MilestoneEscrow.json",
  );
  _artifactCache = JSON.parse(fs.readFileSync(p, "utf8"));
  return _artifactCache;
}
router.post("/prepare", async (req, res) => {
  try {
    const {
      milestones,
      developerWallet,
      projectTitle,
      projectSummary,
      totalBudget,
      canonical_language: canonicalLanguage,
    } = req.body ?? {};

    if (!Array.isArray(milestones) || milestones.length === 0) {
      throw new Error("milestones must be a non-empty array");
    }
    if (!ethers.isAddress(developerWallet)) {
      throw new Error("developerWallet is not a valid address");
    }
    if (!totalBudget || Number(totalBudget) <= 0) {
      throw new Error("totalBudget must be a positive number");
    }

    const spec = {
      project_title: projectTitle || "Untitled Project",
      project_summary: projectSummary || "",
      total_budget: `${totalBudget} OG`,
      canonical_language: canonicalLanguage || "en",
      milestones,
    };

    const t0 = Date.now();
    const storage = await uploadSpec(spec, getSigner());
    console.log(
      `   ✅ /prepare upload: ${storage.rootHash} ` +
        `(${Date.now() - t0}ms, ${storage.attempts} attempt(s))`,
    );

    const signer = getSigner();
    const artifact = await loadEscrowArtifact();

    res.json({
      ok: true,
      contract: {
        abi: artifact.abi,
        bytecode: artifact.bytecode,
      },
      storageHash: storage.rootHash,
      storageScanUrl: "https://storagescan-galileo.0g.ai/submissions",
      agentAddress: signer.address,
      budget: totalBudget,
    });
  } catch (err) {
    sendError(res, err, err.status >= 500 ? 502 : 400);
  }
});

router.post("/deploy", async (req, res) => {
  try {
    const result = await deployEscrow(req.body ?? {});
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:address/fund", async (req, res) => {
  try {
    const result = await fundEscrow(req.params.address);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:address/complete/:milestoneId", async (req, res) => {
  try {
    const milestoneId = Number(req.params.milestoneId);
    const result = await completeMilestoneOnChain(
      req.params.address,
      milestoneId,
    );
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/:address", async (req, res) => {
  try {
    const state = await readEscrowState(req.params.address);
    res.json(state);
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
