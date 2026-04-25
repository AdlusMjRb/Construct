import { Router } from "express";
import healthRouter from "./health.mjs";

const router = Router();

router.use("/health", healthRouter);

export default router;
