import { ethers } from "ethers";
import { config } from "../config.mjs";

const SEPOLIA_RPC = config.sepoliaRpcUrl;
const NAME_WRAPPER_ADDRESS = "0x0635513f179D50A207757E05759CbD106d7dFcE8";
const CONSTRUCT_ETH_NODE =
  "0xa928fb464ab38cca42be101dfc290e4910c5d6bc5d904a454e9e198eb0856a08";
const PUBLIC_RESOLVER_ADDRESS = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5";
const NAME_WRAPPER_ABI = [
  "function ownerOf(uint256 id) view returns (address)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
];
const KH_PRIORITY_FEE_FLOOR_WEI = 1_000n;
let _sepoliaProvider = null;
function getSepoliaProvider() {
  if (_sepoliaProvider) return _sepoliaProvider;
  if (!SEPOLIA_RPC) {
    throw new Error("SEPOLIA_RPC_URL is not set in .env");
  }
  _sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  return _sepoliaProvider;
}

/**
 * Pre-flight check before firing any KH-signed Sepolia tx.
 *
 * KH's Web3 Write Contract action hardcodes maxPriorityFeePerGas at 0.1 gwei
 * on Sepolia, but computes maxFeePerGas dynamically from base fee. When base
 * fee drops below 0.1 gwei (Sepolia is bursty), the resulting tx violates
 * EIP-1559's max >= priority invariant and ethers v6 rejects it with
 * BAD_DATA before it reaches Turnkey to sign. The KH execution still shows
 * "running" so we waste 90s polling for a confirmation that will never come.
 *
 * This check fails fast with a clear message instead.
 */
async function ensureSepoliaGasReady() {
  const provider = getSepoliaProvider();
  const [block, network] = await Promise.all([
    provider.getBlock("latest"),
    provider.getNetwork(),
  ]);
  console.log("[gas-preflight]", {
    rpcUrl: SEPOLIA_RPC,
    chainId: network.chainId.toString(),
    blockNumber: block?.number,
    baseFeePerGasWei: block?.baseFeePerGas?.toString(),
    baseFeeGwei: block?.baseFeePerGas
      ? Number(block.baseFeePerGas) / 1e9
      : null,
  });
  if (!block?.baseFeePerGas) return; // pre-EIP-1559, shouldn't happen on Sepolia
  if (block.baseFeePerGas < KH_PRIORITY_FEE_FLOOR_WEI) {
    const baseGwei = Number(block.baseFeePerGas) / 1e9;
    throw new Error(
      `Sepolia base fee is ${baseGwei.toFixed(4)} gwei, below KeeperHub's ` +
        `hardcoded priority fee floor (0.1 gwei). The tx would be malformed. ` +
        `Wait for Sepolia base fee to recover or send a few self-txs to bump ` +
        `it. (Known KH bug — tracked in feedback.)`,
    );
  }
}

/**
 * Slugify a project title into a valid ENS label.
 * Lowercase, ASCII alphanumerics + hyphens only, max 63 chars.
 * Adds a 6-char suffix for uniqueness.
 */
export function slugifyLabel(title) {
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50); // leave room for suffix
  const suffix = ethers.hexlify(ethers.randomBytes(3)).slice(2); // 6 hex chars
  return `${base || "project"}-${suffix}`;
}

/**
 * Compute the ENS namehash for a subname.
 * subnameTokenId = uint256(namehash(label.construct.eth))
 */
export function computeSubnameTokenId(label) {
  const labelHash = ethers.keccak256(ethers.toUtf8Bytes(label));
  const node = ethers.keccak256(ethers.concat([CONSTRUCT_ETH_NODE, labelHash]));
  return BigInt(node);
}

/**
 * Compute namehash from a full ENS name (e.g. "tylers-tools.construct.eth").
 * The result is bytes32 (0x-prefixed, 64 hex chars). This IS the same value
 * as the subname tokenId, just expressed as bytes32 not uint256.
 */
export function namehash(name) {
  let node =
    "0x0000000000000000000000000000000000000000000000000000000000000000";
  if (!name) return node;
  const labels = name.split(".").reverse();
  for (const label of labels) {
    const labelHash = ethers.keccak256(ethers.toUtf8Bytes(label));
    node = ethers.keccak256(ethers.concat([node, labelHash]));
  }
  return node;
}

/**
 * Trigger KeeperHub mintSubname workflow and poll until the subname appears
 * in the target wallet on Sepolia.
 *
 * Returns { label, tokenId, fullName, txConfirmed: boolean }
 */
export async function mintSubname({
  label,
  ownerWallet,
  fuses = 65537,
  expiry,
}) {
  if (!config.keeperHubApiKey) {
    throw new Error("KEEPERHUB_API_KEY is not set in .env");
  }
  if (!config.keeperHubMintSubnameUrl) {
    throw new Error("KEEPERHUB_MINT_SUBNAME_URL is not set in .env");
  }
  if (!ethers.isAddress(ownerWallet)) {
    throw new Error("ownerWallet is not a valid address");
  }
  await ensureSepoliaGasReady();

  // Default expiry: max uint64 (effectively no expiry — child of construct.eth's expiry)
  const expiryValue = expiry ?? "18446744073709551615"; // uint64 max as STRING (KH schema requires it)

  const tokenId = computeSubnameTokenId(label);
  const fullName = `${label}.construct.eth`;

  console.log(
    `   🟦 mintSubname: triggering KH webhook for ${fullName} → ${ownerWallet}`,
  );

  const webhookRes = await fetch(config.keeperHubMintSubnameUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.keeperHubApiKey}`,
    },
    body: JSON.stringify({
      parentNode: CONSTRUCT_ETH_NODE,
      label,
      owner: ownerWallet,
      fuses,
      expiry: expiryValue,
    }),
  });

  if (!webhookRes.ok) {
    const text = await webhookRes.text();
    throw new Error(
      `KH mintSubname webhook failed (${webhookRes.status}): ${text}`,
    );
  }

  const webhookData = await webhookRes.json().catch(() => ({}));
  console.log(
    `   🟦 mintSubname: KH accepted, polling Sepolia for confirmation...`,
    webhookData,
  );

  // Poll NameWrapper for up to 90s — Sepolia blocks are ~12s, KH adds overhead
  const provider = getSepoliaProvider();
  const wrapper = new ethers.Contract(
    NAME_WRAPPER_ADDRESS,
    NAME_WRAPPER_ABI,
    provider,
  );

  const startedAt = Date.now();
  const timeoutMs = 90_000;
  const intervalMs = 4_000;

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const balance = await wrapper.balanceOf(ownerWallet, tokenId);
      if (balance > 0n) {
        const elapsed = Date.now() - startedAt;
        console.log(
          `   ✅ mintSubname: ${fullName} confirmed in ${ownerWallet} after ${elapsed}ms`,
        );
        return {
          label,
          fullName,
          tokenId: tokenId.toString(),
          ownerWallet,
          confirmedAt: new Date().toISOString(),
          elapsedMs: elapsed,
        };
      }
    } catch (err) {
      console.warn(`   ⚠️  poll error (will retry): ${err.message}`);
    }
  }

  throw new Error(
    `Subname ${fullName} not confirmed in ${ownerWallet} within ${timeoutMs}ms — check KH execution log`,
  );
}

export async function setTextRecord({ subname, key, value }) {
  if (!config.keeperHubApiKey) {
    throw new Error("KEEPERHUB_API_KEY is not set in .env");
  }
  if (!config.keeperHubSetTextUrl) {
    throw new Error("KEEPERHUB_SET_TEXT_URL is not set in .env");
  }
  if (!subname || typeof subname !== "string") {
    throw new Error("subname must be a non-empty string");
  }
  if (!key || typeof key !== "string") {
    throw new Error("key must be a non-empty string");
  }
  if (typeof value !== "string") {
    throw new Error("value must be a string (use empty string for no value)");
  }
  await ensureSepoliaGasReady();

  const node = namehash(subname);

  console.log(
    `   🟧 setText: ${subname} → ${key} = "${value.slice(0, 60)}${value.length > 60 ? "..." : ""}"`,
  );

  const webhookRes = await fetch(config.keeperHubSetTextUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.keeperHubApiKey}`,
    },
    body: JSON.stringify({ node, key, value }),
  });

  if (!webhookRes.ok) {
    const text = await webhookRes.text();
    throw new Error(
      `KH setText webhook failed (${webhookRes.status}): ${text}`,
    );
  }

  const webhookData = await webhookRes.json().catch(() => ({}));
  console.log(
    `   🟧 setText: KH accepted (executionId=${webhookData.executionId})`,
  );

  // Wait for the record to actually land. KH returns 200 immediately on
  // webhook accept; the tx confirmation comes later. We need to block here
  // so the next sequential setText doesn't race into KH's nonce lock.
  const provider = getSepoliaProvider();
  const resolver = new ethers.Contract(
    PUBLIC_RESOLVER_ADDRESS,
    ["function text(bytes32 node, string key) view returns (string)"],
    provider,
  );

  const startedAt = Date.now();
  const timeoutMs = 90_000;
  const intervalMs = 4_000;

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const onchain = await resolver.text(node, key);
      if (onchain === value) {
        const elapsed = Date.now() - startedAt;
        console.log(`   ✅ setText: ${key} confirmed on-chain in ${elapsed}ms`);
        return {
          subname,
          node,
          key,
          value,
          executionId: webhookData.executionId,
          status: "confirmed",
          elapsedMs: elapsed,
        };
      }
    } catch (err) {
      console.warn(`   ⚠️  setText poll error (will retry): ${err.message}`);
    }
  }

  throw new Error(
    `setText for ${key} not confirmed on ${subname} within ${timeoutMs}ms`,
  );
}

/**
 * Read a text record back from the resolver. Used for verification and for
 * inbound subname recognition (reading project state into the frontend).
 */
export async function readTextRecord({ subname, key }) {
  const provider = getSepoliaProvider();
  const resolver = new ethers.Contract(
    PUBLIC_RESOLVER_ADDRESS,
    ["function text(bytes32 node, string key) view returns (string)"],
    provider,
  );
  const node = namehash(subname);
  return await resolver.text(node, key);
}
