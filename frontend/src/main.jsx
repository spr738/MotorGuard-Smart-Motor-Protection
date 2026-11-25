import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, AlertTriangle, Bell, CheckCircle2, Cpu, Gauge, RotateCcw, Shield, Zap } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./style.css";

const API = "http://localhost:8000";
const FAULTS = ["overload", "phase_loss", "undervoltage", "overvoltage", "overtemperature", "high_vibration"];
const fmt = (n, d=1) => Number(n ?? 0).toFixed(d);

function App() {
  const [motors, setMotors] = useState([]);
  const [selected, setSelected] = useState("MTR-001");
  const [telemetry, setTelemetry] = useState([]);
  const [events, setEvents] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(path, options={}) {
    const res = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...options });
    if (!res.ok) throw new Error((await res.json()).detail || "API request failed");
    return res.json();
  }
  async function refresh() {
    try {
      const [t, m, e, h] = await Promise.all([
        request("/api/telemetry"), request("/api/motors"), request("/api/events"),
        request("/api/history?limit=90&motor_id=" + selected)
      ]);
      setTelemetry(t.motors); setMotors(m); setEvents(e); setHistory(h); setError("");
    } catch { setError("Cannot reach the backend. Start the FastAPI server on port 8000."); }
  }
  useEffect(() => { refresh(); const id = setInterval(refresh, 1800); return () => clearInterval(id); }, [selected]);
  const current = telemetry.find(x => x.motor_id === selected) || telemetry[0];
  const selectedMotor = motors.find(x => x.id === selected) || motors[0];
  const activeEvents = events.filter(e => !e.acknowledged);
  const chart = useMemo(() => history.slice().reverse().map((r, i) => ({
    sample: i + 1, current: r.avg_current, temperature: r.temperature, vibration: r.vibration
  })), [history]);

  async function inject(fault) {
    setBusy(true);
    try { await request("/api/faults/" + selected, { method: "POST", body: JSON.stringify({ fault }) }); await refresh(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true);
    try { await request("/api/reset/" + selected, { method: "POST" }); await refresh(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function acknowledge(id) {
    try { await request("/api/acknowledge/" + id, { method: "POST" }); await refresh(); }
    catch (e) { setError(e.message); }
  }

  const status = current?.status || "CONNECTING";
  return <main className="shell">
    <header className="topbar">
      <div className="brand"><div className="brand-icon"><Zap size={21}/></div><div><b>MOTORGUARD</b><small>PROTECTION & DIAGNOSTICS / 01</small></div></div>
      <div className="top-meta"><span className="live-dot"/> SIMULATION ONLINE <span className="divider-v"/> NORTH-EAST / DEMO PLANT</div>
    </header>
    <section className="intro">
      <div><div className="eyebrow">ELECTRICAL ASSET MONITORING</div><h1>Motor health <em>control room.</em></h1><p>Three-phase monitoring, protection indicators and guided fault diagnosis.</p></div>
      <div className="intro-right"><span className="label">SYSTEM TIME</span><b>{new Date().toLocaleTimeString()}</b><span className="subtle">AUTO REFRESH · 1.8 SEC</span></div>
    </section>
    {error && <div className="error"><AlertTriangle size={16}/>{error}</div>}
    <section className="motor-strip">
      {motors.map(m => <button key={m.id} onClick={() => setSelected(m.id)} className={"motor-tab " + (selected === m.id ? "chosen" : "")}>
        <span className="motor-tab-top"><span>{m.id}</span><span className={"mini-state " + (m.live_status || "").toLowerCase()}>{m.live_status || "WAIT"}</span></span>
        <b>{m.name}</b><small>{m.location} · {m.rating_kw} kW</small>
      </button>)}
    </section>
    <section className="section-head"><div><span className="eyebrow">01 / LIVE TELEMETRY</span><h2>{selectedMotor?.name || "Motor telemetry"}</h2></div><span className={"status-pill " + status.toLowerCase()}><i/>{status}</span></section>
    <section className="metrics">
      <Metric icon={<Zap/>} label="AVERAGE VOLTAGE" value={fmt(current?.avg_voltage)} unit="V" note="3-phase average"/>
      <Metric icon={<Activity/>} label="AVERAGE CURRENT" value={fmt(current?.avg_current,2)} unit="A" note={"Rated " + (selectedMotor?.rated_current || "--") + " A"}/>
      <Metric icon={<Gauge/>} label="WINDING TEMP." value={fmt(current?.temperature)} unit="°C" note="Simulated sensor"/>
      <Metric icon={<Cpu/>} label="VIBRATION" value={fmt(current?.vibration,2)} unit="mm/s" note="RMS indicator"/>
    </section>
    <section className="content-grid">
      <article className="panel chart-panel"><div className="panel-head"><div><span className="eyebrow">02 / CONDITION TREND</span><h3>Current & temperature</h3></div><span className="tag">LIVE SAMPLES</span></div>
        <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><defs><linearGradient id="cur" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e9a64b" stopOpacity=".28"/><stop offset="95%" stopColor="#e9a64b" stopOpacity="0"/></linearGradient></defs><CartesianGrid stroke="#263437" vertical={false}/><XAxis dataKey="sample" tick={{fill:"#718184",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#718184",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"#172326",border:"1px solid #344447",borderRadius:8,color:"#e9eeee"}}/><Area type="monotone" dataKey="current" name="Current (A)" stroke="#e9a64b" fill="url(#cur)" strokeWidth={2} isAnimationActive={false}/><Area type="monotone" dataKey="temperature" name="Temperature (°C)" stroke="#58c5b4" fill="transparent" strokeWidth={2} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>
        <div className="chart-legend"><span><i className="amber"/> Current (A)</span><span><i className="teal"/> Temperature (°C)</span></div>
      </article>
      <article className="panel phase-panel"><div className="panel-head"><div><span className="eyebrow">03 / SUPPLY CONDITION</span><h3>Phase measurements</h3></div><span className="tag">3-PHASE</span></div>
        <div className="phase-list">{["R","Y","B"].map((p,i)=><div className="phase-row" key={p}><span className={"phase-dot p"+p}>{p}</span><div className="phase-track"><div style={{width:Math.min(100,((current?.voltage?.[i]||0)/500)*100)+"%"}}/></div><b>{fmt(current?.voltage?.[i])} <small>V</small></b><strong>{fmt(current?.current?.[i],2)} A</strong></div>)}</div>
        <div className="imbalance"><span>Voltage imbalance</span><b>{fmt(current?.voltage_imbalance_pct,2)}%</b><span>Current imbalance</span><b>{fmt(current?.current_imbalance_pct,2)}%</b></div>
        <div className="phase-foot">Frequency <b>{fmt(current?.frequency,2)} Hz</b><span>Speed <b>{fmt(current?.speed_rpm,0)} RPM</b></span></div>
      </article>
    </section>
    <section className="content-grid lower">
      <article className="panel"><div className="panel-head"><div><span className="eyebrow">04 / PROTECTION TEST BENCH</span><h3>Inject a demo fault</h3></div><button className="reset-btn" onClick={reset} disabled={busy}><RotateCcw size={14}/> Clear faults</button></div>
        <p className="hint">Select a fault to observe the simulated protection response. This does not operate real equipment.</p>
        <div className="fault-grid">{FAULTS.map(f=><button key={f} disabled={busy} onClick={()=>inject(f)}><span>＋</span>{f.replaceAll("_"," ")}</button>)}</div>
      </article>
      <article className="panel"><div className="panel-head"><div><span className="eyebrow">05 / EVENT REGISTER</span><h3>Protection events</h3></div><span className="count">{activeEvents.length} OPEN</span></div>
        <div className="events">{events.slice(0,6).map(e=><div className="event-row" key={e.id}><span className={"event-icon "+e.severity.toLowerCase()}><AlertTriangle size={15}/></span><div className="event-copy"><b>{e.code} <small>{e.motor_id}</small></b><p>{e.message}</p><time>{new Date(e.timestamp).toLocaleTimeString()}</time></div>{!e.acknowledged && <button className="ack" onClick={()=>acknowledge(e.id)}>ACK</button>}</div>)}{!events.length&&<div className="empty"><CheckCircle2/>No events. All monitored values are within demo limits.</div>}</div>
      </article>
    </section>
    <footer><span>MOTORGUARD <b>·</b> INDUSTRIAL ELECTRICAL MONITORING</span><span><Shield size={13}/> EDUCATIONAL SIMULATION · NOT A SAFETY RELAY</span></footer>
  </main>;
}

function Metric({icon,label,value,unit,note}) {
  return <article className="metric"><div className="metric-top">{icon}<span>{label}</span></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-note">{note}</div></article>;
}
createRoot(document.getElementById("root")).render(<App/>);
