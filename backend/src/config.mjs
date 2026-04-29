// backend/src/config.mjs
import "dotenv/config";
import { tmpdir } from "os";

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  network: {
    rpcUrl: process.env.ZG_RPC_URL || "https://evmrpc-testnet.0g.ai",
    chainId: parseInt(process.env.ZG_CHAIN_ID || "16602", 10),
    name: "0G Galileo Testnet",
  },
  privateKey: process.env.DEPLOYER_PRIVATE_KEY || null,
  anthropicKey: process.env.ANTHROPIC_API_KEY || null,
  keeperHubAgentAddress: process.env.KEEPERHUB_AGENT_ADDRESS || null,
  keeperHubWebhookUrl: process.env.KEEPERHUB_WEBHOOK_URL || null,
  keeperHubMintSubnameUrl: process.env.KEEPERHUB_MINT_SUBNAME_URL || null,
  keeperHubApiKey: process.env.KEEPERHUB_API_KEY || null,
  keeperHubSetTextUrl: process.env.KEEPERHUB_SET_TEXT_URL || null,
  sepoliaRpcUrl: process.env.SEPOLIA_RPC_URL,
  storage: {
    indexerRpc:
      process.env.ZG_STORAGE_INDEXER_RPC ||
      "https://indexer-storage-testnet-turbo.0g.ai",
    tempDir: tmpdir(),
  },
};
