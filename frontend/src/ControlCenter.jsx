import {useCallback,useEffect,useRef,useState} from "react";
import "./ControlCenter.css";
const BASE="http://localhost:3001/api/lab";
const DEFAULT={proxy:{x:80,y:130},api:{x:380,y:130},db:{x:680,y:130}};
const LABEL={healthy:"Healthy",degraded:"Degraded",unhealthy:"Unhealthy",stopped:"Stopped",unknown:"Unknown"};
const fmt=v=>v==null||v===""?"Not Available":v;
export default function ControlCenter({authenticated}){
 const [top,setTop]=useState(null),[error,setError]=useState(""),[selected,setSelected]=useState("api"),[details,setDetails]=useState(null),[events,setEvents]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [pos,setPos]=useState(DEFAULT),[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0});
 const drag=useRef(null);
 const refresh=useCallback(async()=>{
  try{const res=await fetch(BASE+"/topology",{cache:"no-store"});if(!res.ok)throw Error("Backend "+res.status);setTop(await res.json());setError("");}
  catch(e){setTop(null);setError(e.message||"Backend unavailable");}
  try{const res=await fetch(BASE+"/events");if(res.ok)setEvents(await res.json());}catch{setEvents([]);}
 },[]);
 useEffect(()=>{refresh();const t=setInterval(refresh,3000);return()=>clearInterval(t)},[refresh]);
 useEffect(()=>{if(!authenticated){setDetails(null);return}let active=true;
  async function load(){try{const r=await fetch(BASE+"/services/"+selected,{credentials:"include"});if(!r.ok)throw Error();const value=await r.json();if(active)setDetails(value);}
  catch{if(active)setDetails(null)}}
  setDetails(null);load();const t=setInterval(load,5000);return()=>{active=false;clearInterval(t)}
 },[selected,authenticated]);
 const services=top?.services||[],edges=top?.edges||[];
 const chosen=services.find(s=>s.id===selected);
 const impacted=new Set(),queue=[selected];while(queue.length){const id=queue.shift();for(const e of edges)if(e.to===id&&!impacted.has(e.from)){impacted.add(e.from);queue.push(e.from)}}
 function onNodeDown(e,id){if(e.button!==0)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);drag.current={id,x:e.clientX,y:e.clientY}}
 function onMove(e){if(!drag.current)return;const d=drag.current,dx=e.clientX-d.x,dy=e.clientY-d.y;drag.current={...d,x:e.clientX,y:e.clientY};if(d.id)setPos(p=>({...p,[d.id]:{x:Math.max(10,Math.min(860,p[d.id].x+dx/zoom)),y:Math.max(35,Math.min(350,p[d.id].y+dy/zoom))}}));else setPan(p=>({x:p.x+dx,y:p.y+dy}))}
 function onPanDown(e){if(e.button!==0||e.target.closest(".cc-node"))return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY}}
 async function experiment(action){if(!authenticated||busy)return;
  if(!window.confirm((action==="stop"?"Stop":"Recover")+" the disposable test API only?"))return;
  setBusy(true);setMessage("");
  try{const r=await fetch(BASE+"/experiments/"+(action==="stop"?"stop-api":"recover-api"),{method:"POST",credentials:"include"});const x=await r.json();if(!r.ok)throw Error(x.error||"Action failed");setMessage(x.note||"Action completed");await refresh()}
  catch(e){setMessage(e.message)}finally{setBusy(false)}
 }
 return <section className="cc">
  <header className="cc-header"><div><span className="cc-overline">● LOCAL INFRASTRUCTURE LAB / DOCKER</span><h2>Infrastructure Map</h2><p>Live Docker observations · declared dependencies · no invented telemetry</p></div><button onClick={refresh}>↻ Refresh</button></header>
  <div className="cc-stats"><div><small>SERVICES</small><strong>{top?services.length:"—"}</strong></div><div><small>HEALTHY</small><strong>{top?services.filter(s=>s.status==="healthy").length:"—"}</strong></div><div><small>ATTENTION</small><strong>{top?services.filter(s=>["unhealthy","degraded","stopped"].includes(s.status)).length:"—"}</strong></div><div><small>OBSERVED AT</small><strong className="cc-time">{top?new Date(top.observedAt).toLocaleTimeString():"Not Available"}</strong></div></div>
  {error&&<p className="cc-warning" role="alert">{error}</p>}
  <div className="cc-layout">
   <div className="cc-main">
    <div className="cc-map-header"><b>TOPOLOGY</b><span>Configured dependencies →</span></div>
    <div className="cc-map" onPointerDown={onPanDown} onPointerMove={onMove} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null} onWheel={e=>{e.stopPropagation();setZoom(z=>Math.max(.65,Math.min(1.5,z+(e.deltaY<0?.1:-.1))))}}>
     <div className="cc-world" style={{transform:"translate("+pan.x+"px,"+pan.y+"px) scale("+zoom+")"}}>
      <svg viewBox="0 0 960 450" className="cc-lines" aria-hidden="true"><defs><marker id="cc-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="#7686a2"/></marker></defs>
       {edges.map(e=>{const a=pos[e.from],z=pos[e.to];return a&&z?<path key={e.from+"-"+e.to} d={"M"+(a.x+210)+","+(a.y+53)+" C"+(a.x+250)+","+(a.y+53)+" "+(z.x-35)+","+(z.y+53)+" "+(z.x-5)+","+(z.y+53)} fill="none" stroke={e.to===selected?"#edb45e":"#607590"} strokeWidth="2" markerEnd="url(#cc-arrow)"/>:null})}
      </svg>
      {services.map(s=><div key={s.id} role="button" tabIndex={0} aria-label={s.name+", "+(LABEL[s.status]||"Unknown")} className={"cc-node cc-node-"+s.status+(selected===s.id?" cc-selected":"")+(impacted.has(s.id)?" cc-impacted":"")} style={{left:pos[s.id]?.x||0,top:pos[s.id]?.y||0}} onPointerDown={e=>onNodeDown(e,s.id)} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null} onClick={()=>setSelected(s.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelected(s.id)}}}>
       <div className="cc-node-line"><span className="cc-icon">{s.id==="db"?"▤":s.id==="proxy"?"◎":"⌘"}</span><span className={"cc-light cc-light-"+s.status}/></div>
       <b>{s.name}</b><small>{s.kind}</small><span className={"cc-tag cc-tag-"+s.status}>{LABEL[s.status]||"Unknown"}</span>
      </div>)}
      {!services.length&&<p className="cc-empty">No live topology observations</p>}
     </div>
     <div className="cc-zoom"><button onClick={()=>setZoom(z=>Math.min(1.5,z+.15))}>+</button><button onClick={()=>setZoom(z=>Math.max(.65,z-.15))}>−</button><button onClick={()=>{setZoom(1);setPos(DEFAULT);setPan({x:0,y:0})}}>⌖</button></div>
    </div>
    <p className="cc-hint">Drag nodes · select to inspect · scroll to zoom · drag background to pan. Highlighted nodes may be affected by the selection.</p>
    <div className="cc-panel"><div className="cc-section-head"><h3>Chaos Experiment</h3><small>TEST API ONLY</small></div>
     <p>Safely stop the disposable API and observe its dependency impact. Recovery is manual in this MVP.</p>
     <div className="cc-actions"><button className="cc-stop" disabled={!authenticated||busy||chosen?.id!=="api"||chosen?.status!=="healthy"} onClick={()=>experiment("stop")}>■ Stop test API</button><button className="cc-recover" disabled={!authenticated||busy||chosen?.id!=="api"||chosen?.containerStatus!=="exited"} onClick={()=>experiment("start")}>↺ Recover test API</button></div>
     {!authenticated&&<p className="cc-hint">Log in using the existing Admin Login to enable actions.</p>}
     {message&&<p className="cc-notice" role="status">{message}</p>}
    </div>
   </div>
   <aside className="cc-panel cc-inspector"><span className="cc-overline">SERVICE INSPECTOR</span>{chosen?<><h3>{chosen.name}</h3><p>{chosen.kind} · {chosen.role}</p><span className={"cc-tag cc-tag-"+chosen.status}>{LABEL[chosen.status]||"Unknown"}</span><hr/><dl>
    <dt>Container</dt><dd>{chosen.container}</dd><dt>Docker state</dt><dd>{fmt(chosen.containerStatus)}</dd><dt>App health</dt><dd>{fmt(chosen.applicationHealth)}</dd><dt>Port</dt><dd>{chosen.port}</dd><dt>CPU</dt><dd>{details?.id===selected&&details?.metrics?details.metrics.cpuPercent+"%":"Not Available"}</dd><dt>RAM</dt><dd>{details?.id===selected&&details?.metrics?details.metrics.memoryUsage:"Not Available"}</dd><dt>Response time</dt><dd>Not Available</dd><dt>Logs</dt><dd>Not Available (next phase)</dd></dl><hr/><span className="cc-overline">DEPENDENCIES</span><p>Depends on: {edges.filter(e=>e.from===selected).map(e=>e.to).join(", ")||"None"}</p><p>Potentially impacted: {[...impacted].join(", ")||"None"}</p>{!authenticated&&<p className="cc-hint">Login required for resource metrics.</p>}{!chosen.observed&&<p className="cc-hint">{chosen.detail}</p>}</>:<p>Select a service on the map.</p>}</aside>
  </div>
  <div className="cc-panel cc-history"><div className="cc-section-head"><h3>Lab Activity</h3><small>LAST 100 EVENTS</small></div>
   {events.length?events.slice(0,8).map(e=><div className="cc-event" key={e.id}><span>◉</span><div><b>{e.service} · {e.type}</b><small>{e.action||((e.previous||"Unknown")+" → "+(e.current||"Unknown"))} · Cause: {e.cause||"Unknown"} · Possible impact: {e.potentiallyImpacted?.join(", ")||"None"}</small></div><time>{new Date(e.time).toLocaleTimeString()}</time></div>):<p className="cc-hint">No recorded events. Changes are recorded when observed by the backend.</p>}
  </div>
 </section>
}
