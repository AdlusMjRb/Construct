// scripts/register-construct-eth.mjs
// Hour 1 step 2: Register construct.eth, wrap directly into MPC with CANNOT_UNWRAP burned.
// Server wallet pays gas + fees. MPC wallet ends up holding the wrapped+locked NFT.

import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  namehash,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { randomBytes } from "crypto";

// === Config ===
const RPC = process.env.SEPOLIA_RPC_URL;
const SERVER_PK = process.env.DEPLOYER_PRIVATE_KEY;
const MPC_ADDRESS = process.env.KEEPERHUB_AGENT_ADDRESS;

if (!RPC) throw new Error("Set SEPOLIA_RPC_URL");
if (!SERVER_PK) throw new Error("Set DEPLOYER_PRIVATE_KEY");
if (!MPC_ADDRESS) throw new Error("Set KEEPERHUB_AGENT_ADDRESS");

// === Sepolia ENS contract addresses ===
const CONTROLLER = "0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968";
const BASE_REGISTRAR = "0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85";
const NAME_WRAPPER = "0x0635513f179D50A207757E05759CbD106d7dFcE8";
const PUBLIC_RESOLVER = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5";

// === Registration parameters ===
const LABEL = "construct";
const NAME = `${LABEL}.eth`;
const DURATION = 5n * 365n * 24n * 60n * 60n; // 5 years
const FUSE_CANNOT_UNWRAP = 1;
const COMMIT_WAIT_SECS = 65;

// === ABIs (minimal, copied from your Etherscan ABI paste) ===
const controllerAbi = [
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
  {
    type: "function",
    name: "makeCommitment",
    stateMutability: "pure",
    inputs: [
      {
        type: "tuple",
        name: "registration",
        components: [
          { name: "label", type: "string" },
          { name: "owner", type: "address" },
          { name: "duration", type: "uint256" },
          { name: "secret", type: "bytes32" },
          { name: "resolver", type: "address" },
          { name: "data", type: "bytes[]" },
          { name: "reverseRecord", type: "uint8" },
          { name: "referrer", type: "bytes32" },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "commit",
    stateMutability: "nonpayable",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "register",
    stateMutability: "payable",
    inputs: [
      {
        type: "tuple",
        name: "registration",
        components: [
          { name: "label", type: "string" },
          { name: "owner", type: "address" },
          { name: "duration", type: "uint256" },
          { name: "secret", type: "bytes32" },
          { name: "resolver", type: "address" },
          { name: "data", type: "bytes[]" },
          { name: "reverseRecord", type: "uint8" },
          { name: "referrer", type: "bytes32" },
        ],
      },
    ],
    outputs: [],
  },
];

const baseRegistrarAbi = [
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
];

const nameWrapperAbi = [
  {
    type: "function",
    name: "wrapETH2LD",
    stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "wrappedOwner", type: "address" },
      { name: "ownerControlledFuses", type: "uint16" },
      { name: "resolver", type: "address" },
    ],
    outputs: [{ name: "expires", type: "uint64" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
];

// === Setup clients ===
const account = privateKeyToAccount(
  SERVER_PK.startsWith("0x") ? SERVER_PK : `0x${SERVER_PK}`,
);
const transport = http(RPC);
const publicClient = createPublicClient({ chain: sepolia, transport });
const walletClient = createWalletClient({ account, chain: sepolia, transport });

console.log("========================================");
console.log("  Construct — Register construct.eth");
console.log("========================================\n");
console.log(`Server wallet (signer):    ${account.address}`);
console.log(`MPC wallet (final owner):  ${getAddress(MPC_ADDRESS)}`);
console.log(`Name to register:          ${NAME}`);
console.log(`Duration:                  5 years\n`);

// === Pre-flight ===
const chainId = await publicClient.getChainId();
if (chainId !== 11155111) {
  console.error(`❌ Wrong chain: ${chainId}. Expected Sepolia (11155111).`);
  process.exit(1);
}

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Server wallet balance: ${formatEther(balance)} ETH`);
if (balance < parseEther("0.02")) {
  console.error("❌ Need at least 0.02 ETH. Faucet up first.");
  process.exit(1);
}

const available = await publicClient.readContract({
  address: CONTROLLER,
  abi: controllerAbi,
  functionName: "available",
  args: [LABEL],
});
if (!available) {
  console.error(`❌ ${NAME} no longer available. Pick another name.`);
  process.exit(1);
}

const price = await publicClient.readContract({
  address: CONTROLLER,
  abi: controllerAbi,
  functionName: "rentPrice",
  args: [LABEL, DURATION],
});
const totalPrice = price.base + price.premium;
const padded = (totalPrice * 110n) / 100n;
console.log(
  `Rent: ${formatEther(totalPrice)} ETH (paying ${formatEther(padded)} with 10% pad)\n`,
);

// === 1. Commitment ===
const secret = `0x${randomBytes(32).toString("hex")}`;
console.log("🔑 SECRET — save this in case the script crashes mid-flow:");
console.log(`   ${secret}\n`);

const registration = {
  label: LABEL,
  owner: account.address, // server temporarily holds unwrapped name; we wrap → MPC after
  duration: DURATION,
  secret,
  resolver: PUBLIC_RESOLVER,
  data: [],
  reverseRecord: 0,
  referrer: `0x${"00".repeat(32)}`,
};

const commitment = await publicClient.readContract({
  address: CONTROLLER,
  abi: controllerAbi,
  functionName: "makeCommitment",
  args: [registration],
});
console.log(`Commitment: ${commitment}\n`);

console.log("→ commit()...");
const commitHash = await walletClient.writeContract({
  address: CONTROLLER,
  abi: controllerAbi,
  functionName: "commit",
  args: [commitment],
});
console.log(`  tx: ${commitHash}`);
await publicClient.waitForTransactionReceipt({ hash: commitHash });
console.log("  ✅ confirmed\n");

// === 2. Wait the commit age ===
console.log(`⏳ Waiting ${COMMIT_WAIT_SECS}s for min commitment age...`);
for (let i = COMMIT_WAIT_SECS; i > 0; i--) {
  process.stdout.write(`\r   ${i}s remaining...   `);
  await new Promise((r) => setTimeout(r, 1000));
}
console.log("\n   done.\n");

// === 3. Register ===
console.log("→ register()...");
const registerHash = await walletClient.writeContract({
  address: CONTROLLER,
  abi: controllerAbi,
  functionName: "register",
  args: [registration],
  value: padded,
});
console.log(`  tx: ${registerHash}`);
const registerReceipt = await publicClient.waitForTransactionReceipt({
  hash: registerHash,
});
if (registerReceipt.status !== "success") {
  console.error("❌ register reverted");
  process.exit(1);
}
console.log(`  ✅ ${NAME} registered, owned by server (unwrapped)\n`);

// === 4. Approve NameWrapper on BaseRegistrar ===
const isApproved = await publicClient.readContract({
  address: BASE_REGISTRAR,
  abi: baseRegistrarAbi,
  functionName: "isApprovedForAll",
  args: [account.address, NAME_WRAPPER],
});
if (!isApproved) {
  console.log("→ setApprovalForAll(NameWrapper, true)...");
  const approveHash = await walletClient.writeContract({
    address: BASE_REGISTRAR,
    abi: baseRegistrarAbi,
    functionName: "setApprovalForAll",
    args: [NAME_WRAPPER, true],
  });
  console.log(`  tx: ${approveHash}`);
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log("  ✅ confirmed\n");
} else {
  console.log("→ already approved on NameWrapper, skipping\n");
}

// === 5. Wrap → MPC, locked ===
console.log(
  `→ wrapETH2LD(label='${LABEL}', owner=MPC, fuses=CANNOT_UNWRAP)...`,
);
const wrapHash = await walletClient.writeContract({
  address: NAME_WRAPPER,
  abi: nameWrapperAbi,
  functionName: "wrapETH2LD",
  args: [LABEL, getAddress(MPC_ADDRESS), FUSE_CANNOT_UNWRAP, PUBLIC_RESOLVER],
});
console.log(`  tx: ${wrapHash}`);
const wrapReceipt = await publicClient.waitForTransactionReceipt({
  hash: wrapHash,
});
if (wrapReceipt.status !== "success") {
  console.error("❌ wrapETH2LD reverted");
  process.exit(1);
}
console.log("  ✅ wrapped + locked, NFT minted to MPC\n");

// === 6. Verify ===
const node = namehash(NAME);
const tokenId = BigInt(node);
const wrappedOwner = await publicClient.readContract({
  address: NAME_WRAPPER,
  abi: nameWrapperAbi,
  functionName: "ownerOf",
  args: [tokenId],
});

console.log("========================================");
console.log("  RESULTS");
console.log("========================================");
console.log(`Name:      ${NAME}`);
console.log(`Namehash:  ${node}`);
console.log(`TokenId:   ${tokenId}`);
console.log(`Owner:     ${wrappedOwner}`);
console.log(`Expected:  ${getAddress(MPC_ADDRESS)}`);

const finalBalance = await publicClient.getBalance({
  address: account.address,
});
console.log(
  `\nWallet now has: ${formatEther(finalBalance)} ETH (spent ${formatEther(balance - finalBalance)})`,
);

if (getAddress(wrappedOwner) === getAddress(MPC_ADDRESS)) {
  console.log(
    "\n🎉 SUCCESS — construct.eth is wrapped, locked (CANNOT_UNWRAP), owned by MPC.",
  );
  console.log("   Verify visually: https://sepolia.app.ens.domains/" + NAME);
} else {
  console.log("\n❌ Owner mismatch. Investigate before proceeding.");
}
