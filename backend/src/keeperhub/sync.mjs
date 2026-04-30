import { readEscrowState } from "./blockchain.mjs";
import { setTextRecord, readTextRecord } from "./ens.mjs";

/**
 * Reconcile a project's ENS records on Sepolia with its escrow state on 0G.
 * Reads chain state, diffs against current ENS values, writes only what's
 * changed. Idempotent and safe to call after any milestone release,
 * agent-driven or manual.
 *
 * Sequential writes only. KH's MPC nonce lock can't handle parallel sends
 * from the same wallet.
 *
 */
export async function syncEscrowToEns({ subname, contractAddress }) {
  if (!subname || typeof subname !== "string") {
    throw new Error("subname must be a non-empty string");
  }
  if (!subname.endsWith(".construct.eth")) {
    throw new Error("subname must be a *.construct.eth name");
  }

  const escrow = await readEscrowState(contractAddress);

  const completedCount = escrow.milestones.filter((m) => m.completed).length;
  const isFullyComplete = escrow.isFullyComplete;

  const desired = [{ key: "current_milestone", value: String(completedCount) }];
  if (isFullyComplete) {
    desired.push({ key: "status", value: "completed" });
  }

  const synced = [];
  const skipped = [];
  const errors = [];

  for (const { key, value } of desired) {
    let current;
    try {
      current = await readTextRecord({ subname, key });
    } catch (err) {
      // If the read fails, write anyway — better to over-write than skip
      // a record that might actually be stale.
      console.warn(
        `   ⚠️  sync-ens: read ${key} failed (${err.message}) — writing anyway`,
      );
      current = null;
    }

    if (current === value) {
      console.log(`   ⏭️  sync-ens: ${key} already "${value}" — skip`);
      skipped.push({ key, value });
      continue;
    }

    try {
      console.log(`   🔄 sync-ens: ${key} "${current ?? ""}" → "${value}"`);
      const result = await setTextRecord({ subname, key, value });
      synced.push({
        key,
        value,
        previous: current,
        executionId: result.executionId,
      });
    } catch (err) {
      console.error(`   ❌ sync-ens: ${key} write failed: ${err.message}`);
      errors.push({ key, value, error: err.message });
    }
  }

  return {
    subname,
    contractAddress,
    completedCount,
    isFullyComplete,
    synced,
    skipped,
    errors,
  };
}
