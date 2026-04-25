import express from "express";
import cors from "cors";
import { config } from "./config.mjs";
import routes from "./routes/index.mjs";
import "reflect-metadata";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api", routes);

const server = app.listen(config.port, () => {
  console.log("─".repeat(60));
  console.log(`  Construct Backend`);
  console.log("─".repeat(60));
  console.log(`  Listening on http://localhost:${config.port}`);
  console.log(
    `  Network:     ${config.network.name} (chainId ${config.network.chainId})`,
  );
  console.log(`  RPC:         ${config.network.rpcUrl}`);
  console.log("─".repeat(60));
});

process.on("SIGINT", () => {
  console.log("\n  Shutting down…");
  server.close(() => process.exit(0));
});
