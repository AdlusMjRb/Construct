import type { AcceptanceCriterion, Milestone } from "../lib/types";
import {
  btnP,
  frozenBanner,
  inpC,
  inpFrozen,
  lblS,
  P,
  xBtn,
} from "../lib/tokens";
import { ConfidenceBadge, EvidenceTypeBadge } from "./Badges";
import { CriterionCard } from "./CriterionCard";
import {
  AgentIcon,
  ChevronIcon,
  LockedIcon,
  LockIcon,
  TrashIcon,
} from "./icons";

interface Fees {
  budget: number;
  agentFee: number;
  total: number;
}

export interface Shutter2Props {
  milestones: Milestone[];
  expandedCriteria: Record<string, boolean>;
  toggleCriteria: (id: string) => void;
  updateMilestone: (id: string, field: string, value: unknown) => void;
  updateCriterion: (
    milestoneId: string,
    criterionIndex: number,
    updated: AcceptanceCriterion,
  ) => void;
  toggleLock: (id: string) => void;
  deleteMilestone: (id: string) => void;
  fees: Fees;
  allLocked: boolean;
  frozen: boolean;
  isTransitioning: boolean;
  isActive: boolean;
  loadingPhase: string | null;
  onDeploy: () => void;
}

export const Shutter2Review = ({
  milestones,
  expandedCriteria,
  toggleCriteria,
  updateMilestone,
  updateCriterion,
  toggleLock,
  deleteMilestone,
  fees,
  allLocked,
  frozen,
  isTransitioning,
  isActive,
  loadingPhase,
  onDeploy,
}: Shutter2Props) => {
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
      {frozen && (
        <div style={frozenBanner}>Milestones deployed — view only</div>
      )}

      <div style={{ marginBottom: "28px", textAlign: "center" }}>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "4px",
            textTransform: "uppercase",
            color: P.teal,
            marginBottom: "10px",
          }}
        >
          Step Two
        </div>
        <p style={{ fontSize: "14px", color: P.textMid, margin: 0 }}>
          {frozen
            ? "Milestones have been deployed to 0G Chain."
            : "Edit your milestones, then Lock and Deploy your project on-chain. Don't forget to sign the transaction in your wallet."}
        </p>
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
        {milestones.map((m, i) => {
          const isLocked = m.locked || frozen;
          const critOpen = expandedCriteria[m.id] !== false;
          return (
            <div
              key={m.id}
              style={{
                background: P.card,
                borderRadius: "12px",
                padding: "24px",
                border: `1px solid ${isLocked ? P.tealBorder : P.cardBorder}`,
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
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
                      color: isLocked ? P.teal : P.textDim,
                      fontWeight: 600,
                      letterSpacing: "2px",
                      textTransform: "uppercase",
                    }}
                  >
                    Milestone {i + 1} — {m.percentage}%
                  </span>
                  <ConfidenceBadge level={m.verification_confidence} />
                </div>
                {!frozen && (
                  <div style={{ display: "flex", gap: "8px" }}>
                    {!m.locked && (
                      <button
                        onClick={() => deleteMilestone(m.id)}
                        style={{
                          background: "#fef2f2",
                          border: "1px solid #fecaca",
                          borderRadius: "8px",
                          padding: "7px",
                          cursor: "pointer",
                          color: P.red,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <TrashIcon />
                      </button>
                    )}
                    <button
                      onClick={() => toggleLock(m.id)}
                      style={
                        m.locked
                          ? {
                              background: P.tealSoft,
                              border: `1px solid ${P.tealBorder}`,
                              borderRadius: "8px",
                              padding: "7px",
                              cursor: "pointer",
                              color: P.teal,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }
                          : {
                              background: "#f9fafb",
                              border: `1px solid ${P.cardBorder}`,
                              borderRadius: "8px",
                              padding: "7px",
                              cursor: "pointer",
                              color: P.textDim,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }
                      }
                    >
                      {m.locked ? <LockedIcon /> : <LockIcon />}
                    </button>
                  </div>
                )}
                {frozen && (
                  <div style={{ color: P.teal }}>
                    <LockedIcon />
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div>
                  <label style={lblS}>Header</label>
                  <input
                    type="text"
                    value={m.header}
                    onChange={(e) =>
                      updateMilestone(m.id, "header", e.target.value)
                    }
                    disabled={isLocked}
                    style={isLocked ? inpFrozen : inpC}
                  />
                </div>
                <div>
                  <label style={lblS}>Description</label>
                  <textarea
                    value={m.description}
                    onChange={(e) =>
                      updateMilestone(m.id, "description", e.target.value)
                    }
                    disabled={isLocked}
                    rows={2}
                    style={{
                      ...(isLocked ? inpFrozen : inpC),
                      resize: "none",
                    }}
                  />
                </div>

                <div>
                  <button
                    onClick={() => toggleCriteria(m.id)}
                    style={{
                      ...xBtn,
                      marginBottom: critOpen ? "8px" : 0,
                      background: critOpen ? P.tealSoft : "#f9fafb",
                      border: `1px solid ${
                        critOpen ? P.tealBorder : P.cardBorder
                      }`,
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
                      Evidence Criteria ({m.acceptance_criteria.length})
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
                        animation: "fadeIn 0.3s ease",
                      }}
                    >
                      {m.acceptance_criteria.map((c, ci) => (
                        <CriterionCard
                          key={ci}
                          criterion={c}
                          index={ci}
                          frozen={isLocked}
                          onUpdate={(updated) =>
                            updateCriterion(m.id, ci, updated)
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label style={lblS}>Payment (OG)</label>
                  <input
                    type="text"
                    value={m.price}
                    onChange={(e) =>
                      updateMilestone(m.id, "price", e.target.value)
                    }
                    disabled={isLocked}
                    style={isLocked ? inpFrozen : inpC}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!frozen && (
        <div
          style={{
            maxWidth: "900px",
            margin: "24px auto 0",
            width: "100%",
          }}
        >
          {allLocked && milestones.length > 0 && (
            <div
              style={{
                background: P.tealSoft,
                border: `1px solid ${P.tealBorder}`,
                borderRadius: "12px",
                padding: "18px 22px",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: P.teal,
                  marginBottom: "14px",
                }}
              >
                Transaction Summary
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                }}
              >
                <span style={{ fontSize: "14px", color: P.textMid }}>
                  Builder receives
                </span>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: P.text,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {fees.budget.toFixed(4)} OG
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "14px",
                    color: P.textMid,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <AgentIcon /> Transaction fees{" "}
                  <span style={{ fontSize: "11px", color: P.textDim }}>
                    (5%)
                  </span>
                </span>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: P.text,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {fees.agentFee.toFixed(4)} OG
                </span>
              </div>
              <div
                style={{
                  borderTop: `1px solid ${P.tealBorder}`,
                  marginTop: "10px",
                  paddingTop: "10px",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: 700,
                    color: P.text,
                  }}
                >
                  You pay
                </span>
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: 700,
                    color: P.teal,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {fees.total.toFixed(4)} OG
                </span>
              </div>
            </div>
          )}
          <button
            onClick={onDeploy}
            disabled={!allLocked}
            style={{ ...btnP, opacity: allLocked ? 1 : 0.4 }}
          >
            {loadingPhase === "deploying" ||
            loadingPhase === "wallet-deploy" ? (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span className="spinner" />{" "}
                {loadingPhase === "wallet-deploy"
                  ? "Deploying..."
                  : "Preparing..."}
              </span>
            ) : allLocked ? (
              "Deploy & Fund Escrow"
            ) : (
              `Lock all milestones (${
                milestones.filter((m) => m.locked).length
              }/${milestones.length})`
            )}
          </button>
        </div>
      )}
    </div>
  );
};
