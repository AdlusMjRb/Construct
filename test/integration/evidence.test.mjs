import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { postMultipart, assertServerUp } from "./helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_IMAGE = path.join(
  __dirname,
  "..",
  "fixtures",
  "test-evidence.jpg",
);

const TEST_MILESTONE = {
  name: "Site Preparation",
  verification_confidence: "high",
  acceptance_criteria: [
    {
      description: "Site cleared of vegetation and debris",
      evidence_type: "photo",
      evidence_instruction:
        "Wide-angle photo from each corner showing the cleared area",
    },
  ],
};

test(
  "POST /api/evidence/verify — runs Claude Vision + trust stack",
  {
    skip: !fs.existsSync(FIXTURE_IMAGE)
      ? `No fixture at ${FIXTURE_IMAGE}`
      : false,
  },
  async (t) => {
    await assertServerUp();
    t.diagnostic("Calls Claude Vision + Reality Defender — ~20-30s");

    const { status, body } = await postMultipart(
      "/api/evidence/verify",
      {
        milestone: JSON.stringify(TEST_MILESTONE),
        evidence: "Site cleared. Photo attached.",
      },
      { images: FIXTURE_IMAGE },
    );

    assert.equal(status, 200);
    assert.equal(body.ok, true);

    assert.ok(
      ["APPROVE", "ESCALATE"].includes(body.result.verdict),
      `verdict is APPROVE or ESCALATE (got ${body.result.verdict})`,
    );
    assert.ok(
      typeof body.result.confidence === "number",
      "confidence is a number",
    );
    assert.ok(body.result.confidence >= 0 && body.result.confidence <= 1);
    assert.ok(body.result.reasoning, "result has reasoning prose");
    assert.ok(
      Array.isArray(body.result.criteria_check),
      "criteria_check is an array",
    );

    assert.ok(Array.isArray(body.provenance), "provenance is an array");
    assert.equal(body.provenance.length, 1, "one provenance entry per image");
    const prov = body.provenance[0];
    assert.ok(
      ["high", "medium", "low", "untrusted"].includes(prov.trust_level),
      "trust_level is valid",
    );
    assert.ok(prov.checks.exif, "EXIF check present");
    assert.ok(prov.checks.c2pa, "C2PA check present");
    assert.ok(prov.checks.reality_defender, "Reality Defender check present");
  },
);

test("POST /api/evidence/verify — rejects missing milestone field", async () => {
  const { status, body } = await postMultipart("/api/evidence/verify", {
    evidence: "no milestone here",
  });
  assert.equal(status, 400);
  assert.equal(body.ok, false);
  assert.match(body.error, /milestone.*required/i);
});
