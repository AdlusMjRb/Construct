import { Router } from "express";
import { readEscrowState } from "../services/blockchain.mjs";

const router = Router();

/**
 * GET /api/escrow/:address
 * Reads the full state of a deployed MilestoneEscrow on Galileo.
 */
router.get("/:address", async (req, res) => {
  try {
    const state = await readEscrowState(req.params.address);
    res.json(state);
  } catch (err) {
    console.error("Error reading escrow:", err.message);
    res.status(400).json({
      ok: false,
      error: err.message,
    });
  }
});

export default router;
