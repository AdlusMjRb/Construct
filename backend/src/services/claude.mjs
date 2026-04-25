/**
 * Everything from milestone generation and translation to evidance checking
 */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.mjs";

const client = new Anthropic({ apiKey: config.anthropicKey });

const GENERATE_TOOL = {
  name: "generate_milestones",
  description:
    "Generate structured milestones for a construction or development project. " +
    "Percentages MUST sum to exactly 100. " +
    "Each milestone must include evidence requirements that are digitally submittable " +
    "and verifiable by an AI agent (photos, receipts, documents).",
  input_schema: {
    type: "object",
    properties: {
      project_title: { type: "string" },
      project_summary: { type: "string" },
      total_budget: { type: "string" },
      milestones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            percentage: { type: "integer" },
            verification_confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
              description:
                "How confidently an AI agent can verify this milestone from digital evidence alone. " +
                "high = receipts, delivery notes, before/after photos, measurable items. " +
                "medium = AI can partially assess but may need to escalate. " +
                "low = structural, safety, or compliance work that almost certainly needs human inspection.",
            },
            canonical_language: {
              type: "string",
              description:
                "ISO 639-1 code of the language the user wrote their project description in. " +
                "e.g. 'en' for English, 'uk' for Ukrainian, 'ar' for Arabic, 'es' for Spanish, " +
                "'fr' for French, 'sw' for Swahili. Detect from the user's input.",
            },
            acceptance_criteria: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: {
                    type: "string",
                    description:
                      "What must be true for this criterion to be met.",
                  },
                  evidence_type: {
                    type: "string",
                    enum: [
                      "photo",
                      "receipt",
                      "document",
                      "video",
                      "screenshot",
                    ],
                    description:
                      "The type of digital evidence the builder must submit.",
                  },
                  evidence_instruction: {
                    type: "string",
                    description:
                      "Specific instruction to the builder on what to capture/submit. " +
                      "Must be something an AI can evaluate from a digital submission. " +
                      "e.g. 'Photo of cleared site showing bare ground from at least two angles' " +
                      "or 'Photo of receipt showing materials purchased with itemised list and date visible'.",
                  },
                },
                required: [
                  "description",
                  "evidence_type",
                  "evidence_instruction",
                  "canonical_language",
                ],
              },
            },
          },
          required: [
            "name",
            "description",
            "percentage",
            "verification_confidence",
            "acceptance_criteria",
            "canonical_language",
          ],
        },
      },
    },
    required: [
      "project_title",
      "project_summary",
      "total_budget",
      "milestones",
      "canonical_language",
    ],
  },
};

const VERIFY_TOOL = {
  name: "verify_milestone",
  description:
    "Evaluate submitted evidence against milestone acceptance criteria. " +
    "APPROVE if evidence clearly satisfies all criteria. " +
    "ESCALATE if ambiguous, incomplete, or requires physical/expert inspection.",
  input_schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["APPROVE", "ESCALATE"] },
      confidence: { type: "number" },
      reasoning: { type: "string" },
      provenance_assessment: {
        type: "string",
        description:
          "Your assessment of the image provenance and authenticity signals. " +
          "Summarise what the trust stack tells you about the evidence quality.",
      },
      pricing_assessment: {
        type: "string",
        description:
          "For receipt/invoice evidence: your assessment of price reasonableness. " +
          "State the items, claimed prices, expected price ranges, and whether amounts seem inflated or normal. " +
          "If no receipt evidence is present, state 'N/A — no receipt evidence submitted'.",
      },
      criteria_check: {
        type: "array",
        items: {
          type: "object",
          properties: {
            criterion: { type: "string" },
            met: { type: "boolean" },
            evidence_type_expected: {
              type: "string",
              enum: ["photo", "receipt", "document", "video", "screenshot"],
            },
            evidence_type_received: {
              type: "string",
              description:
                "What was actually submitted (e.g. 'photo', 'text only', 'receipt image').",
            },
            note: { type: "string" },
          },
          required: [
            "criterion",
            "met",
            "evidence_type_expected",
            "evidence_type_received",
            "note",
          ],
        },
      },
    },
    required: [
      "verdict",
      "confidence",
      "reasoning",
      "provenance_assessment",
      "pricing_assessment",
      "criteria_check",
    ],
  },
};

const GENERATE_SYSTEM = `You are Construct, an autonomous AI escrow agent that converts natural language project descriptions into structured milestone-based escrow specifications. Always use the generate_milestones tool.

CORE RULES:
- Generate 3-6 milestones unless the user specifies otherwise. Never exceed 10.
- Milestone percentages MUST sum to exactly 100.
- Pay close attention to the user's payment distribution preferences. If they say "leave 10% at the end for the builder" or "front-load 30% for materials", honour that. Parse their intent around payment timing and amounts carefully.

LANGUAGE HANDLING — CRITICAL:
The user may write their project description in any language. Generate milestone names, descriptions, and evidence instructions in the SAME language the user wrote in. This is the canonical agreement — it lives on-chain forever in the funder's original language.

DO NOT translate. DO NOT switch to English if the user wrote in another language. Match their language exactly.

STRUCTURAL VALUES STAY CANONICAL:
- evidence_type values MUST remain as English enum values: "photo", "receipt", "document", "video", "screenshot". Never translate these.
- verification_confidence values MUST remain as English enum values: "high", "medium", "low". Never translate these.
- percentage is a number. Never change.

Only the human-readable display strings (name, description, evidence_instruction, criterion description, project_title, project_summary) should be in the user's language.

Also return canonical_language as an ISO 639-1 code reflecting what language you generated in.

EVIDENCE REQUIREMENTS — THIS IS CRITICAL:
You are generating milestones that YOU (an AI) will later verify from digital submissions. There is no human inspector on site. The builder submits evidence (photos, receipts, documents) and you assess it remotely.

For every acceptance criterion, you must specify:
1. What must be true (the criterion itself)
2. What type of evidence to submit (photo, receipt, document, video, screenshot)
3. Exactly what to capture — specific, actionable instructions a builder can follow

PHOTO EVIDENCE STRATEGY:
When dimensions or measurements matter, ALWAYS ask for multiple shots that provide context:
- A WIDE-ANGLE shot showing the full area/structure in context (proves location and scope)
- A CLOSE-UP shot showing measurement or scale reference (proves dimensions)
- The measurement tool must be visible IN CONTEXT with the work — not photographed separately.

IMPORTANT — CHOOSE MEASUREMENT METHODS APPROPRIATE TO SCALE:
Think about what's physically practical. A standard tape measure is ~25 feet / 8 metres. For anything larger, suggest alternatives:
- Small items (under 8ft / 2.5m): Tape measure or ruler in frame works fine.
- Medium areas (8-30ft / 2.5-10m): Ask for photos with a known reference object for scale (e.g. a person standing at the edge, a standard door or vehicle in frame) OR ask for two overlapping photos with a marker at the midpoint.
- Large areas (30ft+ / 10m+): A measuring wheel, surveyor's stakes with string, or GPS screenshot showing area dimensions. Don't ask someone to stretch a tape measure across 50 feet of ground — it's impractical and the photo won't show the measurement clearly anyway.
- Heights: Ask for photos from ground level with a reference object (person, ladder with known rung spacing, standard material lengths like 8ft studs).

The point: if you ask for an impossible or impractical measurement method, the builder can't comply and the evidence becomes useless. Match the method to the scale.

BAD example: "Photo of tape measure across the 15x12 foot area"
GOOD example: "Wide-angle photo from each corner of the cleared area. Place a visible marker (stake, cone, or spray paint) at each corner. Include one photo showing a person standing at one edge for scale reference."

BAD example: "Foundation level within 1/4 inch tolerance"
GOOD example: "Photo of spirit level placed on foundation surface showing bubble centred. Photo from each corner of the foundation showing the full perimeter at ground level."

RECEIPT AND FINANCIAL EVIDENCE:
Always ask for "photo or scan of receipt/invoice with date, vendor name, itemised list, and total amount clearly visible." When materials have specific requirements (e.g. treated timber, specific gauge wire), ask the receipt to show the exact product name/specification.

CONTEXTUAL PROOF:
Think adversarially — how could someone fake this? Then design evidence to make faking expensive:
- Before/after photo pairs from the SAME angle (proves the work happened at this location)
- Measurement tools IN CONTEXT with the work (not just a photo of a ruler)
- Multiple angles of the same work (harder to fake than one photo)
- When a milestone involves removal (clearing land, demolition), ask for wide shots that show the ABSENCE of what was there

EVIDENCE COMPLETENESS:
Each criterion should result in evidence that tells a complete visual story. If you need 3 photos to verify something, say "3 photos" and describe each one. Don't leave it vague.

VERIFICATION CONFIDENCE:
For each milestone, assess how confidently you can verify it from digital evidence alone:
- high: Receipts, delivery confirmations, clear before/after photos, measurable visual changes. You can handle these.
- medium: Work that's partially visible in photos but may need context. You'll try but might escalate.
- low: Structural integrity, safety compliance, hidden work (e.g. wiring inside walls, foundation depth). You should almost always escalate these to human review.

Be honest about what you can and can't verify. This honesty is what makes you trustworthy.

CONSTRUCTION SEQUENCING:
Be practical about construction order. Don't ask for evidence of interior work before the structure is built. Sequence milestones logically.`;

export async function generateMilestones(description) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    temperature: 0.3,
    system: GENERATE_SYSTEM,
    tools: [GENERATE_TOOL],
    tool_choice: { type: "tool", name: "generate_milestones" },
    messages: [{ role: "user", content: description }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not use the generate tool");

  const data = toolUse.input;

  const totalPct = data.milestones.reduce((s, m) => s + m.percentage, 0);
  if (totalPct !== 100) {
    throw new Error(`Milestone percentages sum to ${totalPct}, not 100`);
  }

  return {
    ...data,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

const VERIFY_SYSTEM = `You are Construct, an autonomous AI escrow agent verifying milestone evidence. Use the verify_milestone tool.

YOUR ROLE:
You are the first — and often only — point of verification. There is no human on site. The project owner trusts you to protect their funds. The builder trusts you to release payment fairly when work is done.

TRUST STACK — PROVENANCE-AWARE VERIFICATION:
You now operate as part of a multi-layer trust stack. Before you see an image, it has already been analysed by three provenance systems:

1. **EXIF metadata** — checks for camera make/model, GPS coordinates, timestamps, and editing software fingerprints. AI-generated images typically have NO authentic EXIF. Edited images may show software like Photoshop.

2. **C2PA content credentials** — checks for cryptographic provenance signatures embedded at capture time. A "verified" C2PA manifest means the image was signed by the device that captured it (e.g. a modern iPhone or Pixel) and has not been tampered with since. This is the strongest authenticity signal available.

3. **Reality Defender** — an enterprise AI detection system that scores images for probability of AI generation using an ensemble of detection models.

The provenance results will be provided below the evidence. USE THEM in your assessment:

- If an image has C2PA VERIFIED status → strong positive signal, weight evidence favourably
- If Reality Defender flags an image as AI-GENERATED → ESCALATE immediately, regardless of how convincing the image looks visually. Note: you cannot detect AI-generated images by looking at them — that's what Reality Defender is for
- If EXIF shows editing software (Photoshop, GIMP, etc.) → flag as potentially manipulated
- If EXIF shows NO camera data at all → note this as suspicious (could be screenshot, AI-generated, or heavily processed)
- If provenance checks are unavailable → proceed with standard visual verification but note reduced confidence

IMPORTANT: Provenance signals INFORM your verdict but don't override your semantic assessment. An image with perfect C2PA credentials that shows the wrong location still fails. And an image with no provenance data that clearly satisfies the criteria can still pass — it just warrants lower confidence.

VERIFICATION RULES:

1. CHECK EVIDENCE TYPE: Each criterion specifies what evidence type was requested (photo, receipt, document, etc.). If the builder submitted a different type, note the mismatch. Text-only evidence is almost never sufficient for criteria that requested photos or documents.

2. VERIFICATION CONFIDENCE AWARENESS:
   - For "high" confidence milestones (receipts, clear visual changes): APPROVE if evidence is clear and complete. Be reasonably confident.
   - For "medium" confidence milestones: APPROVE only if evidence is strong and unambiguous. ESCALATE if any doubt.
   - For "low" confidence milestones: Default towards ESCALATE unless evidence is overwhelming and clearly demonstrates completion.

3. PHOTO EVIDENCE: When examining photos, look for:
   - Does the photo show what was requested?
   - Is it clearly the same site/project?
   - Is the work visually complete as described?
   - Are there any obvious quality issues visible?
   - Do provenance signals support authenticity?

4. RECEIPT/FINANCIAL EVIDENCE — PRICING ORACLE:
   When examining receipts or invoices, perform a multi-point check:
   - Date is visible and reasonable
   - Items match what the milestone requires
   - Vendor/supplier info is visible
   - **PRICE REASONABLENESS CHECK**: For every line item, assess whether the price is plausible for that specific product at that retailer. Use your knowledge of UK/US construction material pricing. IMPORTANT — allow reasonable leeway: ±15–20% from expected price is normal (sales, regional variation, bulk pricing, supply fluctuations). Only flag prices that are dramatically wrong — e.g. a basic screwdriver at £49.80 when it should be £3–8, or plywood billed at mahogany prices. The threshold for concern is roughly 2x or more above expected pricing.
   - **MATERIAL SPECIFICATION CHECK**: Compare the materials listed on the receipt against what the milestone actually requires. If the milestone specifies premium materials (e.g. mahogany, marine-grade plywood, copper pipe) but the receipt shows budget alternatives (e.g. standard pine, OSB, plastic pipe), that's a specification mismatch — ESCALATE. Conversely, if the receipt shows premium materials at budget prices, that's also suspicious.
   - **LOCATION CROSS-REFERENCE**: If EXIF GPS coordinates are available in the provenance data, check whether the store on the receipt is consistent with the photo's capture location. A receipt from "B&Q Cambridge" but a photo geotagged in Manchester is suspicious.
   - **QUANTITY CHECK**: Are the quantities plausible for the scope of work described in the milestone? 500 bags of cement for a garden shed is suspicious.
   - If you detect price inflation (>2x expected), material substitution, location mismatch, or implausible quantities, ESCALATE with a clear explanation of what looks wrong, what you'd expect to see, and your estimated fair price range.

5. NEVER APPROVE if:
   - Evidence is clearly unrelated to the milestone
   - Required evidence types are missing entirely
   - Photos are too blurry or dark to assess
   - Financial documents have mismatched amounts or dates
   - Reality Defender flags the image as likely AI-generated

6. ALWAYS ESCALATE if:
   - Structural safety or building compliance is involved
   - Evidence is ambiguous or could be from a different project
   - You're less than 70% confident
   - Provenance signals indicate possible manipulation or AI generation

Be direct in your reasoning. State exactly what you see, what's missing, and what the provenance signals tell you.`;

export async function verifyEvidence(
  milestone,
  evidence,
  images = [],
  provenanceResults = [],
) {
  const contentBlocks = [];

  for (const img of images) {
    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mediaType,
        data: img.base64,
      },
    });
  }

  const criteriaText = milestone.acceptance_criteria
    .map((c, i) => {
      if (typeof c === "string") {
        return `${i + 1}. ${c}`;
      }
      return `${i + 1}. ${c.description}\n   Evidence required: ${
        c.evidence_type
      } — ${c.evidence_instruction}`;
    })
    .join("\n");

  let provenanceText = "";
  if (provenanceResults.length > 0) {
    provenanceText = "\n\n━━━ PROVENANCE TRUST STACK RESULTS ━━━\n";
    for (const pr of provenanceResults) {
      provenanceText += `\n📄 ${pr.filename || "Image"}:\n`;
      provenanceText += `   Overall trust: ${
        pr.trust_level?.toUpperCase() || "UNKNOWN"
      }\n`;
      provenanceText += `   Summary: ${pr.trust_summary || "No summary"}\n`;

      if (pr.checks?.exif) {
        provenanceText += `   EXIF: [${pr.checks.exif.status}]`;
        if (pr.checks.exif.camera) {
          provenanceText += ` Camera: ${pr.checks.exif.camera.make} ${pr.checks.exif.camera.model}`;
        }
        if (pr.checks.exif.timestamp) {
          provenanceText += ` | Captured: ${pr.checks.exif.timestamp}`;
        }
        if (pr.checks.exif.gps) {
          provenanceText += ` | GPS: ${pr.checks.exif.gps.latitude.toFixed(
            4,
          )}, ${pr.checks.exif.gps.longitude.toFixed(4)}`;
        }
        if (pr.checks.exif.software) {
          provenanceText += ` | Software: ${pr.checks.exif.software}`;
        }
        provenanceText += "\n";
      }

      if (pr.checks?.c2pa) {
        provenanceText += `   C2PA: [${pr.checks.c2pa.status}]`;
        if (pr.checks.c2pa.signer) {
          provenanceText += ` Signed by: ${pr.checks.c2pa.signer}`;
        }
        provenanceText += "\n";
      }

      if (pr.checks?.reality_defender) {
        const rd = pr.checks.reality_defender;
        provenanceText += `   Reality Defender: [${rd.status}]`;
        if (rd.score !== null) {
          provenanceText += ` AI probability: ${(rd.score * 100).toFixed(0)}%`;
        }
        provenanceText += "\n";
      }
    }
    provenanceText += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  }

  const imageNote =
    images.length > 0
      ? `\n\n${images.length} image(s) attached above as evidence. Examine them carefully.`
      : "\n\nNO IMAGES SUBMITTED. If the criteria required photo evidence, this is a gap.";

  const confidenceNote = milestone.verification_confidence
    ? `\nVERIFICATION CONFIDENCE LEVEL: ${milestone.verification_confidence.toUpperCase()} — ${
        milestone.verification_confidence === "high"
          ? "You should be able to verify this from digital evidence. Approve if clear."
          : milestone.verification_confidence === "medium"
            ? "Partially assessable. Approve only if evidence is strong and unambiguous."
            : "This likely needs human inspection. Escalate unless evidence is overwhelming."
      }`
    : "";

  contentBlocks.push({
    type: "text",
    text: `MILESTONE: ${milestone.name}
${confidenceNote}

ACCEPTANCE CRITERIA:
${criteriaText}

EVIDENCE SUBMITTED BY BUILDER:
${evidence}${imageNote}${provenanceText}

Review this evidence against the acceptance criteria. Factor in the provenance signals when assessing confidence. Is this milestone complete?`,
  });

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    temperature: 0,
    system: VERIFY_SYSTEM,
    tools: [VERIFY_TOOL],
    tool_choice: { type: "tool", name: "verify_milestone" },
    messages: [{ role: "user", content: contentBlocks }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not use the verify tool");

  return toolUse.input;
}

const TRANSLATE_TOOL = {
  name: "translate_spec",
  description:
    "Translate the display-facing strings of a milestone spec into a target language. " +
    "Leave all structural keys, enum values, and numeric values unchanged.",
  input_schema: {
    type: "object",
    properties: {
      project_title: { type: "string" },
      project_summary: { type: "string" },
      milestones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            acceptance_criteria: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  evidence_instruction: { type: "string" },
                },
                required: ["description", "evidence_instruction"],
              },
            },
          },
          required: ["name", "description", "acceptance_criteria"],
        },
      },
    },
    required: ["project_title", "project_summary", "milestones"],
  },
};

const LANGUAGE_NAMES = {
  en: "English",
  uk: "Ukrainian",
  ar: "Arabic",
  es: "Spanish",
  fr: "French",
  sw: "Swahili",
};

export async function translateMilestones(spec, targetLang) {
  const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;

  const displayOnly = {
    project_title: spec.project_title || "",
    project_summary: spec.project_summary || "",
    milestones: (spec.milestones || []).map((m) => ({
      name: m.name,
      description: m.description,
      acceptance_criteria: (m.acceptance_criteria || []).map((c) => ({
        description: typeof c === "string" ? c : c.description,
        evidence_instruction:
          typeof c === "string" ? c : c.evidence_instruction,
      })),
    })),
  };

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    temperature: 0,
    system: `You are a translator. Translate every string in the input into ${targetLangName}. Preserve meaning precisely — this is a construction contract, accuracy matters.

PRESERVE WITHOUT CHANGE:
- Numbers and currency amounts (e.g. £49.98, $3-8, 2.5m) — keep exactly as written, same currency symbol, same digits
- Vendor, brand, and product names (e.g. B&Q Cambridge, Erbauer, Pozi PZ2) — do not translate or transliterate
- Proper nouns, place names, and contract addresses
- Technical specifications and measurements (e.g. PZ2, 2x4, 8ft)

Translate only the surrounding natural-language prose. Do not add commentary. Use the translate_spec tool.`,
    tools: [TRANSLATE_TOOL],
    tool_choice: { type: "tool", name: "translate_spec" },
    messages: [
      {
        role: "user",
        content: `Translate the following milestone spec into ${targetLangName}:\n\n${JSON.stringify(
          displayOnly,
          null,
          2,
        )}`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not use the translate tool");
  const translated = toolUse.input;

  return {
    ...spec,
    project_title: translated.project_title,
    project_summary: translated.project_summary,
    milestones: spec.milestones.map((original, i) => {
      const t = translated.milestones[i];
      if (!t) return original;
      return {
        ...original,
        name: t.name,
        description: t.description,
        acceptance_criteria: original.acceptance_criteria.map((oc, ci) => {
          const tc = t.acceptance_criteria[ci];
          if (!tc) return oc;
          if (typeof oc === "string") {
            return tc.description;
          }
          return {
            ...oc,
            description: tc.description,
            evidence_instruction: tc.evidence_instruction,
          };
        }),
      };
    }),
  };
}

const TRANSLATE_VERIFICATION_TOOL = {
  name: "translate_verification",
  description: "Translate display strings of a verification result.",
  input_schema: {
    type: "object",
    properties: {
      reasoning: { type: "string" },
      provenance_assessment: { type: "string" },
      pricing_assessment: { type: "string" },
      criteria_check: {
        type: "array",
        items: {
          type: "object",
          properties: {
            criterion: { type: "string" },
            note: { type: "string" },
          },
          required: ["criterion", "note"],
        },
      },
    },
    required: [
      "reasoning",
      "provenance_assessment",
      "pricing_assessment",
      "criteria_check",
    ],
  },
};

export async function translateVerification(result, targetLang) {
  const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;

  const displayOnly = {
    reasoning: result.reasoning || "",
    provenance_assessment: result.provenance_assessment || "",
    pricing_assessment: result.pricing_assessment || "",
    criteria_check: (result.criteria_check || []).map((cc) => ({
      criterion: cc.criterion || "",
      note: cc.note || "",
    })),
  };

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    temperature: 0,
    system: `You are a translator. Translate every string in the input into ${targetLangName}. Preserve meaning precisely — this is a construction contract audit record, accuracy matters.

PRESERVE WITHOUT CHANGE:
- Numbers and currency amounts (e.g. £49.98, $3-8, 2.5m) — keep exactly as written, same currency symbol, same digits
- Vendor, brand, and product names (e.g. B&Q Cambridge, Erbauer, Pozi PZ2) — do not translate or transliterate
- Proper nouns, place names, contract addresses, transaction hashes
- Technical specifications and measurements (e.g. PZ2, 2x4, 8ft)
- Status enum strings that appear quoted (e.g. "authentic", "suspicious", "ai_generated", "APPROVE", "ESCALATE") — leave as-is

Translate only the surrounding natural-language prose. Do not add commentary. Use the translate_verification tool.`,
    tools: [TRANSLATE_VERIFICATION_TOOL],
    tool_choice: { type: "tool", name: "translate_verification" },
    messages: [
      {
        role: "user",
        content: `Translate the following verification result into ${targetLangName}:\n\n${JSON.stringify(
          displayOnly,
          null,
          2,
        )}`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not use the translate tool");
  const translated = toolUse.input;

  return {
    ...result,
    reasoning: translated.reasoning,
    provenance_assessment: translated.provenance_assessment,
    pricing_assessment: translated.pricing_assessment,
    criteria_check: (result.criteria_check || []).map((oc, i) => {
      const tc = translated.criteria_check?.[i];
      if (!tc) return oc;
      return {
        ...oc,
        criterion: tc.criterion || oc.criterion,
        note: tc.note || oc.note,
      };
    }),
  };
}
