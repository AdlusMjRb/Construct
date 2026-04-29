import { createPublicClient, http, formatEther } from "viem";
import { sepolia } from "viem/chains";

const RPC = process.env.SEPOLIA_RPC_URL;
if (!RPC || RPC.includes("rpc.sepolia.org")) {
  console.error(
    "Set SEPOLIA_RPC_URL to an Alchemy/Infura endpoint. Public rpc.sepolia.org is unreliable for ENS calls.",
  );
  process.exit(1);
}

// Sepolia ETHRegistrarController (2025 redeploy with referrer field)
const CONTROLLER = "0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968";

const abi = [
  {
    type: "function",
    name: "available",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "rentPrice",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "duration", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "base", type: "uint256" },
          { name: "premium", type: "uint256" },
        ],
      },
    ],
  },
];

const candidates = [
  "construct",
  "useconstruct",
  "paxmata",
  "constructxyz",
  "getconstruct",
  "construct-app",
];

const ONE_YEAR = 365n * 24n * 60n * 60n; // 31_536_000

const client = createPublicClient({ chain: sepolia, transport: http(RPC) });

console.log(
  `\nChecking Sepolia name availability\nController: ${CONTROLLER}\n`,
);

const results = [];
for (const label of candidates) {
  try {
    const available = await client.readContract({
      address: CONTROLLER,
      abi,
      functionName: "available",
      args: [label],
    });
    let priceWei = 0n;
    if (available) {
      const p = await client.readContract({
        address: CONTROLLER,
        abi,
        functionName: "rentPrice",
        args: [label, ONE_YEAR],
      });
      priceWei = p.base + p.premium;
    }
    results.push({
      label,
      available,
      priceEth: available ? formatEther(priceWei) : null,
    });
    console.log(
      `  ${available ? "✅" : "❌"}  ${label}.eth${available ? `  — ${formatEther(priceWei)} ETH / yr` : ""}`,
    );
  } catch (e) {
    console.log(
      `  ⚠️   ${label}.eth — reverted: ${e.shortMessage || e.message}`,
    );
    results.push({
      label,
      available: null,
      error: e.shortMessage || e.message,
    });
  }
}

const winner = results.find((r) => r.available === true);
console.log(
  "\n" +
    (winner
      ? `→ Pick: ${winner.label}.eth  (${winner.priceEth} ETH for 1 year)`
      : "→ None available. Broaden the candidate list before committing."),
);
