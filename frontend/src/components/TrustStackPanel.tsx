import { useState } from "react";
import { P, xBtn } from "../lib/tokens";
import type {
  LayerStatus,
  ProvenanceCheck,
  ProvenanceEntry,
  TrustLevel,
} from "../lib/types";
import { ChevronIcon, ShieldIcon } from "./icons";
import { Tooltip } from "./Tooltip";

// ─── Trust Stack config ──────────────────────────────────────────

type TrustLevelCfg = {
  color: string;
  bg: string;
  border: string;
  icon: string;
  label: string;
};

const TRUST_LEVEL_CONFIG: Record<TrustLevel, TrustLevelCfg> = {
  high: {
    color: "#15803d",
    bg: "#f0fdf4",
    border: "#86efac",
    icon: "🟢",
    label: "HIGH TRUST",
  },
  medium: {
    color: "#ca8a04",
    bg: "#fefce8",
    border: "#fde68a",
    icon: "🟡",
    label: "MEDIUM TRUST",
  },
  low: {
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fcd34d",
    icon: "🟠",
    label: "LOW TRUST",
  },
  untrusted: {
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
    icon: "🔴",
    label: "UNTRUSTED",
  },
};

type LayerStatusCfg = {
  color: string;
  bg: string;
  border: string;
  icon: string;
};

const LAYER_STATUS_COLOR: Record<LayerStatus, LayerStatusCfg> = {
  authentic: { color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", icon: "🟢" },
  verified: { color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", icon: "🟢" },
  real: { color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", icon: "🟢" },
  inconclusive: {
    color: "#ca8a04",
    bg: "#fefce8",
    border: "#fde68a",
    icon: "🟡",
  },
  suspicious: {
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fcd34d",
    icon: "🟠",
  },
  ai_generated: {
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
    icon: "🔴",
  },
  invalid: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "🔴" },
  no_data: { color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb", icon: "⚪" },
  no_manifest: {
    color: "#6b7280",
    bg: "#f9fafb",
    border: "#e5e7eb",
    icon: "⚪",
  },
  unavailable: {
    color: "#9ca3af",
    bg: "#f9fafb",
    border: "#e5e7eb",
    icon: "⬜",
  },
  error: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "❌" },
  unknown: { color: "#9ca3af", bg: "#f9fafb", border: "#e5e7eb", icon: "❓" },
};

const LAYER_LABELS: Record<string, { name: string; description: string }> = {
  exif: {
    name: "EXIF",
    description:
      "Camera metadata — make, model, GPS, timestamp, editing software",
  },
  c2pa: {
    name: "C2PA",
    description:
      "Content credentials — cryptographic provenance signature from capture device",
  },
  reality_defender: {
    name: "AI Detection",
    description: "Reality Defender — AI generation probability score",
  },
};

// ─── Component ───────────────────────────────────────────────────

export const TrustStackPanel = ({
  provenance,
  provenanceAssessment,
  pricingAssessment,
}: {
  provenance: ProvenanceEntry[];
  provenanceAssessment?: string | null;
  pricingAssessment?: string | null;
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (!provenance || provenance.length === 0) return null;
  const toggleLayer = (key: string) =>
    setExpanded((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "14px",
        borderRadius: "10px",
        background: "#fafbfc",
        border: `1px solid ${P.cardBorder}`,
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: P.textDim,
          marginBottom: "4px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <ShieldIcon /> Trust Stack
      </div>

      {provenance.map((pr: ProvenanceEntry, pri: number) => {
        const trustCfg =
          TRUST_LEVEL_CONFIG[pr.trust_level] || TRUST_LEVEL_CONFIG.low;
        const fileKey = `file-${pri}`;
        const fileExpanded = expanded[fileKey];

        return (
          <div
            key={pri}
            style={{
              background: "#fff",
              borderRadius: "8px",
              border: `1px solid ${trustCfg.border}`,
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => toggleLayer(fileKey)}
              style={{
                ...xBtn,
                margin: 0,
                borderRadius: fileExpanded ? "8px 8px 0 0" : "8px",
                background: trustCfg.bg,
                border: "none",
                borderBottom: fileExpanded
                  ? `1px solid ${trustCfg.border}`
                  : "none",
              }}
            >
              <span style={{ fontSize: "13px" }}>{trustCfg.icon}</span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                  color: trustCfg.color,
                }}
              >
                {trustCfg.label}
              </span>
              {pr.filename && (
                <span
                  style={{
                    fontSize: "11px",
                    color: P.textDim,
                    fontWeight: 400,
                  }}
                >
                  — {pr.filename}
                </span>
              )}
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {pr.checks &&
                  Object.entries(pr.checks).map(
                    ([layer, check]: [string, ProvenanceCheck]) => {
                      const statusCfg =
                        LAYER_STATUS_COLOR[check.status] ||
                        LAYER_STATUS_COLOR.unknown;
                      const layerLabel = LAYER_LABELS[layer]?.name || layer;
                      return (
                        <Tooltip
                          key={layer}
                          text={`${layerLabel}: ${check.status}${
                            check.score !== null && check.score !== undefined
                              ? ` (${(check.score * 100).toFixed(0)}%)`
                              : ""
                          }`}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                              fontSize: "9px",
                              fontWeight: 700,
                              letterSpacing: "0.5px",
                              textTransform: "uppercase",
                              color: statusCfg.color,
                              background: statusCfg.bg,
                              border: `1px solid ${statusCfg.border}`,
                              borderRadius: "4px",
                              padding: "2px 6px",
                              whiteSpace: "nowrap",
                              cursor: "help",
                            }}
                          >
                            {statusCfg.icon} {layerLabel}
                          </span>
                        </Tooltip>
                      );
                    },
                  )}
                <ChevronIcon open={!!fileExpanded} />
              </div>
            </button>

            {fileExpanded && (
              <div
                style={{
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  animation: "fadeIn 0.3s ease",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    color: P.textMid,
                    lineHeight: 1.5,
                    padding: "8px 10px",
                    background: trustCfg.bg,
                    borderRadius: "6px",
                    border: `1px solid ${trustCfg.border}`,
                  }}
                  dir="auto"
                >
                  {pr.trust_summary}
                </div>

                {pr.checks &&
                  Object.entries(pr.checks).map(
                    ([layer, check]: [string, ProvenanceCheck]) => {
                      const statusCfg =
                        LAYER_STATUS_COLOR[check.status] ||
                        LAYER_STATUS_COLOR.unknown;
                      const layerInfo = LAYER_LABELS[layer] || {
                        name: layer,
                        description: "",
                      };
                      const layerKey = `${fileKey}-${layer}`;
                      const layerExpanded = expanded[layerKey];

                      return (
                        <div
                          key={layer}
                          style={{
                            borderRadius: "6px",
                            border: `1px solid ${statusCfg.border}`,
                            overflow: "hidden",
                          }}
                        >
                          <button
                            onClick={() => toggleLayer(layerKey)}
                            style={{
                              ...xBtn,
                              margin: 0,
                              borderRadius: layerExpanded
                                ? "6px 6px 0 0"
                                : "6px",
                              background: statusCfg.bg,
                              border: "none",
                              borderBottom: layerExpanded
                                ? `1px solid ${statusCfg.border}`
                                : "none",
                              padding: "8px 10px",
                            }}
                          >
                            <span style={{ fontSize: "12px" }}>
                              {statusCfg.icon}
                            </span>
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                color: statusCfg.color,
                              }}
                            >
                              {layerInfo.name}
                            </span>
                            <span
                              style={{
                                fontSize: "10px",
                                color: P.textDim,
                                fontWeight: 400,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                              }}
                            >
                              {check.status}
                            </span>
                            {check.score !== null &&
                              check.score !== undefined && (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    marginLeft: "8px",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: "60px",
                                      height: "6px",
                                      background: "#e5e7eb",
                                      borderRadius: "3px",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: `${check.score * 100}%`,
                                        height: "100%",
                                        background:
                                          check.score < 0.3
                                            ? "#16a34a"
                                            : check.score < 0.7
                                              ? "#d97706"
                                              : "#dc2626",
                                        borderRadius: "3px",
                                        transition: "width 0.5s ease",
                                      }}
                                    />
                                  </div>
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 600,
                                      color: statusCfg.color,
                                      fontFamily: "'JetBrains Mono', monospace",
                                    }}
                                  >
                                    {(check.score * 100).toFixed(0)}%
                                  </span>
                                </div>
                              )}
                            <div style={{ marginLeft: "auto" }}>
                              <ChevronIcon open={!!layerExpanded} />
                            </div>
                          </button>

                          {layerExpanded && (
                            <div
                              style={{
                                padding: "8px 10px",
                                background: "#fff",
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                                animation: "fadeIn 0.2s ease",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "10px",
                                  color: P.textDim,
                                  marginBottom: "4px",
                                }}
                              >
                                {layerInfo.description}
                              </div>
                              {check.signals &&
                                check.signals.map(
                                  (signal: string, si: number) => (
                                    <div
                                      key={si}
                                      style={{
                                        fontSize: "11px",
                                        color: P.textMid,
                                        lineHeight: 1.4,
                                        padding: "4px 8px",
                                        background: "#f9fafb",
                                        borderRadius: "4px",
                                        fontFamily:
                                          "'JetBrains Mono', monospace",
                                      }}
                                      dir="auto"
                                    >
                                      {signal}
                                    </div>
                                  ),
                                )}
                              {check.camera && (
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: P.text,
                                    padding: "4px 8px",
                                  }}
                                >
                                  📷 {check.camera.make} {check.camera.model}
                                  {check.camera.lens && (
                                    <span style={{ color: P.textDim }}>
                                      {" "}
                                      ({check.camera.lens})
                                    </span>
                                  )}
                                </div>
                              )}
                              {check.gps && (
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: P.text,
                                    padding: "4px 8px",
                                  }}
                                >
                                  📍 {check.gps.latitude.toFixed(4)},{" "}
                                  {check.gps.longitude.toFixed(4)}
                                </div>
                              )}
                              {check.timestamp && (
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: P.text,
                                    padding: "4px 8px",
                                  }}
                                >
                                  🕐{" "}
                                  {new Date(check.timestamp).toLocaleString()}
                                </div>
                              )}
                              {pr.elapsed_ms &&
                                pr.checks &&
                                layer === Object.keys(pr.checks)[0] && (
                                  <div
                                    style={{
                                      fontSize: "10px",
                                      color: P.textDim,
                                      padding: "4px 8px",
                                      fontStyle: "italic",
                                    }}
                                  >
                                    Trust stack completed in{" "}
                                    {(pr.elapsed_ms / 1000).toFixed(1)}s
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      );
                    },
                  )}
              </div>
            )}
          </div>
        );
      })}

      {pricingAssessment &&
        pricingAssessment !== "N/A — no receipt evidence submitted" && (
          <div
            style={{
              background: "#fff",
              borderRadius: "8px",
              padding: "10px 12px",
              border: `1px solid ${P.cardBorder}`,
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "1px",
                textTransform: "uppercase",
                color: P.textDim,
                marginBottom: "6px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              💰 Pricing Oracle
            </div>
            <div
              style={{
                fontSize: "12px",
                color: P.textMid,
                lineHeight: 1.5,
                fontFamily: "'JetBrains Mono', monospace",
              }}
              dir="auto"
            >
              {pricingAssessment}
            </div>
          </div>
        )}

      {provenanceAssessment && (
        <div
          style={{
            background: "#fff",
            borderRadius: "8px",
            padding: "10px 12px",
            border: `1px solid ${P.cardBorder}`,
          }}
        >
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: P.textDim,
              marginBottom: "6px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            🤖 Agent Provenance Assessment
          </div>
          <div
            style={{
              fontSize: "12px",
              color: P.textMid,
              lineHeight: 1.5,
              fontStyle: "italic",
              fontFamily: "'JetBrains Mono', monospace",
            }}
            dir="auto"
          >
            {provenanceAssessment}
          </div>
        </div>
      )}
    </div>
  );
};
