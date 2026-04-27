import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

type HealthState =
  | { status: "loading" }
  | { status: "ok"; data: unknown }
  | { status: "error"; message: string };

export default function App() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    fetch("/api/health")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setHealth({ status: "ok", data }))
      .catch((err) => setHealth({ status: "error", message: String(err) }));
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" style={{ color: "#0f7173" }}>
            Construct — scaffold smoke test
          </h1>
          <ConnectButton />
        </header>

        <section className="rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide">
            Backend health
          </h2>
          {health.status === "loading" && (
            <p className="mt-2 text-slate-600">Pinging /api/health…</p>
          )}
          {health.status === "error" && (
            <p className="mt-2 text-red-600">Error: {health.message}</p>
          )}
          {health.status === "ok" && (
            <pre className="mt-2 text-xs bg-slate-50 p-3 rounded overflow-x-auto">
              {JSON.stringify(health.data, null, 2)}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}
