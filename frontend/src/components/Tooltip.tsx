import {
  useState,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from "react";
import ReactDOM from "react-dom";

export const Tooltip = ({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) => {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleEnter = (e: ReactMouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let x = rect.left + rect.width / 2;
    x = Math.max(130, Math.min(x, window.innerWidth - 130));
    setPos({ x, y: rect.top });
    setShow(true);
  };

  return (
    <div
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
      style={{ position: "relative", display: "inline-flex" }}
    >
      {children}
      {show &&
        ReactDOM.createPortal(
          <div
            style={{
              position: "fixed",
              left: pos.x,
              top: pos.y - 8,
              transform: "translate(-50%, -100%)",
              background: "#1f2937",
              color: "#f9fafb",
              fontSize: "11px",
              lineHeight: 1.5,
              padding: "8px 12px",
              borderRadius: "8px",
              maxWidth: "240px",
              width: "max-content",
              zIndex: 9999,
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
              pointerEvents: "none",
              animation: "fadeIn 0.15s ease",
              fontWeight: 400,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {text}
            <div
              style={{
                position: "absolute",
                bottom: "-4px",
                left: "50%",
                transform: "translateX(-50%) rotate(45deg)",
                width: "8px",
                height: "8px",
                background: "#1f2937",
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
};
