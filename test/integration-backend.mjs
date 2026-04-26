import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.API_BASE_URL || "http://localhost:3001";
const FIXTURE_IMAGE = path.join(__dirname, "fixtures", "test-evidence.jpg");

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

let stepNum = 0;
function step(label) {
  stepNum++;
  console.log(`\n${c.bold}${c.cyan}[${stepNum}] ${label}${c.reset}`);
}
function ok(msg) {
  console.log(`    ${c.green}✓${c.reset} ${msg}`);
}
function info(msg) {
  console.log(`    ${c.dim}${msg}${c.reset}`);
}
function warn(msg) {
  console.log(`    ${c.yellow}⚠${c.reset}  ${msg}`);
}
function fail(msg, err) {
  console.error(`    ${c.red}✗${c.reset} ${msg}`);
  if (err) console.error(`      ${c.red}${err.message || err}${c.reset}`);
  process.exit(1);
}

async function getJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body;
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body;
}

async function postMultipart(url, fields, files) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, v);
  }
  for (const [k, filepath] of Object.entries(files)) {
    const buf = fs.readFileSync(filepath);
    const blob = new Blob([buf], { type: "image/jpeg" });
    form.append(k, blob, path.basename(filepath));
  }
  const res = await fetch(url, { method: "POST", body: form });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body;
}

console.log(
  `\n${c.bold}Construct Backend — Integration Test${c.reset}\n` +
    `${c.dim}API: ${API}${c.reset}`,
);

const t0 = Date.now();

try {
  step("Health check");
  const health = await getJson(`${API}/api/health`);
  ok(`Server up — ${health.network.name} (chain ${health.network.chainId})`);

  step("Generate milestones + upload spec to 0G Storage");
  const t1 = Date.now();
  const gen = await postJson(`${API}/api/projects/generate`, {
    description:
      "Build a small garden shed: clear the site, pour a concrete slab, " +
      "frame and roof it. Roughly 2.5m by 2m.",
    budget: "0.01",
  });
  const elapsed1 = ((Date.now() - t1) / 1000).toFixed(1);
  ok(`${gen.spec.milestones.length} milestones generated (${elapsed1}s)`);
  info(`Title: "${gen.spec.project_title}"`);
  ok(`Storage upload: ${gen.storage.rootHash}`);
  info(
    `${gen.storage.specSize} bytes, ${gen.storage.elapsedMs}ms, ${gen.storage.attempts} attempt(s)`,
  );

  const storageHash = gen.storage.rootHash;
  const milestoneNames = gen.spec.milestones.map((m) => m.name);
  const percentages = gen.spec.milestones.map((m) => m.percentage);
  const firstMilestone = gen.spec.milestones[0];

  step("Deploy MilestoneEscrow on 0G Galileo");
  const t2 = Date.now();
  const deploy = await postJson(`${API}/api/escrow/deploy`, {
    milestones: milestoneNames,
    percentages,
    payee: "0xdf6cA46F65159658Ac52736CeBD806C16095B078",
    storageHash,
    budget: "0.01",
  });
  const elapsed2 = ((Date.now() - t2) / 1000).toFixed(1);
  ok(`Deployed at ${deploy.address} (${elapsed2}s)`);
  info(`Funded ${deploy.valueSentEth} OG (budget + 5% agent fee)`);
  info(`Tx: ${deploy.txHash}`);

  step("Read escrow state — confirm storage hash anchored on-chain");
  const state = await getJson(`${API}/api/escrow/${deploy.address}`);
  if (state.storageHash !== storageHash) {
    fail(
      `Storage hash mismatch! Sent ${storageHash}, contract reports ${state.storageHash}`,
    );
  }
  ok(`Storage hash matches contract state`);
  ok(
    `funded=${state.funded}, milestones=${state.milestoneCount}, balance=${state.escrowBalanceEth} OG`,
  );

  if (fs.existsSync(FIXTURE_IMAGE)) {
    step("Verify evidence with Claude Vision + trust stack");
    const t3 = Date.now();
    const verify = await postMultipart(
      `${API}/api/evidence/verify`,
      {
        milestone: JSON.stringify({
          name: firstMilestone.name,
          verification_confidence: firstMilestone.verification_confidence,
          acceptance_criteria: firstMilestone.acceptance_criteria,
        }),
        evidence: "Site cleared. Photo attached.",
        contractAddress: deploy.address,
        milestoneId: "0",
      },
      { images: FIXTURE_IMAGE },
    );
    const elapsed3 = ((Date.now() - t3) / 1000).toFixed(1);
    ok(
      `Verdict: ${verify.result.verdict} (confidence ${verify.result.confidence}, ${elapsed3}s)`,
    );
    info(
      `Trust: ${verify.provenance[0]?.trust_level || "n/a"} — ${verify.provenance[0]?.trust_summary?.slice(0, 80) || ""}...`,
    );
  } else {
    step("Verify evidence (SKIPPED)");
    warn(`No fixture image at ${FIXTURE_IMAGE}`);
    info(`Drop a test image there to enable this step`);
  }

  step("Complete milestone 0 — release payment");
  const t4 = Date.now();
  const done = await postJson(
    `${API}/api/escrow/${deploy.address}/complete/0`,
    {},
  );
  const elapsed4 = ((Date.now() - t4) / 1000).toFixed(1);
  ok(`Milestone 0 completed (${elapsed4}s)`);
  info(
    `Released ${done.milestone.amount.length > 0 ? `${(Number(done.milestone.amount) / 1e18).toFixed(4)} OG` : "0 OG"} to payee`,
  );
  info(`Tx: ${done.txHash}`);

  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\n${c.bold}${c.green}✓ All checks passed${c.reset} ${c.dim}(${totalElapsed}s total)${c.reset}\n`,
  );
  console.log(`${c.dim}Contract: ${c.reset}${deploy.explorerUrl}`);
  console.log(`${c.dim}Storage:  ${c.reset}${storageHash}\n`);
} catch (err) {
  fail("Integration test failed", err);
}
