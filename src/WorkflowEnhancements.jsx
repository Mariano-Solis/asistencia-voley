import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

const BRANCHES = [
  { value: "female", label: "Femenino" },
  { value: "male", label: "Masculino" },
];

const dateText = (v) => v ? new Date(`${v}T12:00:00`).toLocaleDateString("es-AR") : "—";
const typeText = { training: "Entrenamiento", match: "Partido", tournament: "Torneo" };
const statusText = { present: "Presente", late: "Tarde", absent: "Ausente" };

function useSectionHost(title, attr, { hideSelector } = {}) {
  const [host, setHost] = useState(null);
  useEffect(() => {
    const sync = () => {
      const section = Array.from(document.querySelectorAll("section")).find((s) => s.querySelector(".page-title h1")?.textContent?.trim() === title);
      if (!section) return setHost(null);
      if (hideSelector) section.querySelectorAll(hideSelector).forEach((el) => { if (!el.closest(`[${attr}]`)) el.style.display = "none"; });
      let node = section.querySelector(`[${attr}]`);
      if (!node) {
        node = document.createElement("div");
        node.setAttribute(attr, "true");
        section.appendChild(node);
      }
      setHost(node);
    };
    sync();
    const o = new MutationObserver(sync);
    o.observe(document.body, { childList: true, subtree: true });
    return () => o.disconnect();
  }, [title, attr, hideSelector]);
  return host;
}

function AttendancePrompt() {
  useEffect(() => {
    const sync = () => {
      const section = Array.from(document.querySelectorAll("section")).find((s) => s.querySelector(".page-title h1")?.textContent?.trim() === "Asistencia");
      if (!section) return;
      const select = section.querySelector(".filter-card select");
      if (!select || !select.options.length) return;
      if (!select.querySelector('option[value=""]')) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "- Seleccione Categoría -";
        select.prepend(opt);
      }
      if (!section.dataset.categoryPromptInitialized) {
        section.dataset.categoryPromptInitialized = "true";
        select.value = "";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
    sync();
    const o = new MutationObserver(sync);
    o.observe(document.body, { childList: true, subtree: true });
    return () => o.disconnect();
  }, []);
  return null;
}

function RosterShare() {
  const host = useSectionHost("Jugador@s", "data-roster-share-host");
  const [categoryId, setCategoryId] = useState("");
  const [categoryLabel, setCategoryLabel] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!host) return;
    const section = host.closest("section");
    const findSelect = () => Array.from(section.querySelectorAll("select")).find((s) => Array.from(s.options).some((o) => o.value === "all"));
    const sync = () => {
      const select = findSelect();
      if (!select || select.value === "all" || !select.value) {
        setCategoryId(""); setCategoryLabel(""); return;
      }
      setCategoryId(select.value);
      setCategoryLabel(select.options[select.selectedIndex]?.textContent?.trim() || "Categoría");
    };
    sync();
    const select = findSelect();
    select?.addEventListener("change", sync);
    return () => select?.removeEventListener("change", sync);
  }, [host]);

  async function shareRoster() {
    if (!categoryId) return;
    setMessage("");
    const { data, error } = await supabase.from("players").select("full_name,team").eq("active", true).eq("category_id", categoryId).order("full_name");
    if (error) return setMessage(error.message);
    const text = [`Municipalidad de San Martín - VOLEY`, `#VamosElPoli`, "", `Plantilla · ${categoryLabel}`, "", ...(data || []).map((p, i) => `${i + 1}. ${p.full_name}${p.team ? ` · Equipo ${p.team}` : ""}`), "", `Total: ${(data || []).length} Jugador@s`].join("\n");
    try {
      if (navigator.share) await navigator.share({ title: `Plantilla · ${categoryLabel}`, text });
      else { await navigator.clipboard.writeText(text); setMessage("✓ Plantilla copiada al portapapeles."); }
    } catch (_) {}
  }

  if (!host) return null;
  return createPortal(
    <div className="workflow-share-bar">
      <button className="primary" type="button" disabled={!categoryId} onClick={shareRoster}>📤 Compartir plantilla del equipo</button>
      {!categoryId && <span>Filtrá primero una categoría.</span>}
      {message && <span className="workflow-ok">{message}</span>}
    </div>, host
  );
}

function HistoryAnalytics() {
  const host = useSectionHost("Historial", "data-history-analytics-host");
  const [categories, setCategories] = useState([]);
  const [players, setPlayers] = useState([]);
  const [categoryId, setCategoryId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [from, setFrom] = useState("2026-01-01");
  const [to, setTo] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Mendoza" }));
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (host) supabase.from("categories").select("id,name,gender").eq("active", true).order("gender").order("name").then(({ data }) => setCategories(data || [])); }, [host]);
  useEffect(() => {
    setPlayerId(""); setRows([]); setDetail([]);
    if (!categoryId) return setPlayers([]);
    supabase.from("players").select("id,full_name").eq("active", true).eq("category_id", categoryId).order("full_name").then(({ data }) => setPlayers(data || []));
  }, [categoryId]);

  async function buildTable() {
    if (!categoryId || !from || !to) return;
    setLoading(true);
    try {
      const s = await supabase.from("training_sessions").select("id,session_date,activity_type").eq("category_id", categoryId).gte("session_date", from).lte("session_date", to).order("session_date");
      if (s.error) throw s.error;
      const ids = (s.data || []).map(x => x.id);
      const people = playerId ? players.filter(p => p.id === playerId) : players;
      if (!ids.length) { setRows(people.map(p => ({ ...p, present:0, late:0, absent:0, total:0 }))); setDetail([]); return; }
      let q = supabase.from("attendance").select("player_id,session_id,status").in("session_id", ids);
      if (playerId) q = q.eq("player_id", playerId);
      const a = await q;
      if (a.error) throw a.error;
      const bySession = Object.fromEntries((s.data || []).map(x => [x.id, x]));
      setRows(people.map((p) => {
        const mine = (a.data || []).filter(x => x.player_id === p.id);
        return { ...p, present: mine.filter(x=>x.status==="present").length, late: mine.filter(x=>x.status==="late").length, absent: mine.filter(x=>x.status==="absent").length, total: mine.length };
      }));
      setDetail(playerId ? (a.data || []).map(x => ({ ...x, ...bySession[x.session_id] })).sort((x,y)=>String(x.session_date).localeCompare(String(y.session_date))) : []);
    } finally { setLoading(false); }
  }

  if (!host) return null;
  return createPortal(
    <div className="card workflow-card">
      <div className="workflow-head"><div><h2>Tabla de asistencias</h2><p>Consultá una categoría completa o un Jugador@ puntual dentro del período que elijas.</p></div></div>
      <div className="workflow-grid">
        <label>Categoría<select value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">- Seleccione Categoría -</option>{categories.map(c=><option key={c.id} value={c.id}>{c.gender==="female"?"Femenino":"Masculino"} · {c.name}</option>)}</select></label>
        <label>Jugador@<select value={playerId} onChange={e=>setPlayerId(e.target.value)} disabled={!categoryId}><option value="">Todos los Jugador@s</option>{players.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
        <label>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
        <label>Hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      </div>
      <button className="primary" type="button" disabled={!categoryId || loading} onClick={buildTable}>{loading?"Generando...":"📊 Generar tabla"}</button>
      {!!rows.length && <div className="workflow-table-wrap"><table className="workflow-table"><thead><tr><th>Jugador@</th><th>Presente</th><th>Tarde</th><th>Ausente</th><th>Total</th><th>% Presencia</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.full_name}</td><td>{r.present}</td><td>{r.late}</td><td>{r.absent}</td><td>{r.total}</td><td>{r.total?Math.round((r.present/r.total)*100):0}%</td></tr>)}</tbody></table></div>}
      {!!detail.length && <div className="workflow-table-wrap"><table className="workflow-table compact"><thead><tr><th>Fecha</th><th>Actividad</th><th>Estado</th></tr></thead><tbody>{detail.map((r,i)=><tr key={`${r.session_id}-${i}`}><td>{dateText(r.session_date)}</td><td>{typeText[r.activity_type] || r.activity_type}</td><td>{statusText[r.status] || r.status}</td></tr>)}</tbody></table></div>}
    </div>, host
  );
}

function CategoryExplorer() {
  const host = useSectionHost("Categorías", "data-category-explorer-host", { hideSelector: ".category-admin" });
  const [categories, setCategories] = useState([]); const [branch, setBranch] = useState(""); const [categoryId, setCategoryId] = useState("");
  const [players, setPlayers] = useState([]); const [professors, setProfessors] = useState([]);
  useEffect(()=>{ if(host) supabase.from("categories").select("id,name,gender,admin_id").eq("active",true).order("name").then(({data})=>setCategories(data||[])); },[host]);
  const branchCategories = useMemo(()=>categories.filter(c=>c.gender===branch),[categories,branch]);
  useEffect(()=>{setCategoryId("");setPlayers([]);setProfessors([])},[branch]);
  useEffect(()=>{(async()=>{if(!categoryId){setPlayers([]);setProfessors([]);return;} const c=categories.find(x=>x.id===categoryId); const [p,perms,profiles]=await Promise.all([supabase.from("players").select("id,full_name,team").eq("active",true).eq("category_id",categoryId).order("full_name"),supabase.from("admin_category_permissions").select("admin_id,can_view,can_edit").eq("category_id",categoryId),supabase.from("profiles").select("id,full_name,role").eq("role","admin")]); setPlayers(p.data||[]); const ids=new Set((perms.data||[]).filter(x=>x.can_view||x.can_edit).map(x=>x.admin_id)); if(c?.admin_id) ids.add(c.admin_id); setProfessors((profiles.data||[]).filter(x=>ids.has(x.id)));})()},[categoryId,categories]);
  if(!host)return null;
  return createPortal(<div className="card workflow-card"><div className="workflow-head"><div><h2>Explorar categoría</h2><p>Elegí rama y categoría para ver el plantel y los Profes a cargo.</p></div></div><div className="workflow-grid two-col"><label>Rama<select value={branch} onChange={e=>setBranch(e.target.value)}><option value="">- Seleccione Rama -</option>{BRANCHES.map(b=><option key={b.value} value={b.value}>{b.label}</option>)}</select></label><label>Categoría<select value={categoryId} onChange={e=>setCategoryId(e.target.value)} disabled={!branch}><option value="">- Seleccione Categoría -</option>{branchCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>{categoryId&&<div className="workflow-split"><div><h3>Jugador@s ({players.length})</h3><div className="workflow-list">{players.map(p=><div key={p.id}><b>{p.full_name}</b><span>{p.team?`Equipo ${p.team}`:"Sin asignar"}</span></div>)}</div></div><div><h3>Profes a cargo ({professors.length})</h3><div className="workflow-list">{professors.length?professors.map(p=><div key={p.id}><b>{p.full_name}</b><span>Profe</span></div>):<div className="empty">Sin Profes asignados.</div>}</div></div></div>}</div>,host);
}

function PermissionsEnhanced() {
  const host = useSectionHost("Permisos", "data-permissions-enhanced-host", { hideSelector: ".permission-list, section > .card:not(.permission-row)" });
  const [admins,setAdmins]=useState([]),[categories,setCategories]=useState([]),[prof,setProf]=useState(""),[branch,setBranch]=useState(""),[cat,setCat]=useState(""),[perm,setPerm]=useState({can_view:false,can_edit:false}),[msg,setMsg]=useState("");
  useEffect(()=>{if(!host)return;Promise.all([supabase.from("profiles").select("id,full_name").eq("role","admin").order("full_name"),supabase.from("categories").select("id,name,gender").eq("active",true).order("name")]).then(([a,c])=>{setAdmins(a.data||[]);setCategories(c.data||[])})},[host]);
  useEffect(()=>{setCat("");setPerm({can_view:false,can_edit:false})},[prof,branch]);
  useEffect(()=>{(async()=>{if(!prof||!cat)return;const r=await supabase.from("admin_category_permissions").select("can_view,can_edit").eq("admin_id",prof).eq("category_id",cat).maybeSingle();setPerm(r.data||{can_view:false,can_edit:false})})()},[prof,cat]);
  async function save(next){if(!prof||!cat)return; if(next.can_edit)next.can_view=true; const r=!next.can_view&&!next.can_edit?await supabase.from("admin_category_permissions").delete().eq("admin_id",prof).eq("category_id",cat):await supabase.from("admin_category_permissions").upsert({admin_id:prof,category_id:cat,...next},{onConflict:"admin_id,category_id"}); if(!r.error){setPerm(next);setMsg("✓ Permiso actualizado.")}else setMsg(r.error.message)}
  if(!host)return null;
  return createPortal(<div className="card workflow-card"><div className="workflow-head"><div><h2>Asignar permisos</h2><p>Primero elegí el Profe, luego la rama y finalmente la categoría.</p></div></div><div className="workflow-grid three-col"><label>Profe<select value={prof} onChange={e=>setProf(e.target.value)}><option value="">- Seleccione Profe -</option>{admins.map(a=><option key={a.id} value={a.id}>{a.full_name}</option>)}</select></label><label>Rama<select value={branch} onChange={e=>setBranch(e.target.value)} disabled={!prof}><option value="">- Seleccione Rama -</option>{BRANCHES.map(b=><option key={b.value} value={b.value}>{b.label}</option>)}</select></label><label>Categoría<select value={cat} onChange={e=>setCat(e.target.value)} disabled={!branch}><option value="">- Seleccione Categoría -</option>{categories.filter(c=>c.gender===branch).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>{cat&&<div className="permission-choice"><label><input type="checkbox" checked={perm.can_view} onChange={e=>save({...perm,can_view:e.target.checked,can_edit:e.target.checked?perm.can_edit:false})}/> Ver</label><label><input type="checkbox" checked={perm.can_edit} onChange={e=>save({...perm,can_edit:e.target.checked})}/> Editar</label></div>}{msg&&<div className="message">{msg}</div>}</div>,host);
}

export default function WorkflowEnhancements(){return <><AttendancePrompt/><RosterShare/><HistoryAnalytics/><CategoryExplorer/><PermissionsEnhanced/></>}
