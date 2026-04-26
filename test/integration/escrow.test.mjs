import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getJson,
  postJson,
  assertServerUp,
  TEST_PAYEE,
  SHED_DESCRIPTION,
} from "./helpers.mjs";

const ctx = {
  storageHash: null,
  spec: null,
  contractAddress: null,
};

test("escrow lifecycle", async (t) => {
  await assertServerUp();

  await t.test("generate spec for the deploy step", async () => {
    t.diagnostic("Generates a real spec and uploads to 0G — ~15-25s");
    const { status, body } = await postJson("/api/projects/generate", {
      description: SHED_DESCRIPTION,
      budget: "0.01",
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    ctx.storageHash = body.storage.rootHash;
    ctx.spec = body.spec;
  });

  await t.test(
    "POST /api/escrow/prepare — returns contract artifact + hash",
    async () => {
      t.diagnostic("Uploads spec to 0G again for prepare path — ~15s");
      const { status, body } = await postJson("/api/escrow/prepare", {
        milestones: ctx.spec.milestones,
        developerWallet: TEST_PAYEE,
        projectTitle: ctx.spec.project_title,
        projectSummary: ctx.spec.project_summary,
        totalBudget: "0.01",
        canonical_language: "en",
      });
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.ok(Array.isArray(body.contract.abi), "returns contract ABI");
      assert.ok(
        body.contract.bytecode.startsWith("0x"),
        "returns contract bytecode",
      );
      assert.ok(
        body.storageHash.startsWith("0x"),
        "returns 0G storage root hash",
      );
      assert.ok(body.agentAddress.startsWith("0x"), "returns agent address");
    },
  );

  await t.test(
    "POST /api/escrow/deploy — deploys with real storage hash",
    async () => {
      t.diagnostic("Deploys + funds in one tx on 0G Galileo — ~10-30s");
      const { status, body } = await postJson("/api/escrow/deploy", {
        milestones: ctx.spec.milestones.map((m) => m.name),
        percentages: ctx.spec.milestones.map((m) => m.percentage),
        payee: TEST_PAYEE,
        storageHash: ctx.storageHash,
        budget: "0.01",
      });
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.ok(body.address.startsWith("0x"), "returns deployed address");
      assert.ok(body.txHash.startsWith("0x"), "returns tx hash");
      assert.equal(body.funded, true, "deployed in funded state");
      assert.equal(body.budgetEth, "0.01", "budget matches input");
      assert.equal(body.valueSentEth, "0.0105", "value = budget + 5% fee");
      ctx.contractAddress = body.address;
    },
  );

  await t.test(
    "GET /api/escrow/:address — reads back state with anchored hash",
    async () => {
      const { status, body } = await getJson(
        `/api/escrow/${ctx.contractAddress}`,
      );
      assert.equal(status, 200);
      assert.equal(
        body.storageHash,
        ctx.storageHash,
        "contract storageHash matches what we uploaded",
      );
      assert.equal(body.funded, true);
      assert.equal(body.isFullyComplete, false);
      assert.equal(body.milestoneCount, ctx.spec.milestones.length);
      assert.equal(body.milestones[0].completed, false);
    },
  );

  await t.test(
    "POST /api/escrow/:address/complete/0 — releases payment",
    async () => {
      t.diagnostic("Completes milestone 0 on 0G — ~10-30s");
      const { status, body } = await postJson(
        `/api/escrow/${ctx.contractAddress}/complete/0`,
        {},
      );
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.milestone.completed, true);
      assert.equal(body.milestone.id, 0);
      assert.ok(body.milestone.completedAt, "completedAt is set");
      assert.ok(body.txHash.startsWith("0x"));
    },
  );

  await t.test("POST /api/escrow/deploy — rejects invalid payee", async () => {
    const { status, body } = await postJson("/api/escrow/deploy", {
      milestones: ["A", "B"],
      percentages: [50, 50],
      payee: "not-a-real-address",
      storageHash: "0x" + "00".repeat(32),
      budget: "0.01",
    });
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(body.error, /not a valid address/i);
  });
});
