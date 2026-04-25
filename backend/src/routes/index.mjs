import { Router } from "express";
import healthRouter from "./health.mjs";
import escrowRouter from "./escrow.mjs";
import projectsRouter from "./projects.mjs";
import evidenceRouter from "./evidence.mjs";

const router = Router();

router.use("/health", healthRouter);
router.use("/escrow", escrowRouter);
router.use("/projects", projectsRouter);
router.use("/evidence", evidenceRouter);

export default router;
