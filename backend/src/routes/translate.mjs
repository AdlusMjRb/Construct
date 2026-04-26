import { Router } from "express";
import {
  translateMilestones,
  translateVerification,
} from "../services/claude.mjs";
import { config } from "../config.mjs";

const router = Router();

function sendError(res, err, status = 400) {
  console.error("Translate route error:", err.message);
  res.status(status).json({ ok: false, error: err.message });
}

router.post("/translate", async (req, res) => {
  try {
    if (!config.anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY is not set in .env");
    }
    const { spec, targetLang } = req.body ?? {};
    if (!spec || typeof spec !== "object") {
      throw new Error("spec is required");
    }
    if (!targetLang || typeof targetLang !== "string") {
      throw new Error("targetLang is required");
    }
    const translated = await translateMilestones(spec, targetLang);
    res.json({ ok: true, spec: translated });
  } catch (err) {
    const status = err.status >= 500 ? 502 : 400;
    sendError(res, err, status);
  }
});

router.post("/translate-verification", async (req, res) => {
  try {
    if (!config.anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY is not set in .env");
    }
    const { result, targetLang } = req.body ?? {};
    if (!result || typeof result !== "object") {
      throw new Error("result is required");
    }
    if (!targetLang || typeof targetLang !== "string") {
      throw new Error("targetLang is required");
    }
    const translated = await translateVerification(result, targetLang);
    res.json({ ok: true, result: translated });
  } catch (err) {
    const status = err.status >= 500 ? 502 : 400;
    sendError(res, err, status);
  }
});

export default router;
