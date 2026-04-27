import type { AcceptanceCriterion } from "../lib/types";
import { P, inpC } from "../lib/tokens";
import { EvidenceTypeBadge } from "./Badges";

export const CriterionCard = ({
  criterion,
  index,
  frozen,
  onUpdate,
}: {
  criterion: AcceptanceCriterion;
  index: number;
  frozen: boolean;
  onUpdate?: (updated: AcceptanceCriterion) => void;
}) => {
  return (
    <div
      style={{
        background: frozen ? "#fafbfc" : "#fff",
        border: `1px solid ${P.cardBorder}`,
        borderRadius: "8px",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            color: P.textDim,
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        >
          Criterion {index + 1}
        </span>
        <EvidenceTypeBadge type={criterion.evidence_type} />
      </div>
      {frozen ? (
        <>
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: P.text,
              lineHeight: 1.5,
              fontWeight: 500,
            }}
          >
            {criterion.description}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              color: P.textMid,
              lineHeight: 1.5,
              fontStyle: "italic",
            }}
          >
            {criterion.evidence_instruction}
          </p>
        </>
      ) : (
        <>
          <textarea
            value={criterion.description}
            onChange={(e) =>
              onUpdate?.({ ...criterion, description: e.target.value })
            }
            placeholder="What must be true..."
            rows={Math.max(1, Math.ceil(criterion.description.length / 70))}
            style={{
              ...inpC,
              fontSize: "12px",
              padding: "8px 10px",
              resize: "vertical",
            }}
          />
          <div
            style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}
          >
            <select
              value={criterion.evidence_type}
              onChange={(e) =>
                onUpdate?.({
                  ...criterion,
                  evidence_type: e.target
                    .value as AcceptanceCriterion["evidence_type"],
                })
              }
              style={{
                ...inpC,
                fontSize: "11px",
                padding: "8px 8px",
                width: "110px",
                flexShrink: 0,
                cursor: "pointer",
                appearance: "auto",
              }}
            >
              <option value="photo">📷 Photo</option>
              <option value="receipt">🧾 Receipt</option>
              <option value="document">📄 Document</option>
              <option value="video">🎥 Video</option>
              <option value="screenshot">🖥️ Screenshot</option>
            </select>
            <textarea
              value={criterion.evidence_instruction}
              onChange={(e) =>
                onUpdate?.({
                  ...criterion,
                  evidence_instruction: e.target.value,
                })
              }
              placeholder="What to submit (e.g. photo of cleared site from two angles)..."
              rows={Math.max(
                2,
                Math.ceil(criterion.evidence_instruction.length / 60),
              )}
              style={{
                ...inpC,
                fontSize: "12px",
                padding: "8px 10px",
                flex: 1,
                resize: "vertical",
              }}
            />
          </div>
        </>
      )}
    </div>
  );
};
