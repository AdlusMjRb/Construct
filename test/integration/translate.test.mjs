import { test } from "node:test";
import assert from "node:assert/strict";
import { postJson, assertServerUp } from "./helpers.mjs";

const SAMPLE_SPEC = {
  project_title: "Garden Shed",
  project_summary: "Build a small wooden shed in the back garden",
  milestones: [
    {
      name: "Foundation",
      description: "Pour the concrete slab",
      acceptance_criteria: [
        {
          description: "Slab is level and cured",
          evidence_instruction: "Photo of spirit level on cured slab",
        },
      ],
    },
  ],
};

test("POST /api/translate — translates spec to French, preserves structure", async (t) => {
  await assertServerUp();
  t.diagnostic("Calls Claude for translation — ~5-10s");

  const { status, body } = await postJson("/api/translate", {
    spec: SAMPLE_SPEC,
    targetLang: "fr",
    canonical_language: "en",
  });

  assert.equal(status, 200);
  assert.equal(body.ok, true);

  assert.notEqual(
    body.spec.project_title,
    SAMPLE_SPEC.project_title,
    "title was actually translated",
  );

  assert.equal(body.spec.milestones.length, 1);
  assert.equal(
    body.spec.milestones[0].acceptance_criteria.length,
    1,
    "criterion count preserved",
  );
});

test("POST /api/translate-verification — translates verdict prose, preserves verdict", async (t) => {
  t.diagnostic("Calls Claude for translation — ~5-10s");

  const VERIFICATION = {
    verdict: "APPROVE",
    confidence: 0.9,
    reasoning: "The evidence clearly shows the work is complete.",
    provenance_assessment: "All signals positive.",
    pricing_assessment: "N/A — no receipt evidence submitted",
    criteria_check: [
      {
        criterion: "Site is cleared",
        met: true,
        evidence_type_expected: "photo",
        evidence_type_received: "photo",
        note: "Clear evidence of cleared site",
      },
    ],
  };

  const { status, body } = await postJson("/api/translate-verification", {
    result: VERIFICATION,
    targetLang: "es",
    canonical_language: "en",
  });

  assert.equal(status, 200);
  assert.equal(body.ok, true);

  assert.equal(body.result.verdict, "APPROVE", "verdict preserved");
  assert.equal(body.result.confidence, 0.9, "confidence preserved");
  assert.equal(
    body.result.criteria_check[0].met,
    true,
    "criterion met flag preserved",
  );
  assert.equal(
    body.result.criteria_check[0].evidence_type_expected,
    "photo",
    "evidence_type_expected preserved",
  );

  assert.notEqual(
    body.result.reasoning,
    VERIFICATION.reasoning,
    "reasoning was actually translated",
  );
});
