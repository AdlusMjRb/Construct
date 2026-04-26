// backend/src/routes/index.mjs
import { Router } from "express";
import healthRouter from "./health.mjs";
import escrowRouter from "./escrow.mjs";
import projectsRouter from "./projects.mjs";
import evidenceRouter from "./evidence.mjs";
import translateRouter from "./translate.mjs";

const router = Router();

router.use("/health", healthRouter);
router.use("/escrow", escrowRouter);
router.use("/projects", projectsRouter);
router.use("/evidence", evidenceRouter);
// Translate routes mount at the API root (not under a sub-path) because the
// frontend calls /api/translate and /api/translate-verification directly.
router.use("/", translateRouter);

export default router;
