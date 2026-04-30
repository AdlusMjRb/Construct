import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  DeploymentData,
  Milestone,
  VerificationResult,
} from "../lib/types";
import { btnP, chip, inpC, lblS, P, xBtn } from "../lib/tokens";
import {
  AgentIcon,
  CheckIcon,
  ChevronIcon,
  ExternalLinkIcon,
  FileIcon,
  GlobeIcon,
  RobotIcon,
  ShieldIcon,
  UploadIcon,
} from "./icons";
import { ConfidenceBadge, EvidenceTypeBadge } from "./Badges";
import { CriterionCard } from "./CriterionCard";
import { TrustStackPanel } from "./TrustStackPanel";

interface LanguageOption {
  code: string;
  label: string;
  native: string;
}

export interface Shutter3Props {
  // Display data (may be translated copies — see App.tsx invariant comment)
  displayMilestones: Milestone[];
  displayResults: Record<string, VerificationResult>;
  deploymentData: DeploymentData | null;

  // Evidence inputs
  evidenceFiles: Record<string, File[]>;
  evidenceText: Record<string, string>;
  setEvidenceText: Dispatch<SetStateAction<Record<string, string>>>;
  handleFileUpload: (mid: string, files: FileList) => void;
  removeFile: (mid: string, fileIndex: number) => void;

  // UI state
  expandedThoughts: Record<string, boolean>;
  toggleThought: (id: string) => void;
  expandedEvidence: Record<string, boolean>;
  toggleEvidence: (id: string) => void;
  expandedCriteria: Record<string, boolean>;
  setExpandedCriteria: Dispatch<SetStateAction<Record<string, boolean>>>;

  // Lifecycle
  isTransitioning: boolean;
  isActive: boolean;
  verifyingMilestone: string | null;
  releasingMilestone: string | null;
  handleVerifySingle: (milestoneId: string, milestoneIndex: number) => void;
  handleManualRelease: (milestoneId: string, milestoneIndex: number) => void;

  // Language
  languages: LanguageOption[];
  displayLang: string;
  canonicalLang: string;
  translating: boolean;
  translatedMilestonesPresent: boolean;
  handleLanguageChange: (newLang: string) => void;

  // Send / handover
  sendingProject: boolean;
  sendModalOpen: boolean;
  setSendModalOpen: (open: boolean) => void;
  handleSendProject: (recipientAddress: string) => void;
}

export const Shutter3Verify = ({
  displayMilestones,
  displayResults,
  deploymentData,
  evidenceFiles,
  evidenceText,
  setEvidenceText,
  handleFileUpload,
  removeFile,
  expandedThoughts,
  toggleThought,
  expandedEvidence,
  toggleEvidence,
  expandedCriteria,
  setExpandedCriteria,
  isTransitioning,
  isActive,
  verifyingMilestone,
  releasingMilestone,
  handleVerifySingle,
  handleManualRelease,
  languages,
  displayLang,
  canonicalLang,
  translating,
  translatedMilestonesPresent,
  handleLanguageChange,
  sendingProject,
  sendModalOpen,
  setSendModalOpen,
  handleSendProject,
}: Shutter3Props) => {
  const [recipientAddress, setRecipientAddress] = useState("");

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "52px 44px",
        opacity: isTransitioning && isActive ? 0 : 1,
        transition: "opacity 0.3s ease",
      }}
    >
      <div style={{ marginBottom: "28px", textAlign: "center" }}>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "4px",
            textTransform: "uppercase",
            color: P.teal,
            marginBottom: "12px",
          }}
        >
          Step Three
        </div>
        <p
          style={{
            fontSize: "14px",
            color: P.textMid,
            marginTop: "6px",
            fontStyle: "italic",
            marginBottom: "20px",
          }}
        >
          Contractors can check milestones, payment critira, upload evidance and
          verify for payments.
        </p>
        {deploymentData && (
          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <a
              href={
                deploymentData.chainScanUrl ||
                `https://chainscan-galileo.0g.ai/address/${deploymentData.contractAddress}`
              }
              target="_blank"
              rel="noopener noreferrer"
              style={chip}
            >
              Contract <ExternalLinkIcon />
            </a>
            <a
              href="https://storagescan-galileo.0g.ai/submissions"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                navigator.clipboard.writeText(deploymentData.storageHash || "")
              }
              style={{
                ...chip,
                cursor: "pointer",
                textDecoration: "none",
              }}
              title={deploymentData.storageHash || ""}
            >
              0G Storage:{" "}
              {deploymentData.storageHash
                ? `${deploymentData.storageHash.slice(0, 10)}...${deploymentData.storageHash.slice(-6)}`
                : "N/A"}{" "}
              <ExternalLinkIcon />
            </a>
            {deploymentData.agentAddress && (
              <span
                style={{
                  ...chip,
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  color: P.green,
                }}
              >
                <AgentIcon /> Agent: {deploymentData.agentAddress.slice(0, 6)}
                ...
                {deploymentData.agentAddress.slice(-4)}
              </span>
            )}
            {deploymentData.ensSubname && deploymentData.ensTokenId && (
              <button
                onClick={() => setSendModalOpen(true)}
                disabled={sendingProject}
                style={{
                  ...chip,
                  background: "#fef3c7",
                  border: "1px solid #fcd34d",
                  color: "#92400e",
                  cursor: sendingProject ? "wait" : "pointer",
                  fontWeight: 600,
                }}
                title="Transfer this project to another wallet"
              >
                🤝 Send Project
              </button>
            )}
          </div>
        )}

        {deploymentData?.escrowAmount && (
          <div
            style={{
              marginTop: "10px",
              fontSize: "12px",
              color: P.textDim,
            }}
          >
            Builder escrow: {deploymentData.escrowAmount} OG · Agent reserve:{" "}
            {deploymentData.agentReserve} OG
          </div>
        )}

        {deploymentData && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: "14px",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "10px",
                fontWeight: 700,
                color: P.textDim,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
              }}
            >
              <GlobeIcon /> View in
            </span>
            <select
              value={displayLang}
              onChange={(e) => handleLanguageChange(e.target.value)}
              disabled={translating}
              style={{
                ...inpC,
                width: "auto",
                padding: "6px 10px",
                fontSize: "12px",
                cursor: translating ? "wait" : "pointer",
                appearance: "auto",
                opacity: translating ? 0.6 : 1,
              }}
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.native}
                  {lang.code === canonicalLang ? " (original)" : ""}
                </option>
              ))}
            </select>
            {translating && (
              <span
                style={{
                  fontSize: "11px",
                  color: P.teal,
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontWeight: 600,
                }}
              >
                <span
                  className="spinner"
                  style={{
                    borderColor: "rgba(15,113,115,0.3)",
                    borderTopColor: P.teal,
                  }}
                />{" "}
                Translating...
              </span>
            )}
            {!translating &&
              displayLang !== canonicalLang &&
              translatedMilestonesPresent && (
                <span
                  style={{
                    fontSize: "10px",
                    color: P.textDim,
                    fontStyle: "italic",
                  }}
                >
                  Display only — canonical spec unchanged
                </span>
              )}
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          maxWidth: "900px",
          margin: "0 auto",
          width: "100%",
          paddingRight: "4px",
        }}
      >
        {displayMilestones.map((m, i) => {
          // `m` is the display copy (may be translated). Canonical milestone
          // is still milestones[i] in the orchestrator — used by
          // handleVerifySingle, never `m` here. `res` is also the display copy.
          const res = displayResults[m.id];
          const files = evidenceFiles[m.id] || [];
          const ok = res?.approved;
          const esc = res && !res.approved;
          const tOpen = expandedThoughts[m.id];
          const evOpen = expandedEvidence[m.id];
          const critOpen =
            expandedCriteria[`ev-${m.id}`] !== undefined
              ? expandedCriteria[`ev-${m.id}`]
              : false;
          const isReleasing = releasingMilestone === m.id;

          return (
            <div
              key={m.id}
              style={{
                background: ok ? P.greenSoft : esc ? P.orangeSoft : P.card,
                borderRadius: "12px",
                padding: "24px",
                border: `1px solid ${
                  ok ? P.greenBorder : esc ? P.orangeBorder : P.cardBorder
                }`,
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                transition: "all 0.4s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      letterSpacing: "2px",
                      textTransform: "uppercase",
                      color: ok ? P.green : esc ? P.orange : P.textDim,
                    }}
                  >
                    Milestone {i + 1} — {m.percentage}%
                    {res && (ok ? " — APPROVED" : " — ESCALATED")}
                  </span>
                  <ConfidenceBadge level={m.verification_confidence} />
                </div>
                {ok && (
                  <div style={{ color: P.green }}>
                    <CheckIcon />
                  </div>
                )}
              </div>

              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: "17px",
                  fontWeight: 600,
                  color: P.text,
                }}
                dir="auto"
              >
                {m.header}
              </h3>
              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: "14px",
                  color: P.textMid,
                  lineHeight: 1.7,
                }}
                dir="auto"
              >
                {m.description}
              </p>

              <button
                onClick={() =>
                  setExpandedCriteria((p) => ({
                    ...p,
                    [`ev-${m.id}`]: !critOpen,
                  }))
                }
                style={{
                  ...xBtn,
                  marginBottom: critOpen ? "8px" : "16px",
                  background: critOpen ? P.tealSoft : "#f9fafb",
                  border: `1px solid ${critOpen ? P.tealBorder : P.cardBorder}`,
                  color: critOpen ? P.teal : P.textMid,
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                  }}
                >
                  What to submit ({m.acceptance_criteria.length} items)
                </span>
                <div
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {m.acceptance_criteria.map((c, ci) => (
                    <EvidenceTypeBadge key={ci} type={c.evidence_type} />
                  ))}
                  <ChevronIcon open={critOpen} />
                </div>
              </button>
              {critOpen && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    marginBottom: "16px",
                    animation: "fadeIn 0.3s ease",
                  }}
                >
                  {m.acceptance_criteria.map((c, ci) => (
                    <CriterionCard
                      key={ci}
                      criterion={c}
                      index={ci}
                      frozen={true}
                    />
                  ))}
                </div>
              )}

              {!res && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div>
                    <label style={lblS}>Evidence Description</label>
                    <textarea
                      value={evidenceText[m.id] || ""}
                      onChange={(e) =>
                        setEvidenceText((p) => ({
                          ...p,
                          [m.id]: e.target.value,
                        }))
                      }
                      placeholder="Describe the evidence for this milestone..."
                      rows={3}
                      style={{ ...inpC, resize: "none" }}
                    />
                  </div>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleFileUpload(m.id, e.dataTransfer.files);
                    }}
                    onClick={() => {
                      const x = document.createElement("input");
                      x.type = "file";
                      x.multiple = true;
                      x.onchange = (ev) =>
                        handleFileUpload(
                          m.id,
                          (ev.target as HTMLInputElement).files!,
                        );
                      x.click();
                    }}
                    style={{
                      border: `2px dashed ${P.cardBorder}`,
                      borderRadius: "10px",
                      padding: files.length > 0 ? "12px" : "28px",
                      textAlign: "center",
                      cursor: "pointer",
                      background: "#fafbfc",
                    }}
                  >
                    {files.length === 0 ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <div style={{ color: P.textDim }}>
                          <UploadIcon />
                        </div>
                        <span style={{ fontSize: "13px", color: P.textDim }}>
                          Drag & drop evidence or click to upload
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        {files.map((f, fi) => (
                          <span
                            key={fi}
                            style={{
                              fontSize: "12px",
                              color: P.teal,
                              background: P.tealSoft,
                              padding: "5px 8px 5px 12px",
                              borderRadius: "6px",
                              fontWeight: 500,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            {f.name}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(m.id, fi);
                              }}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: P.red,
                                fontSize: "14px",
                                fontWeight: 700,
                                padding: "0 2px",
                                lineHeight: 1,
                                display: "flex",
                                alignItems: "center",
                              }}
                              title="Remove file"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {((evidenceText[m.id] || "").trim().length > 0 ||
                    files.length > 0) && (
                    <button
                      onClick={() => handleVerifySingle(m.id, i)}
                      disabled={!!verifyingMilestone}
                      style={{
                        ...btnP,
                        opacity:
                          verifyingMilestone === m.id
                            ? 0.6
                            : verifyingMilestone
                              ? 0.4
                              : 1,
                        padding: "13px",
                      }}
                    >
                      {verifyingMilestone === m.id ? (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span className="spinner" /> Verifying...
                        </span>
                      ) : (
                        "Verify & Pay"
                      )}
                    </button>
                  )}
                </div>
              )}

              {res && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      padding: "14px 16px",
                      borderRadius: "10px",
                      background: ok ? P.greenSoft : P.orangeSoft,
                      border: `1px solid ${
                        ok ? P.greenBorder : P.orangeBorder
                      }`,
                    }}
                  >
                    {ok && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "10px",
                        }}
                      >
                        <span style={{ fontSize: "13px", color: P.textMid }}>
                          Payment
                        </span>
                        <span
                          style={{
                            fontSize: "16px",
                            color: P.green,
                            fontWeight: 700,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {res.amountReleased
                            ? `${res.amountReleased} OG`
                            : `${m.price} OG`}
                        </span>
                      </div>
                    )}
                    {res.confidence !== undefined && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "10px",
                        }}
                      >
                        <span style={{ fontSize: "13px", color: P.textMid }}>
                          Confidence
                        </span>
                        <span
                          style={{
                            fontSize: "14px",
                            color: ok ? P.green : P.orange,
                            fontWeight: 600,
                          }}
                        >
                          {(res.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                    {ok && res.agentGasRefunded && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "10px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "13px",
                            color: P.textMid,
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          <AgentIcon /> Agent gas refund
                        </span>
                        <span
                          style={{
                            fontSize: "13px",
                            color: P.teal,
                            fontWeight: 600,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {res.agentGasRefunded} OG
                        </span>
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        gap: "16px",
                        flexWrap: "wrap",
                      }}
                    >
                      {ok && res.paymentTxHash && (
                        <a
                          href={`https://chainscan-galileo.0g.ai/tx/${res.paymentTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: "12px",
                            color: P.teal,
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            textDecoration: "none",
                            fontWeight: 500,
                          }}
                        >
                          Payment Tx <ExternalLinkIcon />
                        </a>
                      )}
                      <button
                        onClick={() =>
                          navigator.clipboard.writeText(
                            deploymentData?.storageHash || "",
                          )
                        }
                        style={{
                          fontSize: "12px",
                          color: P.teal,
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          fontWeight: 500,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          fontFamily: "'Space Grotesk', sans-serif",
                        }}
                      >
                        Spec Hash:{" "}
                        {deploymentData?.storageHash
                          ? `${deploymentData.storageHash.slice(0, 8)}...`
                          : "N/A"}{" "}
                        📋
                      </button>
                    </div>
                    {esc && (
                      <p
                        style={{
                          fontSize: "13px",
                          color: P.orange,
                          margin: "10px 0 0",
                          fontWeight: 500,
                        }}
                      >
                        AI flagged for human review — evidence insufficient or
                        ambiguous
                      </p>
                    )}
                  </div>

                  {res.provenance && res.provenance.length > 0 && (
                    <TrustStackPanel
                      provenance={res.provenance}
                      provenanceAssessment={res.provenance_assessment}
                      pricingAssessment={res.pricing_assessment}
                    />
                  )}

                  {res.criteria_check &&
                    Array.isArray(res.criteria_check) &&
                    res.criteria_check.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
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
                          }}
                        >
                          Criteria Assessment
                        </div>
                        {res.criteria_check.map((cc, cci) => (
                          <div
                            key={cci}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "8px",
                              padding: "8px 10px",
                              borderRadius: "6px",
                              background: cc.met ? "#f0fdf4" : "#fef2f2",
                              border: `1px solid ${
                                cc.met ? "#bbf7d0" : "#fecaca"
                              }`,
                            }}
                          >
                            <span
                              style={{
                                fontSize: "12px",
                                marginTop: "1px",
                              }}
                            >
                              {cc.met ? "✅" : "❌"}
                            </span>
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: P.text,
                                  marginBottom: "2px",
                                }}
                                dir="auto"
                              >
                                {cc.criterion}
                              </div>
                              {cc.evidence_type_expected &&
                                cc.evidence_type_received && (
                                  <div
                                    style={{
                                      fontSize: "10px",
                                      color: P.textDim,
                                      marginBottom: "2px",
                                    }}
                                  >
                                    Expected: {cc.evidence_type_expected} ·
                                    Received: {cc.evidence_type_received}
                                  </div>
                                )}
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: P.textMid,
                                  lineHeight: 1.4,
                                }}
                                dir="auto"
                              >
                                {cc.note}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  {esc && (
                    <button
                      onClick={() => handleManualRelease(m.id, i)}
                      disabled={isReleasing}
                      style={{
                        background: P.orange,
                        border: "none",
                        borderRadius: "10px",
                        padding: "13px 16px",
                        cursor: isReleasing ? "wait" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        width: "100%",
                        color: "#fff",
                        fontSize: "13px",
                        fontWeight: 700,
                        fontFamily: "'Space Grotesk', sans-serif",
                        opacity: isReleasing ? 0.6 : 1,
                        boxShadow: "0 2px 8px rgba(217,119,6,0.25)",
                      }}
                    >
                      {isReleasing ? (
                        <>
                          <span className="spinner" /> Confirming in wallet...
                        </>
                      ) : (
                        <>
                          <ShieldIcon /> Approve & Release Payment
                        </>
                      )}
                    </button>
                  )}

                  <button onClick={() => toggleEvidence(m.id)} style={xBtn}>
                    <FileIcon />
                    <span>
                      View Evidence ({files.length} file
                      {files.length !== 1 ? "s" : ""})
                    </span>
                    <div style={{ marginLeft: "auto" }}>
                      <ChevronIcon open={!!evOpen} />
                    </div>
                  </button>
                  {evOpen && (
                    <div
                      style={{
                        padding: "14px",
                        borderRadius: "10px",
                        background: "#fafbfc",
                        border: `1px solid ${P.cardBorder}`,
                        animation: "fadeIn 0.3s ease",
                      }}
                    >
                      {evidenceText[m.id] && (
                        <div
                          style={{
                            padding: "10px 14px",
                            background: "#fff",
                            borderRadius: "8px",
                            border: `1px solid ${P.cardBorder}`,
                            marginBottom: files.length > 0 ? "8px" : 0,
                            fontSize: "13px",
                            color: P.textMid,
                            lineHeight: 1.6,
                            fontFamily: "'JetBrains Mono', monospace",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {evidenceText[m.id]}
                        </div>
                      )}
                      {files.map((f, fi) => (
                        <div
                          key={fi}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "10px 14px",
                            background: "#fff",
                            borderRadius: "8px",
                            border: `1px solid ${P.cardBorder}`,
                            marginBottom: fi < files.length - 1 ? "8px" : 0,
                          }}
                        >
                          <FileIcon />
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontSize: "13px",
                                color: P.text,
                                fontWeight: 500,
                              }}
                            >
                              {f.name}
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: P.textDim,
                              }}
                            >
                              {(f.size / 1024).toFixed(1)} KB
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const u = URL.createObjectURL(f);
                              const a = document.createElement("a");
                              a.href = u;
                              a.download = f.name;
                              a.click();
                              URL.revokeObjectURL(u);
                            }}
                            style={{
                              background: P.tealSoft,
                              border: `1px solid ${P.tealBorder}`,
                              borderRadius: "6px",
                              padding: "5px 12px",
                              cursor: "pointer",
                              color: P.teal,
                              fontSize: "11px",
                              fontWeight: 600,
                            }}
                          >
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={() => toggleThought(m.id)} style={xBtn}>
                    <RobotIcon />
                    <span>AI Reasoning</span>
                    <div style={{ marginLeft: "auto" }}>
                      <ChevronIcon open={!!tOpen} />
                    </div>
                  </button>
                  {tOpen && (
                    <div
                      style={{
                        padding: "16px",
                        borderRadius: "10px",
                        background: P.tealSoft,
                        border: `1px solid ${P.tealBorder}`,
                        animation: "fadeIn 0.3s ease",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: "13px",
                          lineHeight: 1.8,
                          color: P.textMid,
                          fontStyle: "italic",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                        dir="auto"
                      >
                        "{res.reasoning}"
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sendModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={() => !sendingProject && setSendModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "28px",
              width: "440px",
              maxWidth: "92vw",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h3
              style={{
                margin: 0,
                marginBottom: "8px",
                fontSize: "18px",
                fontWeight: 700,
                color: P.text,
              }}
            >
              Send Project to New Owner
            </h3>
            <p
              style={{
                margin: 0,
                marginBottom: "20px",
                fontSize: "13px",
                color: P.textMid,
                lineHeight: 1.6,
              }}
            >
              This transfers the project's ENS NFT to the new owner on Sepolia.
              They will be able to load this project, see the remaining
              milestones, and continue the work. The original escrow on 0G stays
              intact.
            </p>

            <label style={lblS}>Recipient Wallet Address</label>
            <input
              type="text"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="0x..."
              disabled={sendingProject}
              style={{ ...inpC, marginBottom: "20px" }}
              autoFocus
            />

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setSendModalOpen(false)}
                disabled={sendingProject}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "#f3f4f6",
                  border: `1px solid ${P.cardBorder}`,
                  borderRadius: "10px",
                  color: P.textMid,
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleSendProject(recipientAddress)}
                disabled={sendingProject || !recipientAddress}
                style={{
                  flex: 2,
                  padding: "12px",
                  background: "#f59e0b",
                  border: "none",
                  borderRadius: "10px",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: sendingProject ? "wait" : "pointer",
                  opacity: !recipientAddress ? 0.5 : 1,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {sendingProject ? (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    <span className="spinner" /> Confirm in wallet...
                  </span>
                ) : (
                  "Send Project"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
