import type { CSSProperties } from "react";

export const P = {
  bg: "#f4f6f9",
  shutterBg: "rgba(255,255,255,0.85)",
  shutterClosed: "#eaecf0",
  card: "#ffffff",
  cardBorder: "#e2e5ea",
  teal: "#0f7173",
  tealSoft: "#e6f2f2",
  tealBorder: "#b3d9d9",
  green: "#16a34a",
  greenSoft: "#ecfdf5",
  greenBorder: "#86efac",
  orange: "#d97706",
  orangeSoft: "#fffbeb",
  orangeBorder: "#fcd34d",
  red: "#dc2626",
  text: "#111827",
  textMid: "#4b5563",
  textDim: "#9ca3af",
  divider: "#e5e7eb",
};

export const frozenBanner: CSSProperties = {
  background: "#e6f2f2",
  border: "1px solid #b3d9d9",
  borderRadius: "8px",
  padding: "8px 16px",
  marginBottom: "16px",
  fontSize: "12px",
  color: "#0f7173",
  fontWeight: 500,
  textAlign: "center",
};

export const lbl: CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: "#374151",
  marginBottom: "8px",
};

export const lblS: CSSProperties = {
  ...lbl,
  fontSize: "10px",
  marginBottom: "6px",
};

export const inp: CSSProperties = {
  width: "100%",
  padding: "15px 18px",
  background: "#fff",
  border: "1px solid #d1d5db",
  borderRadius: "10px",
  color: "#111827",
  fontSize: "14px",
  fontFamily: "'JetBrains Mono', monospace",
  transition: "all .2s ease",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

export const inpC: CSSProperties = {
  ...inp,
  padding: "12px 14px",
  fontSize: "13px",
};

export const inpFrozen: CSSProperties = {
  ...inpC,
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  color: "#6b7280",
  cursor: "default",
};

export const btnP: CSSProperties = {
  width: "100%",
  padding: "17px",
  background: "#0f7173",
  border: "none",
  borderRadius: "12px",
  color: "#fff",
  fontSize: "14px",
  fontWeight: 700,
  fontFamily: "'Space Grotesk', sans-serif",
  letterSpacing: "0.5px",
  cursor: "pointer",
  transition: "all .2s ease",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 2px 8px rgba(15,113,115,.2)",
};

export const chip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "12px",
  color: "#0f7173",
  background: "#e6f2f2",
  border: "1px solid #b3d9d9",
  borderRadius: "8px",
  padding: "7px 16px",
  textDecoration: "none",
  fontWeight: 600,
};

export const xBtn: CSSProperties = {
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  padding: "11px 14px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  width: "100%",
  color: "#4b5563",
  fontSize: "12px",
  fontWeight: 500,
  fontFamily: "'Space Grotesk', sans-serif",
};
