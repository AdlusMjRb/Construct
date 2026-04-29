import { ethers } from "ethers";

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL;
const SUBNAME = "tests-529a47.construct.eth";
const USER = "0xa89577Ad78D7cb264E1C4dE30096E0501Fc0280B";
const MPC = "0xFc49AFB213B4284D9Ab5c1175ACE87b65cf440ce";

const PUBLIC_RESOLVER = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5";

function namehash(name) {
  let node = "0x0000000000000000000000000000000000000000000000000000000000000000";
  if (!name) return node;
  const labels = name.split(".").reverse();
  for (const label of labels) {
    const labelHash = ethers.keccak256(ethers.toUtf8Bytes(label));
    node = ethers.keccak256(ethers.concat([node, labelHash]));
  }
  return node;
}

const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
const node = namehash(SUBNAME);

// Simulate USER calling setApprovalForAll on the resolver
const resolver = new ethers.Contract(
  PUBLIC_RESOLVER,
  ["function setApprovalForAll(address operator, bool approved) external"],
  provider,
);

try {
  await provider.call({
    to: PUBLIC_RESOLVER,
    from: USER,
    data: resolver.interface.encodeFunctionData("setApprovalForAll", [MPC, true]),
  });
  console.log("✅ Resolver.setApprovalForAll exists and would succeed for USER");
} catch (e) {
  console.log("❌ Resolver.setApprovalForAll simulation failed:", e.shortMessage || e.message);
}

// Also check per-token approval (newer ENS resolvers)
const tokenResolver = new ethers.Contract(
  PUBLIC_RESOLVER,
  ["function approve(bytes32 node, address delegate, bool approved) external"],
  provider,
);

try {
  await provider.call({
    to: PUBLIC_RESOLVER,
    from: USER,
    data: tokenResolver.interface.encodeFunctionData("approve", [node, MPC, true]),
  });
  console.log("✅ Resolver.approve(node, delegate, approved) exists and would succeed");
} catch (e) {
  console.log("❌ Resolver.approve simulation failed:", e.shortMessage || e.message);
}
