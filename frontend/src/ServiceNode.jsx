import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

const statusLabel = {
  healthy: "HEALTHY", degraded: "DEGRADED", unhealthy: "UNHEALTHY",
  stopped: "STOPPED", unknown: "UNKNOWN"
};

function ServiceNode({ data, selected }) {
  const service = data.service;
  const state = service.status || "unknown";
  return (
    <div className={`lab-service-node lab-service-node--${state} ${selected ? "lab-service-node--selected" : ""}`}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="lab-service-node__top">
        <span className="lab-service-node__icon">{service.id === "proxy" ? "↗" : service.id === "api" ? "⌘" : "▤"}</span>
        <span className={`lab-health lab-health--${state}`}><i />{statusLabel[state] || "UNKNOWN"}</span>
      </div>
      <strong>{service.name}</strong>
      <span className="lab-service-node__kind">{service.kind}</span>
      <div className="lab-service-node__bottom">
        <span>{service.containerStatus === "running" ? "● Running" : service.containerStatus || "Unknown"}</span>
        <span>{service.applicationHealth === "healthy" ? "Healthcheck passed" : "Health: " + (service.applicationHealth || "Unknown")}</span>
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

export default memo(ServiceNode);
