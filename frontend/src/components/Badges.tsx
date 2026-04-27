import { Tooltip } from "./Tooltip";

type EvidenceTypeCfg = {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: string;
};

const EVIDENCE_TYPE_CONFIG: Record<string, EvidenceTypeCfg> = {
  photo: {
    label: "Photo",
    color: "#0369a1",
    bg: "#f0f9ff",
    border: "#bae6fd",
    icon: "📷",
  },
  receipt: {
    label: "Receipt",
    color: "#15803d",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    icon: "🧾",
  },
  document: {
    label: "Document",
    color: "#7c3aed",
    bg: "#f5f3ff",
    border: "#ddd6fe",
    icon: "📄",
  },
  video: {
    label: "Video",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
    icon: "🎥",
  },
  screenshot: {
    label: "Screenshot",
    color: "#ca8a04",
    bg: "#fefce8",
    border: "#fde68a",
    icon: "🖥️",
  },
};

const EVIDENCE_TYPE_TOOLTIPS: Record<string, string> = {
  photo:
    "Submit a photograph as evidence. Follow the specific instructions for angles and what to include in frame.",
  receipt:
    "Submit a photo or scan of a receipt or invoice. Ensure date, vendor, items, and total are clearly visible.",
  document:
    "Submit a document such as an inspection report, certificate, or permit.",
  video: "Submit a video recording showing the completed work or process.",
  screenshot:
    "Submit a screenshot of a digital record, confirmation, or system output.",
};

type ConfidenceCfg = {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: string;
  tooltip: string;
};

const CONFIDENCE_CONFIG: Record<string, ConfidenceCfg> = {
  high: {
    label: "AI Verifiable",
    color: "#15803d",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    icon: "🤖",
    tooltip:
      "Construct can confidently verify this milestone from photos, receipts, or documents alone — no human inspector needed.",
  },
  medium: {
    label: "Partially Verifiable",
    color: "#ca8a04",
    bg: "#fefce8",
    border: "#fde68a",
    icon: "⚠️",
    tooltip:
      "Construct can partially assess this from digital evidence, but may escalate to human review if the evidence is unclear or ambiguous.",
  },
  low: {
    label: "Likely Needs Human",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
    icon: "👷",
    tooltip:
      "This milestone involves structural, safety, or compliance work that's difficult to verify from photos alone. Construct will almost always escalate this to a human inspector.",
  },
};

export const EvidenceTypeBadge = ({ type }: { type: string }) => {
  const cfg = EVIDENCE_TYPE_CONFIG[type] || EVIDENCE_TYPE_CONFIG.photo;
  return (
    <Tooltip text={EVIDENCE_TYPE_TOOLTIPS[type] || ""}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          color: cfg.color,
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
          borderRadius: "6px",
          padding: "3px 8px",
          whiteSpace: "nowrap",
          cursor: "help",
        }}
      >
        {cfg.icon} {cfg.label}
      </span>
    </Tooltip>
  );
};

export const ConfidenceBadge = ({ level }: { level: string }) => {
  const cfg = CONFIDENCE_CONFIG[level] || CONFIDENCE_CONFIG.medium;
  return (
    <Tooltip text={cfg.tooltip}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          color: cfg.color,
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
          borderRadius: "6px",
          padding: "3px 8px",
          whiteSpace: "nowrap",
          cursor: "help",
        }}
      >
        {cfg.icon} {cfg.label}
      </span>
    </Tooltip>
  );
};
