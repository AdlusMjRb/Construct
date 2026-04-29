import { defineChain } from "viem";
import { sepolia as viemSepolia } from "viem/chains";

// Escrow contracts and 0G Storage stay on Galileo.
export const ogGalileo = defineChain({
  id: 16602,
  name: "0G Galileo Testnet",
  nativeCurrency: { name: "OG", symbol: "OG", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://evmrpc-testnet.0g.ai"] },
  },
  blockExplorers: {
    default: { name: "ChainScan", url: "https://chainscan-galileo.0g.ai" },
  },
  testnet: true,
});

// Sepolia used for ENS; construct.eth and all wrapped subnames
export const sepolia = defineChain({
  ...viemSepolia,
  rpcUrls: {
    default: {
      http: [
        import.meta.env.VITE_SEPOLIA_RPC_URL ||
          "https://ethereum-sepolia-rpc.publicnode.com",
      ],
    },
  },
});
