import { Router } from "express";
import { generateMilestones } from "../services/claude.mjs";
import { config } from "../config.mjs";

const router = Router();

function sendError(res, err, status = 400) {
  console.error("Projects route error:", err.message);
  res.status(status).json({ ok: false, error: err.message });
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
    if (budget) {
      prompt += `\n\nTotal budget: ${budget} OG.`;
    }
    if (language) {
      prompt += `\n\nUser's preferred language: ${language}.`;
    }

    const spec = await generateMilestones(prompt);

    res.json({ ok: true, spec });
  } catch (err) {
    const status = err.status >= 500 ? 502 : 400;
    sendError(res, err, status);
  }
});

export default router;
