import { useEffect, useState } from "react";

export default function KubernetesStatus() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const response = await fetch("http://localhost:3001/api/kubernetes/pods");
        if (!response.ok) throw new Error("API unavailable");
        const result = await response.json();

        if (active) {
          setData(result);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    }

    refresh();
    const timer = setInterval(refresh, 3000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="panel">
      <h2>☸️ Kubernetes Cluster</h2>

      {error ? (
        <p>⚠️ Kubernetes API unavailable</p>
      ) : !data ? (
        <p>Loading Kubernetes...</p>
      ) : (
        <>
          <p>Pods: <strong>{data.ready}/{data.total} Ready</strong></p>
          <p>Total Restarts: <strong>{data.restarts}</strong></p>

          <div className="k8s-pods">
            {data.pods.map(pod => (
              <div className="k8s-pod" key={pod.name}>
                <span>{pod.ready ? "🟢" : "🔴"} {pod.name}</span>
                <span>{pod.status} · {pod.restarts} restarts</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
