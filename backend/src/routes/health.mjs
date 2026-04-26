import { Router } from "express";
import { config } from "../config.mjs";

const router = Router();

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
