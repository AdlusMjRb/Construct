import { ethers } from "ethers";

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL;
const SUBNAME = "tests-529a47.construct.eth";
const USER = "0xa89577Ad78D7cb264E1C4dE30096E0501Fc0280B";
const MPC = "0xFc49AFB213B4284D9Ab5c1175ACE87b65cf440ce";

const PUBLIC_RESOLVER = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5";
const NAME_WRAPPER = "0x0635513f179D50A207757E05759CbD106d7dFcE8";

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

console.log("Trying setText as MPC via eth_call (simulates the tx without sending)...");
const resolver = new ethers.Contract(
  PUBLIC_RESOLVER,
  ["function setText(bytes32 node, string key, string value) external"],
  provider,
);

try {
  await provider.call({
    to: PUBLIC_RESOLVER,
    from: MPC,
    data: resolver.interface.encodeFunctionData("setText", [node, "diag", "test"]),
  });
  console.log("✅ Simulation succeeded as MPC — would write");
} catch (e) {
  console.log("❌ Simulation failed as MPC:", e.shortMessage || e.message);
}

console.log("");
console.log("Trying same call as USER (the wrapped owner)...");
try {
  await provider.call({
    to: PUBLIC_RESOLVER,
    from: USER,
    data: resolver.interface.encodeFunctionData("setText", [node, "diag", "test"]),
  });
  console.log("✅ Simulation succeeded as USER — would write");
} catch (e) {
  console.log("❌ Simulation failed as USER:", e.shortMessage || e.message);
}

console.log("");
console.log("Trying same call as NameWrapper (the registry-level owner)...");
try {
  await provider.call({
    to: PUBLIC_RESOLVER,
    from: NAME_WRAPPER,
    data: resolver.interface.encodeFunctionData("setText", [node, "diag", "test"]),
  });
  console.log("✅ Simulation succeeded as NameWrapper — would write");
} catch (e) {
  console.log("❌ Simulation failed as NameWrapper:", e.shortMessage || e.message);
}

// Get the bytecode size and first few bytes — sometimes you can identify which version
console.log("");
const code = await provider.getCode(PUBLIC_RESOLVER);
console.log("Resolver bytecode size:", code.length, "chars");
console.log("Resolver bytecode starts:", code.slice(0, 100));
