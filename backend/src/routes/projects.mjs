import { Router } from "express";
import { ethers } from "ethers";
import { generateMilestones } from "../agent/claude.mjs";
import { uploadSpec } from "../storage/storage.mjs";
import { config } from "../config.mjs";

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

export default router;
