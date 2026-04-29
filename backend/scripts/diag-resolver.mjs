import { ethers } from "ethers";

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL;
const SUBNAME = "tests-529a47.construct.eth";
const USER = "0xa89577Ad78D7cb264E1C4dE30096E0501Fc0280B";
const MPC = "0xFc49AFB213B4284D9Ab5c1175ACE87b65cf440ce";

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
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
console.log("node:", node);
console.log("");

// Who does ENS Registry think owns this node?
const registry = new ethers.Contract(ENS_REGISTRY, [
  "function owner(bytes32 node) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
], provider);
const registryOwner = await registry.owner(node);
console.log("ENS Registry owner of node:", registryOwner);
console.log("(expected: NameWrapper if wrapped, user if not)");
console.log("");

// User → MPC approval on Registry?
const userApprovedMpcOnRegistry = await registry.isApprovedForAll(USER, MPC);
console.log("User → MPC approved on ENS Registry:", userApprovedMpcOnRegistry);

// NameWrapper → MPC approval on Registry? (might be the relevant one if NameWrapper is owner)
const nwApprovedMpcOnRegistry = await registry.isApprovedForAll(NAME_WRAPPER, MPC);
console.log("NameWrapper → MPC approved on ENS Registry:", nwApprovedMpcOnRegistry);
console.log("");

// Does PublicResolver have its own approval mechanism?
try {
  const resolver = new ethers.Contract(PUBLIC_RESOLVER, [
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
  ], provider);
  const resolverApproval = await resolver.isApprovedForAll(USER, MPC);
  console.log("User → MPC approved on PublicResolver itself:", resolverApproval);
} catch (e) {
  console.log("PublicResolver has no isApprovedForAll function:", e.shortMessage);
}

// NameWrapper approval (NFT transfers)
const wrapper = new ethers.Contract(NAME_WRAPPER, [
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function ownerOf(uint256 id) view returns (address)",
], provider);
const wrapperApproval = await wrapper.isApprovedForAll(USER, MPC);
console.log("User → MPC approved on NameWrapper:", wrapperApproval);

const wrappedOwner = await wrapper.ownerOf(BigInt(node));
console.log("NameWrapper.ownerOf(node):", wrappedOwner);
