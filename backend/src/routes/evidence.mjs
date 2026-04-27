import { Router } from "express";
import multer from "multer";
import { verifyEvidence } from "../agent/claude.mjs";
import { runProvenanceChecks } from "../trust-stack/provenance.mjs";
import { config } from "../config.mjs";

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

    const files = req.files ?? [];

    const provenanceResults = await Promise.all(
      files.map((f) =>
        runProvenanceChecks(f.buffer, f.mimetype, f.originalname).then((r) => ({
          ...r,
          filename: f.originalname,
        })),
      ),
    );

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

    const result = await verifyEvidence(
      milestone,
      evidence,
      images,
      provenanceResults,
    );

    res.json({
      ok: true,
      result,
      provenance: provenanceResults,
      meta: {
        imagesReceived: images.length,
        contractAddress: req.body.contractAddress ?? null,
        milestoneId: req.body.milestoneId ?? null,
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
