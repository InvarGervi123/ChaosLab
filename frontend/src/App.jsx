import KubernetesStatus from "./KubernetesStatus";
import IncidentHistory from "./IncidentHistory";

import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

import { useEffect, useState } from "react";
import "./App.css";

export default function App() {
  const [status, setStatus] = useState("loading");
  const [metrics, setMetrics] = useState(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);

  async function refresh() {
    try {
      const response = await fetch("http://localhost:3001/api/status");
      if (!response.ok) throw new Error();
      const data = await response.json();
      setStatus(data.status);

      if (data.status === "running") {
        const result = await fetch("http://localhost:3001/api/metrics");
if (result.ok) {
  const m = await result.json();
  setMetrics(m);

  setHistory(prev => [
    ...prev.slice(-29),
    {
      time: new Date().toLocaleTimeString(),
      cpu: m.cpu,
      ram: m.memoryPercent
    }
  ]);
} else {
  setMetrics(null);
}
      } else {
        setMetrics(null);
      }
    } catch {
      setStatus("unavailable");
      setMetrics(null);
    }
  }

  async function action(endpoint) {
    setBusy(true);
    try {
      const response = await fetch(`http://localhost:3001/api/${endpoint}`, {
        method: "POST"
      });
      if (!response.ok) throw new Error("Action failed");
      await refresh();
    } catch {
      alert("Action failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className="dashboard">
      <h1>⚡ ChaosLab</h1>
      <p>Docker Infrastructure Control Center</p>

      <section className="panel">
        <h2>🐳 chaos-web</h2>
        <p>Status: <strong>{status.toUpperCase()}</strong></p>

        <div className="actions">
          <button
            disabled={busy || status !== "running"}
            onClick={() => action("chaos")}
          >
            🔴 Stop Container
          </button>
          <button
            disabled={busy || status !== "exited"}
            onClick={() => action("recover")}
          >
            🟢 Recover Container
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>📊 Live Metrics</h2>
        {metrics ? (
          <>
            <p>CPU: {metrics.cpu}%</p>
            <progress value={metrics.cpu} max="100" />

            <p>Memory: {metrics.memory}</p>
            <progress value={metrics.memoryPercent} max="100" />

            <p>Memory Usage: {metrics.memoryPercent}%</p>
            <p>Network I/O: {metrics.network}</p>
          </>
        ) : (
          <p>Metrics unavailable</p>
        )}
      </section>

      <section className="panel">
        <h2>📈 Performance History</h2>
        <div style={{ width: "100%", height: 250 }}>
          <ResponsiveContainer>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="cpu"
                stroke="#a78bfa"
                dot={false}
                name="CPU %"
              />
              <Line
                type="monotone"
                dataKey="ram"
                stroke="#22c55e"
                dot={false}
                name="RAM %"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    <KubernetesStatus />
      <IncidentHistory />
    </main>
  );
}
