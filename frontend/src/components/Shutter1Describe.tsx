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
          Describe your project and let Construct generate your milestones
        </p>
      </div>

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
