import { btnP, frozenBanner, inp, inpFrozen, lbl, P } from "../lib/tokens";
import logo from "../assets/logo.svg";

export interface Shutter1Props {
  projectTitle: string;
  setProjectTitle: (v: string) => void;
  projectDescription: string;
  setProjectDescription: (v: string) => void;
  totalPool: string;
  setTotalPool: (v: string) => void;
  devWallet: string;
  setDevWallet: (v: string) => void;
  frozen: boolean;
  isTransitioning: boolean;
  isActive: boolean;
  loadingPhase: string | null;
  onGenerate: () => void;

  // Continuation-loop integration.
  isConnected: boolean;
  loadingProjects: boolean;
  onLoadExistingClick: () => void;

  /**
   * Number of projects the connected wallet currently owns on-chain.
   *
   * - `undefined` — caller hasn't wired up auto-detection yet. Component
   *   falls back to the original button-driven callout (backward-compat).
   * - `null` — connected, fetch in flight or not yet started.
   * - `number` — known count. Component renders different states for 0 vs >0
   *   so users see at a glance whether they have anything to load.
   */
  inheritedProjectCount?: number | null;
}

// ─── Styles for the state-aware Projects callout ───────────────────────────
// One layout, three visual variants. Variants change based on whether the
// wallet is connected, whether we know the count yet, and whether they own
// anything. Keeps the hierarchy: bright = act, subdued = inform, dashed =
// not yet relevant.

const calloutBase = {
  maxWidth: "900px",
  margin: "0 auto 24px",
  width: "100%",
  padding: "14px 18px",
  borderRadius: "12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  flexWrap: "wrap" as const,
};

const calloutActive = {
  ...calloutBase,
  background: "#fef3c7",
  border: "1px solid #fcd34d",
};

const calloutSubdued = {
  ...calloutBase,
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
};

const calloutNeutral = {
  ...calloutBase,
  background: "#fafafa",
  border: "1px dashed #d1d5db",
};

const calloutHeader = (color: string) =>
  ({
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
    color,
    marginBottom: "3px",
  }) as const;

const calloutSub = (color: string) =>
  ({
    fontSize: "12px",
    color,
    lineHeight: 1.5,
    opacity: 0.9,
  }) as const;

const calloutBtn = (enabled: boolean) =>
  ({
    padding: "10px 18px",
    background: enabled ? "#f59e0b" : "#fde68a",
    border: "none",
    borderRadius: "10px",
    color: "#fff",
    fontWeight: 700,
    fontSize: "12px",
    letterSpacing: "0.5px",
    textTransform: "uppercase" as const,
    cursor: enabled ? "pointer" : "not-allowed",
    fontFamily: "'Space Grotesk', sans-serif",
    whiteSpace: "nowrap" as const,
    opacity: enabled ? 1 : 0.6,
    boxShadow: "0 2px 8px rgba(217,119,6,0.25)",
  }) as const;

export const Shutter1Describe = ({
  projectTitle,
  setProjectTitle,
  projectDescription,
  setProjectDescription,
  totalPool,
  setTotalPool,
  devWallet,
  setDevWallet,
  frozen,
  isTransitioning,
  isActive,
  loadingPhase,
  onGenerate,
  isConnected,
  loadingProjects,
  onLoadExistingClick,
  inheritedProjectCount,
}: Shutter1Props) => {
  const canSubmit = !!(projectTitle && projectDescription && totalPool);

  // Auto-detection is "on" only if the caller passes a count value
  // (number or null). If undefined, we fall back to the original
  // generic callout so older callers don't break.
  const autoDetect = inheritedProjectCount !== undefined;
  const checking = autoDetect && inheritedProjectCount === null;
  const hasProjects =
    autoDetect &&
    typeof inheritedProjectCount === "number" &&
    inheritedProjectCount > 0;
  const noProjects = autoDetect && inheritedProjectCount === 0;

  // Picks which callout to render. Order of precedence matters here —
  // we always want to show the "connect" prompt first, then the
  // checking spinner, then either the active or subdued state.
  const renderProjectsCallout = () => {
    if (frozen) return null;

    // Disconnected — gentle nudge, no action button. Tells the user
    // the platform is wallet-aware without demanding anything yet.
    if (!isConnected) {
      return (
        <div style={calloutNeutral}>
          <div style={{ flex: 1, minWidth: "240px" }}>
            <div style={calloutHeader("#9ca3af")}>📂 Your projects</div>
            <div style={calloutSub("#6b7280")}>
              Connect your wallet to see projects you own — created or received.
              Your work lives on-chain, so it's here whenever you come back.
            </div>
          </div>
        </div>
      );
    }

    // Auto-detection enabled, fetch in flight.
    if (checking) {
      return (
        <div style={calloutSubdued}>
          <div style={{ flex: 1, minWidth: "240px" }}>
            <div style={calloutHeader("#6b7280")}>
              <span className="spinner" style={{ marginRight: "8px" }} />
              Checking your projects…
            </div>
            <div style={calloutSub("#6b7280")}>
              Reading what your wallet owns on-chain.
            </div>
          </div>
        </div>
      );
    }

    // Auto-detection enabled, wallet owns at least one project.
    // The interesting case — make it inviting and clearly actionable.
    if (hasProjects) {
      const count = inheritedProjectCount as number;
      const plural = count === 1 ? "" : "s";
      return (
        <div style={calloutActive}>
          <div style={{ flex: 1, minWidth: "240px" }}>
            <div style={calloutHeader("#92400e")}>
              ✨ {count} project{plural} in your wallet
            </div>
            <div style={calloutSub("#92400e")}>
              {count === 1
                ? "Pick up where you left off, or start a new project below."
                : "Continue an active project, or start a new one below."}
            </div>
          </div>
          <button
            onClick={onLoadExistingClick}
            disabled={loadingProjects}
            style={calloutBtn(!loadingProjects)}
            title={
              count === 1
                ? "Open your active project"
                : "View all projects in your wallet"
            }
          >
            {loadingProjects ? (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span className="spinner" /> Loading…
              </span>
            ) : count === 1 ? (
              "Open Project"
            ) : (
              "View Projects"
            )}
          </button>
        </div>
      );
    }

    // Auto-detection enabled, wallet owns nothing yet.
    // Reassure rather than nag. This is the "log book is empty" state.
    if (noProjects) {
      return (
        <div style={calloutSubdued}>
          <div style={{ flex: 1, minWidth: "240px" }}>
            <div style={calloutHeader("#6b7280")}>
              📂 No active projects yet
            </div>
            <div style={calloutSub("#6b7280")}>
              Projects you create or receive appear here automatically. Stored
              on-chain — return any time, on any device.
            </div>
          </div>
        </div>
      );
    }

    // Backward-compat path: caller hasn't wired up the count, so we render
    // the original generic "Inherited a Project?" callout. Keeps the page
    // working even if App.tsx hasn't been updated.
    return (
      <div style={calloutActive}>
        <div style={{ flex: 1, minWidth: "240px" }}>
          <div style={calloutHeader("#92400e")}>🤝 Inherited a Project?</div>
          <div style={calloutSub("#92400e")}>
            If another wallet has sent you a project NFT, load it here to
            continue the remaining milestones.
          </div>
        </div>
        <button
          onClick={onLoadExistingClick}
          disabled={!isConnected || loadingProjects}
          style={calloutBtn(isConnected && !loadingProjects)}
          title={
            !isConnected
              ? "Connect your wallet to check for inherited projects"
              : "Load existing project from your wallet"
          }
        >
          {loadingProjects ? (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span className="spinner" /> Loading…
            </span>
          ) : (
            "Load Existing Project"
          )}
        </button>
      </div>
    );
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "52px 44px",
        opacity: isTransitioning && isActive ? 0 : 1,
        transition: "opacity 0.3s ease",
        overflowY: "auto",
      }}
    >
      {frozen && (
        <div style={frozenBanner}>This step is complete — view only</div>
      )}

      <div style={{ marginBottom: "36px", textAlign: "center" }}>
        <img
          src={logo}
          alt="Construct"
          style={{ height: 84, margin: "0 auto", display: "block" }}
        />
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "4px",
            textTransform: "uppercase",
            color: P.teal,
            marginBottom: "56px",
          }}
        >
          END-TO-END AUTONOMOUS ESCROW
        </div>
        <p
          style={{
            fontSize: "15px",
            color: P.textMid,
            marginTop: "10px",
          }}
        >
          Step One
        </p>
        <p
          style={{
            fontSize: "14px",
            color: P.textMid,
            marginTop: "6px",
            fontStyle: "italic",
          }}
        >
          Start a new project below, or open one your wallet already holds.
        </p>
      </div>

      {/* State-aware Projects callout.
          Adapts to wallet state and ownership count so the user sees at a
          glance whether they have anything to continue. Backwards-compatible
          with the original button-driven flow when the count prop isn't
          provided. */}
      {renderProjectsCallout()}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          flex: 1,
          maxWidth: "900px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        <div>
          <label style={lbl}>Project Title</label>
          <input
            type="text"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            placeholder="Community Library — Rural Kenya"
            disabled={frozen}
            style={frozen ? inpFrozen : inp}
          />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <label style={lbl}>Description</label>
          <textarea
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            placeholder="Describe your construction project in any language..."
            disabled={frozen}
            style={{
              ...(frozen ? inpFrozen : inp),
              flex: 1,
              minHeight: "130px",
              resize: "none",
            }}
          />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gap: "16px",
          }}
        >
          <div>
            <label style={lbl}>Total Pool (OG)</label>
            <input
              type="text"
              value={totalPool}
              onChange={(e) => setTotalPool(e.target.value)}
              placeholder="0.005"
              disabled={frozen}
              style={frozen ? inpFrozen : inp}
            />
          </div>
          <div>
            <label style={lbl}>Developer Wallet</label>
            <input
              type="text"
              value={devWallet}
              onChange={(e) => setDevWallet(e.target.value)}
              placeholder="0x... (receives milestone payments)"
              disabled={frozen}
              style={frozen ? inpFrozen : inp}
            />
          </div>
        </div>
      </div>

      {!frozen && (
        <div
          style={{
            maxWidth: "900px",
            margin: "28px auto 0",
            width: "100%",
          }}
        >
          <button
            onClick={onGenerate}
            disabled={!canSubmit}
            style={{
              ...btnP,
              opacity: !canSubmit ? 0.4 : 1,
            }}
          >
            {loadingPhase === "generating" ? (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span className="spinner" /> Generating...
              </span>
            ) : (
              "Generate Milestones"
            )}
          </button>
        </div>
      )}
    </div>
  );
};
