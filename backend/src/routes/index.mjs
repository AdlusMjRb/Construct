import { Router } from "express";
import healthRouter from "./health.mjs";
import escrowRouter from "./escrow.mjs";

const router = Router();

router.use("/health", healthRouter);
router.use("/escrow", escrowRouter);

export default router;
