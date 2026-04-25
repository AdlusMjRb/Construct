import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  network: {
    rpcUrl: process.env.ZG_RPC_URL || "https://evmrpc-testnet.0g.ai",
    chainId: parseInt(process.env.ZG_CHAIN_ID || "16602", 10),
    name: "0G Galileo Testnet",
  },
  privateKey: process.env.DEPLOYER_PRIVATE_KEY || null,
};
