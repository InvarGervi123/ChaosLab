
import { useEffect, useState } from "react";

export default function IncidentHistory() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadEvents() {
      try {
        const response = await fetch("http://localhost:3001/api/incidents");
        if (!response.ok) throw new Error("Failed to fetch incidents");

        const data = await response.json();
        setEvents(data);
        setError(false);
      } catch {
        setError(true);
      }
    }

    loadEvents();
    const timer = setInterval(loadEvents, 3000);
    return () => clearInterval(timer);
  }, []);

  const alerts = events.filter(e => e.type === "ALERT");
  const recoveries = events.filter(e => e.type === "RECOVERY");

  const durations = [];
  let lastAlert = null;

  for (const event of events) {
    if (event.type === "ALERT") {
      lastAlert = new Date(event.time).getTime();
    } else if (event.type === "RECOVERY" && lastAlert !== null) {
      const duration = new Date(event.time).getTime() - lastAlert;
      if (duration >= 0) durations.push(duration);
      lastAlert = null;
    }
  }

  const average = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  return (
    <section className="panel">
      <h2>🚨 Incident History</h2>

      {error && <p>Unable to load incidents</p>}

      <p>Docker incidents: {alerts.length}</p>
      <p>Docker recoveries: {recoveries.length}</p>
      <p>
        Docker average recovery time: {average !== null ? `${average} ms` : "N/A"}
      </p>

      <div style={{ maxHeight: 250, overflowY: "auto" }}>
        {[...events].reverse().map((event, index) => (
          <p key={`${event.time}-${index}`}>
            {({
              ALERT: "🔴",
              RECOVERY: "🟢",
              K8S_REMOVED: "🔴",
              K8S_CREATED: "🔵",
              K8S_RESTART: "🟠"
            })[event.type] || "⚪"}{" "}
            {new Date(event.time).toLocaleString()} — {event.message}
          </p>
        ))}
      </div>
    </section>
  );
}
