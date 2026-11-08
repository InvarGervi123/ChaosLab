import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap,
  MarkerType, Panel, useEdgesState, useNodesState
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ServiceNode from "./ServiceNode";
import "./ControlCenter.css";

const API = "http://localhost:3001/api/lab";
const START = { proxy: { x: 90, y: 185 }, api: { x: 490, y: 185 }, db: { x: 890, y: 185 } };
const NODE_TYPES = { service: ServiceNode };
const STATES = { healthy: "Healthy", degraded: "Degraded", unhealthy: "Unhealthy", stopped: "Stopped", unknown: "Unknown" };
const fallback = value => value == null || value === "" ? "Not Available" : value;
const time = value => value ? new Date(value).toLocaleTimeString() : "Not Available";

function downstream(id, edges) {
  const visited = new Set();
  const queue = [id];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of edges) {
      if (edge.to === current && !visited.has(edge.from) && edge.from !== id) {
        visited.add(edge.from);
        queue.push(edge.from);
      }
    }
  }
  return visited;
}

export default function ControlCenter({ authenticated }) {
  const [topology, setTopology] = useState(null);
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState("api");
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("overview");
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(API + "/topology", { cache: "no-store" });
      if (!response.ok) throw new Error("Backend returned " + response.status);
      const data = await response.json();
      setTopology(data);
      setError("");
    } catch (failure) {
      setTopology(null);
      setError(failure.message || "Backend unreachable");
    }
    try {
      const response = await fetch(API + "/events", { cache: "no-store" });
      if (response.ok) setEvents(await response.json());
      else setEvents([]);
    } catch { setEvents([]); }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!authenticated) { setDetails(null); return; }
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(API + "/services/" + selected, { credentials: "include" });
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json();
        if (alive) setDetails(data);
      } catch { if (alive) setDetails(null); }
    };
    setDetails(null);
    load();
    const timer = setInterval(load, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [selected, authenticated]);

  // Update live data without resetting positions the user dragged.
  useEffect(() => {
    const services = topology?.services || [];
    setNodes(previous => services.map(service => {
      const existing = previous.find(node => node.id === service.id);
      return {
        id: service.id,
        type: "service",
        position: existing?.position || START[service.id] || { x: 80, y: 80 },
        data: { service },
        draggable: true
      };
    }));
  }, [topology, setNodes]);

  const dependencies = topology?.edges || [];
  const affected = useMemo(() => downstream(selected, dependencies), [selected, dependencies]);
  const selectedService = topology?.services?.find(service => service.id === selected);
  const attention = topology?.services?.filter(service => ["unhealthy", "degraded", "stopped"].includes(service.status)) || [];
  const failing = useMemo(() => new Set(attention.map(s => s.id)), [attention]);
  const potentiallyAffected = useMemo(() => {
    const impacted = new Set();
    for (const service of attention) for (const id of downstream(service.id, dependencies)) impacted.add(id);
    return impacted;
  }, [attention, dependencies]);

  useEffect(() => {
    setEdges(dependencies.map(dep => {
      const risk = failing.has(dep.to);
      const focus = dep.to === selected || dep.from === selected || affected.has(dep.from);
      return {
        id: dep.from + "--" + dep.to,
        source: dep.from,
        target: dep.to,
        type: "smoothstep",
        selectable: false,
        animated: false,
        label: dep.label || "Configured dependency",
        labelStyle: { fill: "#a7bbd4", fontSize: 12, fontWeight: 600 },
        labelBgStyle: { fill: "#101d30", fillOpacity: 0.96 },
        labelBgPadding: [8, 5],
        labelBgBorderRadius: 6,
        style: { stroke: risk ? "#f38c91" : focus ? "#f5b66e" : "#6683a5", strokeWidth: focus || risk ? 2.8 : 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: risk ? "#f38c91" : "#6683a5", width: 17, height: 17 }
      };
    }));
  }, [dependencies, selected, affected, failing, setEdges]);

  async function experiment(action) {
    if (!authenticated || busy) return;
    const verb = action === "stop" ? "Stop" : "Recover";
    if (!window.confirm(verb + " the disposable lab API?\nOnly chaoslab-lab-api can be controlled. The proxy route may fail until recovery.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(API + "/experiments/" + (action === "stop" ? "stop-api" : "recover-api"), {
        method: "POST", credentials: "include"
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Experiment failed");
      setMessage(result.note || "Action completed");
      await refresh();
    } catch (failure) {
      setMessage(failure.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="lab-control-center">
      <div className="lab-heading">
        <div>
          <div className="lab-kicker"><span className="lab-kicker-dot" /> CHAOSLAB <span>/</span> CONTROL CENTER <span>/</span> LOCAL LAB</div>
          <h2>Infrastructure overview</h2>
          <p>Inspect real service health, follow dependencies and experiment safely.</p>
        </div>
        <div className="lab-heading-actions">
          <span className="lab-data-source">SOURCE: DOCKER INSPECT</span>
          <button type="button" onClick={refresh} className="lab-secondary-button">↻ Refresh</button>
        </div>
      </div>

      <div className="lab-kpis">
        <div className="lab-kpi"><span>Monitored services</span><strong>{topology ? topology.services.length : "—"}</strong><small>Isolated Compose lab</small></div>
        <div className="lab-kpi"><span>Healthy</span><strong className="lab-green">{topology ? topology.services.filter(s => s.status === "healthy").length : "—"}</strong><small>Docker health checks</small></div>
        <div className="lab-kpi"><span>Needs attention</span><strong className={attention.length ? "lab-red" : ""}>{topology ? attention.length : "—"}</strong><small>Unhealthy / degraded / stopped</small></div>
        <div className="lab-kpi"><span>Last observation</span><strong className="lab-kpi-time">{time(topology?.observedAt)}</strong><small>Automatic refresh · 3 sec</small></div>
      </div>

      {error && <div className="lab-alert" role="alert">Observation unavailable: {error}. No simulated status is displayed.</div>}

      <div className="lab-workspace">
        <div className="lab-workspace-main">
          <div className="lab-section-bar">
            <div><span className="lab-section-kicker">01 / SYSTEM TOPOLOGY</span><h3>Service dependency map</h3></div>
            <span className="lab-legend"><i className="lab-legend-green" /> Healthy <i className="lab-legend-red" /> Unhealthy <i className="lab-legend-gray" /> Unknown</span>
          </div>
          <div className="lab-flow" aria-label="Interactive infrastructure topology">
            <ReactFlow
              nodes={nodes.map(node => ({
                ...node,
                className: potentiallyAffected.has(node.id) ? "lab-node-at-risk" : "",
                selected: node.id === selected
              }))}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => { setSelected(node.id); setTab("overview"); }}
              nodesConnectable={false}
              elementsSelectable
              panOnDrag
              zoomOnScroll
              minZoom={0.45}
              maxZoom={1.6}
              fitView
              fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
              proOptions={{ hideAttribution: false }}
            >
              <Background variant={BackgroundVariant.Dots} color="#28405a" gap={22} size={1.3} />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap
                pannable zoomable
                nodeColor={node => {
                  const status = node.data?.service?.status;
                  return status === "healthy" ? "#3cc99a" : status === "stopped" || status === "unhealthy" ? "#f08088" : "#7488a5";
                }}
                maskColor="rgba(5,12,23,.65)"
                position="bottom-right"
              />
              <Panel position="top-left" className="lab-flow-caption">
                <span className="lab-live-pulse" /> {topology ? "LIVE OBSERVATIONS" : "NO LIVE DATA"}
                <span className="lab-flow-caption-sub">Configured dependencies · arrows point to required services</span>
              </Panel>
            </ReactFlow>
          </div>
          <div className="lab-map-footer">
            <span>Drag nodes to rearrange · scroll to zoom · drag canvas to pan</span>
            <span>Amber outlines indicate <b>possible</b> downstream impact</span>
          </div>
          <div className="lab-bottom-grid">
            <section className="lab-card">
              <div className="lab-section-bar"><div><span className="lab-section-kicker">02 / EXPERIMENT</span><h3>Controlled failure test</h3></div><span className="lab-tag lab-tag-safe">ISOLATED</span></div>
              <p>Stop the disposable API, watch dependent services, then recover it. Existing ChaosLab containers are not targeted.</p>
              <div className="lab-experiment-target"><span>◈</span><div><b>Backend API</b><small>chaoslab-lab-api · allowed target</small></div><span className={"lab-health lab-health--" + (topology?.services?.find(s => s.id === "api")?.status || "unknown")}>{STATES[topology?.services?.find(s => s.id === "api")?.status] || "Unknown"}</span></div>
              <div className="lab-action-row">
                <button type="button" className="lab-danger-button" disabled={!authenticated || busy || topology?.services?.find(s => s.id === "api")?.status !== "healthy"} onClick={() => experiment("stop")}>■ Stop test API</button>
                <button type="button" className="lab-success-button" disabled={!authenticated || busy || topology?.services?.find(s => s.id === "api")?.containerStatus !== "exited"} onClick={() => experiment("start")}>↻ Recover API</button>
              </div>
              {!authenticated && <p className="lab-note">Sign in with the existing Admin Login to run an experiment.</p>}
              {message && <p className="lab-message" role="status">{message}</p>}
            </section>
            <section className="lab-card">
              <div className="lab-section-bar"><div><span className="lab-section-kicker">03 / OBSERVATIONS</span><h3>Latest events</h3></div><span className="lab-tag">OBSERVED</span></div>
              {events.length ? events.slice(0, 4).map(event => (
                <div className="lab-event" key={event.id}>
                  <span className="lab-event-indicator" />
                  <div><strong>{event.service} · {event.type === "STATE_CHANGE" ? "State transition" : "Admin action"}</strong>
                    <small>{event.action || ((event.previous || "Unknown") + " → " + (event.current || "Unknown"))} · Cause: {event.cause || "Unknown"}</small></div>
                  <time>{time(event.time)}</time>
                </div>
              )) : <div className="lab-empty-events">No recorded events yet. Observed transitions will appear here.</div>}
            </section>
          </div>
        </div>
        <aside className="lab-inspector">
          <div className="lab-inspector-top"><span className="lab-section-kicker">SERVICE INSPECTOR</span><span className="lab-inspector-index">DETAIL VIEW</span></div>
          {selectedService ? <>
            <div className="lab-inspector-heading">
              <span className="lab-inspector-icon">{selected === "proxy" ? "↗" : selected === "api" ? "⌘" : "▤"}</span>
              <div><h3>{selectedService.name}</h3><p>{selectedService.kind} · {selectedService.id}</p></div>
            </div>
            <span className={"lab-health lab-health--" + selectedService.status}><i />{STATES[selectedService.status] || "Unknown"}</span>
            <p className="lab-inspector-description">{selectedService.role}</p>
            <div className="lab-inspector-tabs">
              <button type="button" className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button>
              <button type="button" className={tab === "impact" ? "active" : ""} onClick={() => setTab("impact")}>Dependencies</button>
            </div>
            {tab === "overview" ? <>
              <div className="lab-detail-title">RUNTIME</div>
              <dl className="lab-facts">
                <dt>Container</dt><dd>{selectedService.container}</dd>
                <dt>Docker status</dt><dd>{fallback(selectedService.containerStatus)}</dd>
                <dt>Health check</dt><dd>{fallback(selectedService.applicationHealth)}</dd>
                <dt>Port</dt><dd>{fallback(selectedService.port)}</dd>
                <dt>Last started</dt><dd>{selectedService.lastStarted ? new Date(selectedService.lastStarted).toLocaleString() : "Not Available"}</dd>
              </dl>
              <div className="lab-detail-title">RESOURCE METRICS</div>
              <dl className="lab-facts">
                <dt>CPU</dt><dd>{authenticated && details?.id === selected && details?.metrics ? details.metrics.cpuPercent + "%" : "Not Available"}</dd>
                <dt>Memory</dt><dd>{authenticated && details?.id === selected && details?.metrics ? details.metrics.memoryUsage : "Not Available"}</dd>
                <dt>Network I/O</dt><dd>{authenticated && details?.id === selected && details?.metrics ? fallback(details.metrics.networkIO) : "Not Available"}</dd>
                <dt>Response time</dt><dd>Not Available</dd>
                <dt>Application logs</dt><dd>Not Available</dd>
              </dl>
              {!authenticated && <p className="lab-note">Resource metrics require administrator login.</p>}
            </> : <>
              <div className="lab-detail-title">CONFIGURED DEPENDENCIES</div>
              <div className="lab-dependency-list">
                <p>Requires: <strong>{dependencies.filter(edge => edge.from === selected).map(edge => edge.to).join(", ") || "None"}</strong></p>
                <p>Required by: <strong>{dependencies.filter(edge => edge.to === selected).map(edge => edge.from).join(", ") || "None"}</strong></p>
                <p>Potentially impacted: <strong>{[...affected].join(", ") || "None"}</strong></p>
              </div>
              <p className="lab-note">Edges are defined by the Compose architecture. Potential impact is not proof of a service outage or root cause.</p>
            </>}
            {!selectedService.observed && <div className="lab-alert">{selectedService.detail || "No reliable observation"}</div>}
          </> : <div className="lab-empty-events">Select a service on the map to inspect it.</div>}
          <div className="lab-inspector-footer"><span>DATA PROVENANCE</span><p>Docker inspect + declared Compose dependencies. Unknown values are never estimated.</p></div>
        </aside>
      </div>
    </section>
  );
}
