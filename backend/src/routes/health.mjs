import { Router } from "express";
import { config } from "../config.mjs";

const router = Router();

/**
 * GET /api/health
 * Smoke test — confirms the server is up and reports its config.
 * No external calls, just a fast yes/no.
 */
router.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "construct-backend",
    network: {
      name: config.network.name,
      chainId: config.network.chainId,
      rpcUrl: config.network.rpcUrl,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
