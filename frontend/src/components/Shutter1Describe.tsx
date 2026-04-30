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
  // Load existing project (continuation loop)
  isConnected: boolean;
  loadingProjects: boolean;
  onLoadExistingClick: () => void;
}

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
}: Shutter1Props) => {
  const canSubmit = !!(projectTitle && projectDescription && totalPool);

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
          Autonomous Planning, Provenance and Payments
        </div>
        <p
          style={{
            fontSize: "15px",
            color: P.textMid,
            marginTop: "10px",
          }}
        >
          Step One{" "}
        </p>
        <p
          style={{
            fontSize: "14px",
            color: P.textMid,
            marginTop: "6px",
            fontStyle: "italic",
          }}
        >
          Describe a new project — or load one inherited from another wallet
        </p>
      </div>

      {/* Continuation loop entry point.
          Clicking this triggers a backend lookup of subnames the connected
          wallet currently owns. If exactly one is found it auto-loads into
          Shutter 2; if more, App opens a picker modal. Hidden in frozen
          view since this screen is read-only after the user has moved on. */}
      {!frozen && (
        <div
          style={{
            maxWidth: "900px",
            margin: "0 auto 24px",
            width: "100%",
            padding: "14px 18px",
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: "240px" }}>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "#92400e",
                marginBottom: "3px",
              }}
            >
              🤝 Inherited a Project?
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#92400e",
                lineHeight: 1.5,
                opacity: 0.9,
              }}
            >
              If another wallet has sent you a project NFT, load it here to
              continue the remaining milestones.
            </div>
          </div>
          <button
            onClick={onLoadExistingClick}
            disabled={!isConnected || loadingProjects}
            style={{
              padding: "10px 18px",
              background:
                !isConnected || loadingProjects ? "#fde68a" : "#f59e0b",
              border: "none",
              borderRadius: "10px",
              color: "#fff",
              fontWeight: 700,
              fontSize: "12px",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              cursor: !isConnected
                ? "not-allowed"
                : loadingProjects
                  ? "wait"
                  : "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
              whiteSpace: "nowrap",
              opacity: !isConnected ? 0.6 : 1,
              boxShadow: "0 2px 8px rgba(217,119,6,0.25)",
            }}
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
                <span className="spinner" /> Loading...
              </span>
            ) : (
              "Load Existing Project"
            )}
          </button>
        </div>
      )}

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
