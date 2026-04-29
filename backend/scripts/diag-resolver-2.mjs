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

// Does PublicResolver expose isAuthorised(node, addr)?
console.log("--- PublicResolver authorisation surface ---");
for (const sig of [
  "function isAuthorised(bytes32 node, address addr) view returns (bool)",
  "function approved(bytes32 node, address operator) view returns (bool)",
  "function approvalsFor(bytes32 node, address operator) view returns (bool)",
]) {
  try {
    const r = new ethers.Contract(PUBLIC_RESOLVER, [sig], provider);
    const fname = sig.match(/function (\w+)/)[1];
    const result = await r[fname](node, MPC);
    console.log(`  PublicResolver.${fname}(node, MPC):`, result);
  } catch (e) {
    console.log(`  PublicResolver has no '${sig.match(/function (\w+)/)[1]}' (or call failed)`);
  }
}

console.log("");
console.log("--- NameWrapper authorisation surface ---");
for (const sig of [
  "function canModifyName(bytes32 node, address addr) view returns (bool)",
  "function isTokenOwnerOrApproved(bytes32 node, address addr) view returns (bool)",
  "function getApproved(uint256 tokenId) view returns (address)",
]) {
  try {
    const r = new ethers.Contract(NAME_WRAPPER, [sig], provider);
    const fname = sig.match(/function (\w+)/)[1];
    let result;
    if (fname === "getApproved") {
      result = await r[fname](BigInt(node));
    } else {
      result = await r[fname](node, MPC);
    }
    console.log(`  NameWrapper.${fname}:`, result);
  } catch (e) {
    console.log(`  NameWrapper has no '${sig.match(/function (\w+)/)[1]}' (or call failed)`);
  }
}
