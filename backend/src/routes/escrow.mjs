import { Router } from "express";
import {
  readEscrowState,
  deployEscrow,
  fundEscrow,
  completeMilestoneOnChain,
} from "../services/blockchain.mjs";

const router = Router();

function sendError(res, err, status = 400) {
  console.error("Escrow route error:", err.message);
  res.status(status).json({ ok: false, error: err.message });
}

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
