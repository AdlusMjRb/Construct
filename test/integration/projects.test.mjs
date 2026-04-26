import { test } from "node:test";
import assert from "node:assert/strict";
import { postJson, assertServerUp, SHED_DESCRIPTION } from "./helpers.mjs";

test("POST /api/projects/generate — generates spec and uploads to 0G Storage", async (t) => {
  await assertServerUp();
  t.diagnostic("Calls Claude + uploads to 0G — this takes 15-25s");

  const { status, body } = await postJson("/api/projects/generate", {
    description: SHED_DESCRIPTION,
    budget: "0.01",
  });

  assert.equal(status, 200);
  assert.equal(body.ok, true);

  assert.ok(body.spec.project_title, "spec has project_title");
  assert.ok(body.spec.project_summary, "spec has project_summary");
  assert.ok(Array.isArray(body.spec.milestones), "spec has milestones array");
  assert.ok(body.spec.milestones.length > 0, "milestones non-empty");

  const total = body.spec.milestones.reduce((s, m) => s + m.percentage, 0);
  assert.equal(total, 100, "milestone percentages sum to 100");

  for (const m of body.spec.milestones) {
    assert.ok(m.name, "milestone has name");
    assert.ok(typeof m.percentage === "number", "milestone has percentage");
    assert.ok(
      ["high", "medium", "low"].includes(m.verification_confidence),
      "milestone has valid verification_confidence",
    );
    assert.ok(
      Array.isArray(m.acceptance_criteria),
      "milestone has acceptance_criteria",
    );
  }

  assert.ok(body.storage.rootHash.startsWith("0x"), "rootHash is 0x-prefixed");
  assert.equal(body.storage.rootHash.length, 66, "rootHash is 32 bytes hex");
  assert.ok(body.storage.specSize > 0, "specSize is positive");
  assert.ok(body.storage.attempts >= 1, "attempts is at least 1");
});

test("POST /api/projects/generate — rejects empty description", async () => {
  const { status, body } = await postJson("/api/projects/generate", {
    description: "",
  });
  assert.equal(status, 400);
  assert.equal(body.ok, false);
  assert.match(body.error, /description is required/i);
});
