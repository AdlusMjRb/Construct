import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(__dirname, "../../data/subnames.json");

async function ensureFile() {
  const dir = dirname(REGISTRY_PATH);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  if (!existsSync(REGISTRY_PATH)) {
    await writeFile(REGISTRY_PATH, "[]", "utf8");
  }
}

async function readAll() {
  await ensureFile();
  const raw = await readFile(REGISTRY_PATH, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("⚠️  subnames.json corrupt — resetting to []");
    return [];
  }
}

async function writeAll(entries) {
  await ensureFile();
  await writeFile(REGISTRY_PATH, JSON.stringify(entries, null, 2), "utf8");
}

/**
 * Record a freshly minted subname. Called from /api/projects/mint-subname
 * after KH confirms the mint on Sepolia.
 *
 * `currentOwner` is a cache, by-owner lookups always re-verify against
 * NameWrapper.balanceOf, so a stale value here is harmless.
 */
export async function registerSubname({
  subname,
  tokenId,
  currentOwner,
  escrowAddress,
}) {
  const entries = await readAll();

  // Idempotent: if the subname already exists, update the row instead of
  // appending. Prevents duplicate entries if mint-subname is retried.
  const idx = entries.findIndex((e) => e.subname === subname);
  const row = {
    subname,
    tokenId,
    currentOwner,
    escrowAddress,
    mintedAt: idx >= 0 ? entries[idx].mintedAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) entries[idx] = row;
  else entries.push(row);

  await writeAll(entries);
  return row;
}

/**
 * Update fields on an existing subname row. Used by the repoint flow
 * (recipient deploys a new escrow → escrowAddress changes for the same
 * subname) and by handover-status updates.
 */
export async function updateSubname(subname, patch) {
  const entries = await readAll();
  const idx = entries.findIndex((e) => e.subname === subname);
  if (idx < 0) {
    throw new Error(`Subname not in registry: ${subname}`);
  }
  entries[idx] = {
    ...entries[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeAll(entries);
  return entries[idx];
}

export async function getAllSubnames() {
  return await readAll();
}

export async function getSubname(subname) {
  const entries = await readAll();
  return entries.find((e) => e.subname === subname) ?? null;
}
