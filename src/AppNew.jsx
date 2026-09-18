import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { isAuthSession, isLegacySession, readStoredPlayer, removeStoredPlayer, storeLegacyPlayer } from "./sessionSafety";
import { CONFLICT_MESSAGE, attendanceWriteError, attendanceFingerprint, readAttendance } from "./attendanceSafety";
import TrainingSchedule from "./TrainingSchedule";
import { AdminPaymentPanel } from "./PaymentHubStable";
import officialLogo from "../Logo.jpg";

const APP_NAME = "Municipalidad De San Martín - VOLEY";
const TAGLINE = "#VamosElPoli";
const LOGO = officialLogo;
const PUBLIC_APP_URL = "https://voleysanmartin.com.ar/";
const TYPES = { training: ["🏐", "Entrenamiento"], match: ["🏆", "Partido"], tournament: ["🥇", "Torneo"] };
const STATUS = { present: ["✓", "Presente"], late: ["◷", "Tarde"], absent: ["✕", "Ausente"] };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Mendoza" });
const clean = v => String(v ?? "").trim();
const gender = v => ["female", "femenino", "femenina", "mujer", "f"].includes(clean(v).toLowerCase()) ? "female" : "male";
const genderText = g => gender(g) === "female" ? "Femenino" : "Masculino";
const plural = g => gender(g) === "female" ? "Jugadoras" : "Jugadores";
const dateText = v => v ? new Date(`${v}T12:00:00`).toLocaleDateString("es-AR") : "—";
const errorText = e => e?.message || "Ocurrió Un Error.";
const accessCode = () => `${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

function can(profile, category, permissions, edit = false) {
  if (!profile || !category) return false;
  if (profile.role === "super_admin" || category.admin_id === profile.id) return true;
  const p = permissions?.[category.id];
  return edit ? !!p?.can_edit : !!p?.can_view;
}
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const el = document.createElement("textarea"); el.value = text; el.style.position = "fixed"; el.style.opacity = "0";
  document.body.appendChild(el); el.select(); const ok = document.execCommand("copy"); document.body.removeChild(el);
  if (!ok) throw new Error("No Se Pudo Copiar.");
}
async function shareText(title, text) {
  if (navigator.share) { await navigator.share({ title, text }); return; }
  await copyText(text);
}
function ageOf(birth) { if (!birth) return "—"; const b = new Date(`${birth}T12:00:00`), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--; return a; }
function categoryName(categories, id) { return categories.find(c => c.id === id)?.name || "Sin Categoría"; }
function mergeNavigationOrder(items, savedOrder = []) {
  const labels = items.map(([, label]) => label);
  const orderedLabels = [...savedOrder.filter(label => labels.includes(label)), ...labels.filter(label => !savedOrder.includes(label))];
  const byLabel = Object.fromEntries(items.map(item => [item[1], item]));
  return orderedLabels.map(label => byLabel[label]).filter(Boolean);
}

function Brand({ compact = false }) { return <div className={`brand ${compact ? "compact" : ""}`}><img src={LOGO} alt="MGSM VOLEY MENDOZA"/><div><strong>{APP_NAME}</strong><span>{TAGLINE}</span></div></div>; }

function Login({ onAdmin, onPlayer, onAuthStart, onAuthEnd }) {
  const [mode, setMode] = useState("player");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [name, setName] = useState(""); const [code, setCode] = useState("");
  const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false);
  const [first, setFirst] = useState(""); const [last, setLast] = useState(""); const [sex, setSex] = useState("female");
  const [dni, setDni] = useState(""); const [birth, setBirth] = useState(""); const [selfie, setSelfie] = useState(null);
  const fileRef = useRef(null);
  async function submit(e) {
    e.preventDefault(); setLoading(true); setMessage(""); onAuthStart?.(mode);
    try {
      if (mode === "player") {
        if (email && password) {
          const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error; onPlayer(data.session);
        } else {
          const { data, error } = await supabase.rpc("player_login", { p_name: name.trim(), p_code: code.trim().toUpperCase() }); if (error) throw error;
          if (!data?.ok) throw new Error(data?.message || "Nombre O Código Incorrectos.");
          onPlayer({ legacy: true, id: data.id, name: data.full_name, code: code.trim().toUpperCase(), category_id: data.category_id, category_name: data.category_name });
        }
      } else if (mode === "admin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error; await onAdmin(data.session);
      } else {
        if (!first.trim() || !last.trim() || !email.trim() || !birth || !dni.trim()) throw new Error("Completá Todos Los Datos Obligatorios.");
        if (password.length < 6) throw new Error("La Contraseña Debe Tener Al Menos 6 Caracteres.");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: `${first.trim()} ${last.trim()}`,
              first_name: first.trim(),
              last_name: last.trim(),
              sex,
              dni: dni.trim(),
              birth_date: birth,
              role: "player"
            },
            emailRedirectTo: PUBLIC_APP_URL
          }
        });
        if (error) throw error;
        if (!data.session) { setMessage("✓ Cuenta Creada. Revisá Tu Correo Para Confirmar La Cuenta y Luego Ingresá Como Jugador@."); setMode("player"); return; }
        if (!isAuthSession(data.session)) throw new Error("La Sesión No Es Válida. Volvé A Ingresar.");
        const uid = data.session.user.id;
        const playerRow = await supabase.from("players").select("*").eq("user_id", uid).single();
        if (playerRow.error) throw playerRow.error;
        if (selfie) { const path = `${uid}/${Date.now()}-${selfie.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`; const up = await supabase.storage.from("player-selfies").upload(path, selfie, { upsert: true, contentType: selfie.type || "image/jpeg" }); if (!up.error) await supabase.from("players").update({ selfie_path: path }).eq("id", playerRow.data.id); }
        setMessage(`✓ Cuenta Creada. Tu Código Personal Es ${playerRow.data.access_code}. Guardalo: También Podés Copiarlo Desde Tu Perfil.`); onPlayer(data.session);
      }
    } catch (e) { setMessage(errorText(e)); } finally { setLoading(false); onAuthEnd?.(); }
  }
  return <main className="auth"><div className="auth-bg-logo"/><section className="auth-card">
    <Brand/><div className="auth-tabs"><button type="button" className={mode === "player" ? "active" : ""} onClick={() => setMode("player")}>Jugador@s</button><button type="button" className={mode === "admin" ? "active" : ""} onClick={() => setMode("admin")}>Profe</button><button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Crear Cuenta</button></div>
    <p className="auth-subtitle">{mode === "signup" ? "Creá Tu Cuenta Personal De Jugador@." : mode === "admin" ? "Acceso Para Profes y Administradores." : "Ingresá Para Consultar Tu Asistencia."}</p>
    <form onSubmit={submit}>
      {mode === "player" && <><input type="email" placeholder="Correo Electrónico" value={email} onChange={e => setEmail(e.target.value)}/><input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)}/><div className="or">O Acceso Con Código Personal</div><input placeholder="Nombre y Apellido" value={name} onChange={e => setName(e.target.value)}/><input placeholder="Código Personal" value={code} onChange={e => setCode(e.target.value.toUpperCase())}/><button className="primary" disabled={loading}>{loading ? "Ingresando..." : "Ingresar"}</button></>}
      {mode === "admin" && <><input required type="email" placeholder="Correo Electrónico" value={email} onChange={e => setEmail(e.target.value)}/><input required type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)}/><button className="primary" disabled={loading}>{loading ? "Ingresando..." : "Ingresar Como Profe"}</button></>}
      {mode === "signup" && <><div className="two"><input required placeholder="Nombre" value={first} onChange={e => setFirst(e.target.value)}/><input required placeholder="Apellido" value={last} onChange={e => setLast(e.target.value)}/></div><div className="two"><select value={sex} onChange={e => setSex(e.target.value)}><option value="female">Femenino</option><option value="male">Masculino</option></select><input required placeholder="DNI" value={dni} onChange={e => setDni(e.target.value)}/></div><label className="field-label">Fecha De Nacimiento<input required type="date" value={birth} onChange={e => setBirth(e.target.value)}/></label><label className="selfie-field"><span>Foto De Perfil</span><span className="file-button" role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}>📷 Agregar Foto / Selfie</span><input ref={fileRef} className="hidden-file" type="file" accept="image/*" onChange={e => setSelfie(e.target.files?.[0] || null)}/>{selfie && <span className="file-name">✓ Foto Seleccionada: {selfie.name}</span>}</label><input required type="email" placeholder="Correo Electrónico" value={email} onChange={e => setEmail(e.target.value)}/><input required type="password" minLength={6} placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)}/><button className="primary" disabled={loading}>{loading ? "Creando..." : "Crear Mi Cuenta"}</button></>}
    </form>{message && <div className="message">{message}</div>}<small className="legal">La Profe Asignará La Categoría y Equipo Cuando Corresponda.</small>
  </section></main>;
}

function StatusButtons({ value, onChange, disabled = false }) { return <div className="status-picker">{Object.entries(STATUS).map(([k, v]) => <button disabled={disabled} type="button" key={k} className={`status ${k} ${value === k ? "active" : ""}`} onClick={() => onChange(k)}><b>{v[0]}</b><span>{v[1]}</span></button>)}</div>; }

function Attendance({ profile, players, categories, permissions, refresh }) {
  const editable = useMemo(() => categories.filter(c => can(profile, c, permissions, true)), [categories, profile, permissions]);
  const [date, setDate] = useState(today()); const [categoryId, setCategoryId] = useState(""); const [type, setType] = useState("training"); const [open, setOpen] = useState(true);
  const [att, setAtt] = useState({}); const [details, setDetails] = useState({ opponent: "", location: "", start: today(), end: today(), dates: [today()] }); const [msg, setMsg] = useState(""); const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const savingRef = useRef(false);
  const draftRef = useRef(false);
  const baselineRef = useRef(null);
  const [conflict,setConflict] = useState(false), [reloadCounter,setReloadCounter] = useState(0), [loadedAt,setLoadedAt] = useState(null);
  function markDirty() { draftRef.current = true; setDirty(true); setMsg(conflict ? CONFLICT_MESSAGE : ""); }
  function discardDraft() { draftRef.current = false; setDirty(false); setMsg(""); }
  function allowLeave() {
    if (savingRef.current) { window.alert("Esperá A Que Termine El Guardado Antes De Salir."); return false; }
    if (draftRef.current && !window.confirm("Tenés Cambios De Asistencia Sin Guardar.¿Querés Descartarlos y Continuar?")) return false;
    discardDraft();
    return true;
  }
  useEffect(() => {
    const navigation = event => {
      const target = event.target.closest('main.app nav button, main.app .top-user button');
      if (!target || target.classList.contains('active')) return;
      if (!allowLeave()) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const unload = event => { if (draftRef.current || savingRef.current) { event.preventDefault(); event.returnValue = ""; } };
    document.addEventListener('click', navigation, true);
    window.addEventListener('beforeunload', unload);
    return () => { document.removeEventListener('click', navigation, true); window.removeEventListener('beforeunload', unload); };
  }, []);
  useEffect(() => { window.dispatchEvent(new Event('voley:attendance-state')); }, [dirty, saving, loading]);
  function changeDate(event) {
    if (event.target.value === date) return;
    if (allowLeave()) setDate(event.target.value); else event.target.value = date;
  }
  function changeCategory(event) {
    if (event.target.value === categoryId) return;
    if (allowLeave()) setCategoryId(event.target.value); else event.target.value = categoryId;
  }
  function changeActivity(next) {
    if (next === type) { setOpen(value => !value); return; }
    if (allowLeave()) { setType(next); setOpen(true); }
  }
  function editDetails(update) { markDirty(); setDetails(update); }
  useEffect(() => { if (categoryId && !editable.some(c => c.id === categoryId)) setCategoryId(""); }, [editable, categoryId]);
  const list = players.filter(p => p.category_id === categoryId);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setConflict(false); baselineRef.current = null;
    async function load() {
      try {
        if (!date || !categoryId) return;
        const loaded = await readAttendance(supabase,date,categoryId,type);
        if (cancelled) return;
        const session = loaded.session;
        baselineRef.current = loaded; setLoadedAt(loaded.loadedAt);
        setAtt(Object.fromEntries(loaded.rows.map(row=>[row.player_id,row.status])));
        setDetails({opponent:session?.opponent||'',location:session?.tournament_location||session?.event_location||'',start:session?.tournament_start_date||session?.event_start_date||date,end:session?.tournament_end_date||session?.event_end_date||date,dates:Array.isArray(session?.tournament_dates)&&session.tournament_dates.length?session.tournament_dates:[date]});
        setLoading(false);
      } catch(error) { if(!cancelled)setMsg(errorText(error)); }
    }
    load();
    return ()=>{cancelled=true;};
  },[date,categoryId,type,reloadCounter]);
  function reportConflict() {
    draftRef.current=true;setDirty(true);setConflict(true);setMsg(CONFLICT_MESSAGE);
  }
  function reviewChanges() {
    if (allowLeave()) { setConflict(false);setReloadCounter(value=>value+1); }
  }
  async function save() {
    if(!categoryId||!open||loading||savingRef.current||conflict||!baselineRef.current)return;
    savingRef.current=true;setSaving(true);setMsg('');
    const payload={session_date:date,created_by:profile.id,activity_type:type,category_id:categoryId,
      opponent:type==='match'?clean(details.opponent)||null:null,
      event_location:type==='match'||type==='tournament'?clean(details.location)||null:null,
      event_start_date:type==='tournament'?details.start||date:null,event_end_date:type==='tournament'?details.end||date:null,
      tournament_location:type==='tournament'?clean(details.location)||null:null,
      tournament_start_date:type==='tournament'?details.start||date:null,tournament_end_date:type==='tournament'?details.end||date:null,
      tournament_dates:type==='tournament'?details.dates.filter(Boolean):null};
    const desiredRows=list.filter(p=>att[p.id]).map(p=>({player_id:p.id,status:att[p.id]}));
    const desired=attendanceFingerprint(payload,desiredRows);
    try {
      let current=await readAttendance(supabase,date,categoryId,type);
      if(current.fingerprint!==baselineRef.current.fingerprint&&current.fingerprint!==desired){reportConflict();return;}
      let session=current.session;
      if(!session){
        const created=await supabase.from('training_sessions').insert(payload).select().single();
        if(created.error){
          if(created.error.code!=='23505')throw created.error;
          // Recover only when the exact unique session key now exists.
          current=await readAttendance(supabase,date,categoryId,type);
          if(!current.session)throw created.error;
          if(current.fingerprint!==baselineRef.current.fingerprint&&current.fingerprint!==desired){reportConflict();return;}
          session=current.session;
        }else session=created.data;
      }
      const updated=await supabase.from('training_sessions').update(payload).eq('id',session.id);
      if(updated.error)throw updated.error;
      if(desiredRows.length){const result=await supabase.from('attendance').upsert(desiredRows.map(row=>({...row,session_id:session.id})),{onConflict:'session_id,player_id'});if(result.error)throw result.error;}
      // Delete only omissions that existed in the loaded snapshot; never newly observed rows from another editor.
      const stale=current.rows.filter(row=>!desiredRows.some(next=>next.player_id===row.player_id)).map(row=>row.player_id);
      if(stale.length){const removed=await supabase.from('attendance').delete().eq('session_id',session.id).in('player_id',stale);if(removed.error)throw removed.error;}
      const verified=await readAttendance(supabase,date,categoryId,type);
      if(verified.fingerprint!==desired){reportConflict();return;}
      baselineRef.current=verified;setLoadedAt(verified.loadedAt);discardDraft();setMsg('✓ Registro Guardado.');
      await refresh();
    }catch(error){draftRef.current=true;setDirty(true);setMsg(attendanceWriteError(error));}
    finally{savingRef.current=false;setSaving(false);}
  }
  return <section data-attendance-dirty={dirty ? "true" : "false"} data-attendance-loaded-at={loadedAt || ""}>
    <PageTitle title="Asistencia" text="Tomá y Modificá La Asistencia De Cada Jugador@." action={<input type="date" value={date} disabled={saving} onChange={changeDate}/>}/>
    <div className="card filter-card">
      <label>Categoría</label>
      <select data-attendance-category-proxy="true" value={categoryId} disabled={saving} onChange={changeCategory}>
        <option value="">Sin Categoría</option>
        {editable.map(c => <option key={c.id} value={c.id}>{genderText(c.gender)} · {c.name}</option>)}
      </select>
      {categoryId && <>
        <label>Actividad</label>
        <div className="activity-picker">
          {Object.entries(TYPES).map(([k,v]) => <button type="button" key={k} className={type === k && open ? "active" : type === k ? "selected" : ""} disabled={saving} onClick={() => changeActivity(k)}>{v[0]} {v[1]}</button>)}
        </div>
        {open && type === "match" && <div className="event-grid">
          <label>Rival<input value={details.opponent} disabled={saving || loading} onChange={e => editDetails(d => ({...d, opponent: e.target.value}))}/></label>
          <label>Lugar<input value={details.location} disabled={saving || loading} onChange={e => editDetails(d => ({...d, location: e.target.value}))}/></label>
        </div>}
        {open && type === "tournament" && <div className="event-grid">
          <label>Lugar<input value={details.location} disabled={saving || loading} onChange={e => editDetails(d => ({...d, location: e.target.value}))}/></label>
          <label>Desde<input type="date" value={details.start} disabled={saving || loading} onChange={e => editDetails(d => ({...d, start: e.target.value}))}/></label>
          <label>Hasta<input type="date" value={details.end} disabled={saving || loading} onChange={e => editDetails(d => ({...d, end: e.target.value}))}/></label>
        </div>}
      </>}
    </div>
    {categoryId && <div className="card attendance-card">
      <div className="card-head"><h3>{plural(categories.find(c => c.id === categoryId)?.gender)} · {categoryName(categories, categoryId)}</h3><span>{list.length} Jugador@s</span></div>
      {list.length ? list.map(p => <div className="attendance-row" key={p.id}><Avatar player={p}/><div className="grow"><b>{p.full_name}</b><small>{p.team ? `Equipo ${p.team}` : "Sin Asignar"}</small></div><StatusButtons value={att[p.id]} disabled={saving || loading} onChange={v => { markDirty(); setAtt(a => ({...a, [p.id]: v})); }}/></div>) : <Empty text="No Hay Jugador@s En Esta Categoría."/>}
      <button className="primary wide" disabled={saving || loading || conflict || !open || !list.length} onClick={save}>{saving ? "Guardando..." : "Guardar / Modificar Registro"}</button>
      {msg && <div className="message" role="status">{msg}</div>}
      {conflict && <button type="button" className="attendance-review" disabled={saving} onClick={reviewChanges}>Revisar Cambios Guardados</button>}
      {loadedAt && <small className="attendance-loaded">Última lectura: {new Date(loadedAt).toLocaleTimeString()}</small>}
    </div>}
  </section>;
}
function Avatar({ player }) { if (player?.selfie_path) { const { data } = supabase.storage.from("player-selfies").getPublicUrl(player.selfie_path); return <img className="avatar photo" src={data.publicUrl} alt=""/>; } return <div className="avatar">{player?.full_name?.charAt(0)?.toUpperCase() || "J"}</div>; }
function PageTitle({ title, text, action }) { return <div className="page-title"><div><h1>{title}</h1><p>{text}</p></div>{action}</div>; }
function Empty({ text }) { return <div className="empty">{text}</div>; }

function Players({ profile, players, categories, permissions, refresh }) {
  const editable = categories.filter(c => can(profile, c, permissions, true)); const visible = categories.filter(c => can(profile, c, permissions));
  const [search, setSearch] = useState(""); const [filter, setFilter] = useState("all"); const [open, setOpen] = useState(null); const [msg, setMsg] = useState(""); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ first: "", last: "", category: editable[0]?.id || "", sex: "female", dni: "", birth: "", team: "", file: null }); const fileRef = useRef(null);
  const list = players.filter(p => { const c = categories.find(x => x.id === p.category_id); const allowed = c ? can(profile, c, permissions) : profile.role === "super_admin"; return allowed && (filter === "all" || p.category_id === filter) && (!search || p.full_name.toLowerCase().includes(search.toLowerCase())); });
  const dynamicCounts = {
    total: list.length,
    female: list.filter(p => gender(p.sex) === "female").length,
    male: list.filter(p => gender(p.sex) === "male").length,
  };
  async function savePlayer(e) { e.preventDefault(); if (!form.first || !form.last || !form.category) return; setSaving(true); try { let categoryId = form.category; const auto = await supabase.rpc("calculate_player_category", { p_birth_date: form.birth, p_sex: form.sex }); if (!auto.error && auto.data) categoryId = auto.data; const row = { first_name: form.first.trim(), last_name: form.last.trim(), full_name: `${form.last.trim().toUpperCase()} ${form.first.trim()}`, sex: form.sex, dni: clean(form.dni) || null, birth_date: form.birth || null, category_id: categoryId, team: form.team || null, access_code: accessCode(), active: true }; const r = await supabase.from("players").insert(row); if (r.error) throw r.error; setForm(f => ({...f, first: "", last: "", dni: "", birth: "", team: "", file: null})); setMsg("✓ Jugador@ Agregado."); await refresh(); } catch(e) { setMsg(errorText(e)); } finally { setSaving(false); } }
  async function saveEdit(p, data) { setSaving(true); try { let categoryId = data.category; const auto = await supabase.rpc("calculate_player_category", { p_birth_date: data.birth, p_sex: data.sex }); if (!auto.error && auto.data) categoryId = auto.data; const r = await supabase.from("players").update({ first_name: data.first, last_name: data.last, full_name: `${data.last.toUpperCase()} ${data.first}`, sex: data.sex, dni: data.dni || null, birth_date: data.birth || null, category_id: categoryId, team: data.team || null }).eq("id", p.id); if (r.error) throw r.error; if (data.file) { const path = `${p.user_id || "admin"}/${Date.now()}-${data.file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`; const up = await supabase.storage.from("player-selfies").upload(path, data.file, { upsert: true, contentType: data.file.type || "image/jpeg" }); if (up.error) throw up.error; const ur = await supabase.from("players").update({ selfie_path: path }).eq("id", p.id); if (ur.error) throw ur.error; } setOpen(null); setMsg("✓ Datos Actualizados."); await refresh(); } catch(e) { setMsg(errorText(e)); } finally { setSaving(false); } }
  async function remove(p) { if (!confirm(`¿Eliminar A ${P.full_name}?`)) return; const r = await supabase.from("players").update({active:false}).eq("id", p.id); if (r.error) setMsg(errorText(r.error)); else { setMsg("✓ Jugador@ Eliminado."); await refresh(); } }
  async function share(p) { try { await shareText(`${APP_NAME} · Acceso`, `${APP_NAME}\
${TAGLINE}\
\
Jugador@: ${p.full_name}\
Código Personal: ${p.access_code}`); setMsg("✓ Datos Compartidos/copiados."); } catch(e) { if(e?.name !== "AbortError") setMsg(errorText(e)); } }
  return <section><PageTitle title="Jugador@s" text="Datos Personales, Selfie, Categoría, Equipo y Código De Acceso."/><div className="card add-player-card"><h3>Agregar Jugador@ Desde La Administración</h3><form onSubmit={savePlayer}><div className="three"><input required placeholder="Nombre" value={form.first} onChange={e=>setForm(f=>({...f,first:e.target.value}))}/><input required placeholder="Apellido" value={form.last} onChange={e=>setForm(f=>({...f,last:e.target.value}))}/><select value={form.sex} onChange={e=>setForm(f=>({...f,sex:e.target.value}))}><option value="female">Femenino</option><option value="male">Masculino</option></select></div><div className="three"><input placeholder="DNI" value={form.dni} onChange={e=>setForm(f=>({...f,dni:e.target.value}))}/><input type="date" value={form.birth} onChange={e=>setForm(f=>({...f,birth:e.target.value}))}/><select value={form.team} onChange={e=>setForm(f=>({...f,team:e.target.value}))}><option value="">Sin Asignar</option><option value="A">Equipo A</option><option value="B">Equipo B</option><option value="C">Equipo C</option><option value="D">Equipo D</option><option value="E">Equipo E</option></select></div><select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{editable.map(c=><option key={c.id} value={c.id}>{genderText(c.gender)} · {c.name}</option>)}</select><button className="primary" disabled={saving}>+ Agregar Jugador@</button></form></div><div className="toolbar card"><input placeholder="Buscar Por Nombre" value={search} onChange={e=>setSearch(e.target.value)}/><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todas Las Categorías</option>{visible.map(c=><option key={c.id} value={c.id}>{genderText(c.gender)} · {c.name}</option>)}</select></div><div className="card player-dynamic-counter"><div><span>Total</span><b>{dynamicCounts.total}</b></div><div><span>Femenino</span><b>{dynamicCounts.female}</b></div><div><span>Masculino</span><b>{dynamicCounts.male}</b></div></div>{msg && <div className="message">{msg}</div>}<div className="player-grid">{list.length ? list.map(p => <PlayerCard key={p.id} player={p} categories={categories} canEdit={profile.role === "super_admin" || can(profile, categories.find(c=>c.id===p.category_id), permissions, true)} onEdit={() => setOpen(p)} onDelete={() => remove(p)} onShare={() => share(p)}/>) : <Empty text="No Hay Registros."/>}</div>{open && <PlayerEdit player={open} categories={editable} onClose={() => setOpen(null)} onSave={saveEdit} saving={saving}/>}</section>;
}
function PlayerCard({player,categories,canEdit,onEdit,onDelete,onShare}) { const cat=categories.find(c=>c.id===player.category_id); return <article className="player-card card"><div className="player-card-top"><Avatar player={player}/><div className="grow"><h3>{player.full_name}</h3><p>{cat ? `${genderText(cat.gender)} · ${cat.name}` : "Sin Categoría"}</p></div><span className="team-badge">{player.team ? `Equipo ${player.team}` : "Sin Asignar"}</span></div><div className="player-data"><span><b>DNI</b>{player.dni || "—"}</span><span><b>Edad</b>{ageOf(player.birth_date)}</span><span><b>Acceso</b>{player.access_code}</span>{player.account_email !== undefined && <span><b>Correo De Cuenta</b>{player.account_email || "Sin Cuenta Asociada"}</span>}</div><div className="player-actions"><button onClick={onShare}>📤 Compartir</button><button onClick={() => copyText(player.access_code).catch(()=>{})}>📋 Código</button>{canEdit && <><button onClick={onEdit}>✏️ Modificar</button><button className="danger" onClick={onDelete}>🗑️ Eliminar</button></>}</div></article>; }
function PlayerEdit({player,categories,onClose,onSave,saving}) { const parts=player.full_name.split(/\s+/); const [data,setData]=useState({first:player.first_name||parts.slice(1).join(" "),last:player.last_name||parts[0]||"",sex:player.sex||"female",dni:player.dni||"",birth:player.birth_date||"",team:player.team||"",category:player.category_id||categories[0]?.id||"",file:null}); const fileRef=useRef(null); return <div className="modal"><div className="modal-card"><div className="modal-head"><h2>Modificar Jugador@</h2><button type="button" onClick={onClose}>×</button></div><form onSubmit={e=>{e.preventDefault();onSave(player,data)}}><div className="two"><input value={data.first} onChange={e=>setData(d=>({...d,first:e.target.value}))}/><input value={data.last} onChange={e=>setData(d=>({...d,last:e.target.value}))}/></div><div className="two"><select value={data.sex} onChange={e=>setData(d=>({...d,sex:e.target.value}))}><option value="female">Femenino</option><option value="male">Masculino</option></select><input value={data.dni} placeholder="DNI" onChange={e=>setData(d=>({...d,dni:e.target.value}))}/></div><input type="date" value={data.birth} onChange={e=>setData(d=>({...d,birth:e.target.value}))}/><select value={data.team} onChange={e=>setData(d=>({...d,team:e.target.value}))}><option value="">Sin Asignar</option>{["A","B","C","D","E"].map(x=><option key={x} value={x}>Equipo {x}</option>)}</select><select value={data.category} onChange={e=>setData(d=>({...d,category:e.target.value}))}>{categories.map(c=><option key={c.id} value={c.id}>{genderText(c.gender)} · {c.name}</option>)}</select><label className="selfie-field"><span>Selfie</span><span className="file-button" onClick={() => fileRef.current?.click()}>📷 Cambiar Selfie</span><input ref={fileRef} className="hidden-file" type="file" accept="image/*" capture="user" onChange={e=>setData(d=>({...d,file:e.target.files?.[0]||null}))}/>{data.file&&<span className="file-name">✓ {data.file.name}</span>}</label><div className="form-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>Guardar</button></div></form></div></div>; }

function History({profile,categories,permissions,players,refresh}) {
  const [sessions,setSessions]=useState([]),[selected,setSelected]=useState(null),[rows,setRows]=useState([]),[filter,setFilter]=useState("all"),[msg,setMsg]=useState("");
  async function load(){ let q=supabase.from("training_sessions").select("*, categories(id,name,gender)").order("session_date",{ascending:false}); if(filter!=="all") q=q.eq("category_id",filter); const r=await q; if(r.error)setMsg(errorText(r.error)); else setSessions(r.data||[]); }
  useEffect(()=>{load()},[filter]);
  async function openSession(s){ const a=await supabase.from("attendance").select("player_id,status").eq("session_id",s.id); setRows(a.data||[]); setSelected(s); }
  async function remove(){ if(!selected || !confirm("¿Eliminar Definitivamente Este Registro y Su Asistencia?")) return; await supabase.from("attendance").delete().eq("session_id",selected.id); const r=await supabase.from("training_sessions").delete().eq("id",selected.id); if(r.error)setMsg(errorText(r.error)); else { setSelected(null); await load(); await refresh(); setMsg("✓ Registro Eliminado."); } }
  if(selected) return <section><div className="back-row"><button className="back-btn" onClick={()=>setSelected(null)}>← Volver Al Historial</button><span>{dateText(selected.session_date)}</span></div><div className="card session-detail"><div className="detail-head"><div><span className="eyebrow">{TYPES[selected.activity_type]?.[1]}</span><h2>{TYPES[selected.activity_type]?.[0]} {selected.categories?.name}</h2><p>{selected.activity_type === "match" ? `Vs. ${selected.opponent || "—"}${selected.event_location ? ` · ${selected.event_location}` : ""}` : selected.activity_type === "tournament" ? `${selected.tournament_location || selected.event_location || "—"} · ${dateText(selected.tournament_start_date || selected.session_date)} → ${dateText(selected.tournament_end_date || selected.session_date)}` : "Registro De Entrenamiento"}</p></div><div className="record-actions">{can(profile, selected.categories, permissions, true) && <button className="danger" onClick={remove}>🗑️ Eliminar</button>}</div></div><div className="simple-list">{rows.map(r=>{const p=players.find(x=>x.id===r.player_id);return <div className="history-row" key={r.player_id}><Avatar player={p}/><div className="grow"><b>{p?.full_name || "Jugador@"}</b></div><StatusButtons value={r.status} disabled={!can(profile, selected.categories, permissions, true)} onChange={async status=>{const u=await supabase.from("attendance").update({status}).eq("session_id",selected.id).eq("player_id",r.player_id);if(!u.error)setRows(x=>x.map(y=>y.player_id===r.player_id?{...y,status}:y));}}/></div>})}</div></div>{msg&&<div className="message">{msg}</div>}</section>;
  return <section><PageTitle title="Historial" text="Entrá A Cada Sesión Para Ver O Modificar Su Asistencia."/><div className="card toolbar"><label>Categoría</label><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todas</option>{categories.map(c=><option key={c.id} value={c.id}>{genderText(c.gender)} · {c.name}</option>)}</select></div><div className="session-list">{sessions.length ? sessions.map(s=><button key={s.id} className="session-card card" onClick={()=>openSession(s)}><span className="session-icon">{TYPES[s.activity_type]?.[0]}</span><div className="grow"><b>{dateText(s.session_date)} · {s.categories?.name}</b><span>{TYPES[s.activity_type]?.[1]}{s.opponent ? ` · Vs. ${s.opponent}` : ""}</span></div><span>→</span></button>) : <Empty text="No Hay Registros."/>}</div></section>;
}

function AdminUsers({ profile }) {
  const [admins,setAdmins]=useState([]),[first,setFirst]=useState(""),[last,setLast]=useState(""),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[msg,setMsg]=useState(""),[saving,setSaving]=useState(false);
  const [editing,setEditing]=useState(null),[editName,setEditName]=useState(""),[editEmail,setEditEmail]=useState(""),[editPassword,setEditPassword]=useState(""),[editActive,setEditActive]=useState(true),[editCanApprovePayments,setEditCanApprovePayments]=useState(false);
  async function load(){const r=await supabase.rpc("get_superadmin_professor_accounts");if(!r.error)setAdmins(Array.isArray(r.data)?r.data:[]);}
  useEffect(()=>{if(profile.role==='super_admin')load()},[profile.role]);
  if(profile.role!=="super_admin")return null;
  async function create(e){e.preventDefault();setMsg("");if(!first.trim()||!last.trim()||!email.trim()||password.length<8){setMsg("Completá Nombre, Apellido, Correo y Una Contraseña De Al Menos 8 Caracteres.");return;}setSaving(true);try{const {data,error}=await supabase.functions.invoke("create-professor",{body:{first_name:first.trim(),last_name:last.trim(),email:email.trim(),password}});if(error||!data?.ok)throw error||new Error(data?.error||"No Se Pudo Crear La Cuenta.");setFirst("");setLast("");setEmail("");setPassword("");setMsg("✓ Cuenta De Profe Creada, Aprobada y Lista Para Ingresar.");await load();}catch(e){setMsg(errorText(e));}finally{setSaving(false)}}
  function beginEdit(a){setEditing(a);setEditName(a.full_name||"");setEditEmail(a.email||"");setEditPassword("");setEditActive(a.active!==false);setEditCanApprovePayments(a.can_approve_payments===true);setMsg("");}
  async function saveEdit(e){
    e.preventDefault(); if(!editing)return; setSaving(true);setMsg("");
    try{
      const profileUpdate=await supabase.rpc("superadmin_update_professor",{p_professor_id:editing.professor_id,p_full_name:editName.trim(),p_active:editActive});
      if(profileUpdate.error)throw profileUpdate.error;
      const paymentPermissionUpdate=await supabase.from("profiles").update({can_approve_payments:editCanApprovePayments}).eq("id",editing.professor_id).eq("role","admin");
      if(paymentPermissionUpdate.error)throw paymentPermissionUpdate.error;
      const authUpdate=await supabase.functions.invoke("update-professor-account",{body:{user_id:editing.professor_id,email:editEmail.trim(),password:editPassword}});
      if(authUpdate.error||!authUpdate.data?.ok)throw authUpdate.error||new Error(authUpdate.data?.error||"No Se Pudo Actualizar La Cuenta.");
      setEditing(null);setMsg("✓ Información Del Profe Actualizada.");await load();
    }catch(e){setMsg(errorText(e));}finally{setSaving(false);}
  }
  async function toggleActive(a){
    const nextActive=!a.active;
    setSaving(true);setMsg("");
    try{
      const r=await supabase.rpc("superadmin_update_professor",{p_professor_id:a.professor_id,p_full_name:a.full_name||"Profe",p_active:nextActive});
      if(r.error)throw r.error;
      setMsg(nextActive?"✓ Profe Activado Correctamente.":"✓ Profe Inactivado Correctamente.");
      await load();
    }catch(e){setMsg(errorText(e));}finally{setSaving(false);}
  }
  async function removeAdmin(a){
    if(!window.confirm(`¿Eliminar Definitivamente A ${a.full_name||"Este Profe"}? Esta Acción Elimina Su Cuenta De Acceso.`))return;
    setSaving(true);setMsg("");
    try{const r=await supabase.functions.invoke("delete-professor",{body:{user_id:a.professor_id}});if(r.error||!r.data?.ok)throw r.error||new Error(r.data?.error||"No Se Pudo Eliminar El Profe.");setMsg("✓ Profe Eliminado Correctamente.");if(editing?.professor_id===a.professor_id)setEditing(null);await load();}catch(e){setMsg(errorText(e));}finally{setSaving(false);}
  }
  return <section>
    <PageTitle title="Profes" text="Creá, Consultá, Modificá y Eliminá Las Cuentas De Los Profes."/>
    <div className="card admin-create-card"><div className="card-head"><div><h2>Nuevo Profe</h2><span>La Cuenta Queda Activa Inmediatamente.</span></div></div><form onSubmit={create}><div className="two"><input required placeholder="Nombre" value={first} onChange={e=>setFirst(e.target.value)}/><input required placeholder="Apellido" value={last} onChange={e=>setLast(e.target.value)}/></div><div className="two"><input required type="email" placeholder="Correo Electrónico" value={email} onChange={e=>setEmail(e.target.value)}/><input required minLength={8} type="password" placeholder="Contraseña Inicial" value={password} onChange={e=>setPassword(e.target.value)}/></div><button className="primary" disabled={saving}>{saving?"Creando...":"+ Crear Cuenta De Profe"}</button></form></div>
    {msg&&<div className="message">{msg}</div>}
    <div className="professor-management-grid">{admins.length?admins.map(a=><article className="card professor-account-card" key={a.professor_id}>
      <div className="professor-account-head"><div className="professor-account-avatar">👨‍🏫</div><div className="grow"><h3>{a.full_name||"Profe"}</h3><p>{a.email||"Sin Correo Asociado"}</p></div><button type="button" className={`professor-status professor-status-toggle ${a.active&&a.approval_status==="approved"?"active":"inactive"}`} disabled={saving} onClick={()=>toggleActive(a)} title={a.active?"Presioná Para Inactivar":"Presioná Para Activar"}>{a.active?"Activo":"Inactivo"}</button></div>
      <div className="professor-account-details"><div><span>Correo De Cuenta</span><b>{a.email||"—"}</b></div><div><span>Estado</span><b>{a.active?"Activo":"Inactivo"}</b></div><div><span>Aprobación</span><b>{a.approval_status||"—"}</b></div><div><span>Aprobar Pagos</span><b>{a.can_approve_payments?"Sí":"No"}</b></div></div>
      <div className="professor-account-actions"><button type="button" onClick={()=>beginEdit(a)}>✏️ Modificar</button><button type="button" className="danger" disabled={saving} onClick={()=>removeAdmin(a)}>🗑️ Eliminar</button></div>
    </article>):<Empty text="Todavía No Hay Profes Creados."/>}</div>
    {editing&&<div className="modal"><div className="modal-card professor-edit-modal"><div className="modal-head"><div><h2>Modificar Profe</h2><small>{editing.full_name}</small></div><button type="button" onClick={()=>setEditing(null)}>×</button></div><form onSubmit={saveEdit}>
      <label className="field-label">Nombre y Apellido<input required value={editName} onChange={e=>setEditName(e.target.value)}/></label>
      <label className="field-label">Correo Electrónico<input required type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)}/></label>
      <label className="field-label">Nueva Contraseña<input type="password" minLength={8} placeholder="Dejar Vacío Para Mantener La Actual" value={editPassword} onChange={e=>setEditPassword(e.target.value)}/></label>
      <label className="professor-active-toggle"><input type="checkbox" checked={editActive} onChange={e=>setEditActive(e.target.checked)}/><span>Cuenta Activa</span></label>
      <label className="professor-active-toggle"><input type="checkbox" checked={editCanApprovePayments} onChange={e=>setEditCanApprovePayments(e.target.checked)}/><span>Puede Aprobar Pagos</span></label>
      <small className="professor-security-note">Por Seguridad, La Contraseña Actual Nunca Se Puede Ver. Sí Podés Reemplazarla Por Una Nueva.</small>
      <div className="form-actions"><button type="button" onClick={()=>setEditing(null)}>Cancelar</button><button className="primary" disabled={saving}>{saving?"Guardando...":"Guardar Cambios"}</button></div>
    </form></div></div>}
  </section>;
}
function Categories({profile,categories,refresh}) {
  const [name,setName]=useState(""),[g,setG]=useState("female"),[msg,setMsg]=useState(""),[editing,setEditing]=useState(null),[draft,setDraft]=useState({name:"",gender:"female",active:true}),[busy,setBusy]=useState(false),[allCategories,setAllCategories]=useState([]);
  async function loadAll(){const r=await supabase.from("categories").select("*").order("gender").order("name");if(r.error)setMsg(errorText(r.error));else setAllCategories(r.data||[]);}
  useEffect(()=>{if(profile.role==="super_admin")void loadAll();},[profile.role]);
  async function add(e){e.preventDefault();if(!name.trim())return;const r=await supabase.from("categories").insert({name:name.trim(),gender:g,active:true,admin_id:profile.id});if(r.error)setMsg(errorText(r.error));else{setName("");setMsg("✓ Categoría Creada.");await Promise.all([refresh(),loadAll()]);}}
  if(profile.role!=="super_admin")return null;
  function beginEdit(category){setEditing(category.id);setDraft({name:category.name||"",gender:category.gender||"female",active:category.active!==false});setMsg("");}
  async function saveEdit(category){
    const nextName=draft.name.trim();
    if(!nextName){setMsg("El Nombre De La Categoría No Puede Quedar Vacío.");return;}
    setBusy(true);setMsg("");
    try{
      if(category.gender!==draft.gender){
        const check=await supabase.from("players").select("id",{count:"exact",head:true}).eq("category_id",category.id);
        if(check.error)throw check.error;
        if((check.count||0)>0&&!window.confirm(`Esta Categoría Tiene ${check.count} Jugador@${check.count===1?"":"s"}. ¿Confirmás Cambiar Su Clasificación De Género?`)){setBusy(false);return;}
      }
      const r=await supabase.from("categories").update({name:nextName,gender:draft.gender,active:draft.active}).eq("id",category.id);
      if(r.error)throw r.error;
      setEditing(null);setMsg("✓ Categoría Modificada Correctamente.");await Promise.all([refresh(),loadAll()]);
    }catch(e){setMsg(errorText(e));}finally{setBusy(false);}
  }
  async function removeCategory(category){
    setBusy(true);setMsg("");
    try{
      const [p,s]=await Promise.all([
        supabase.from("players").select("id",{count:"exact",head:true}).eq("category_id",category.id),
        supabase.from("training_sessions").select("id",{count:"exact",head:true}).eq("category_id",category.id)
      ]);
      if(p.error||s.error)throw p.error||s.error;
      const pc=p.count||0, sc=s.count||0;
      if(pc||sc){setMsg(`No Se Puede Eliminar “${category.name}” Porque Tiene ${pc} Jugador@${pc===1?"":"s"} y ${sc} Registro${sc===1?"":"s"} De Asistencia Asociado${sc===1?"":"s"}. Reasignalos Primero.`);return;}
      if(!window.confirm(`¿Eliminar Definitivamente La Categoría “${category.name}”? Esta Acción No Se Puede Deshacer.`))return;
      const r=await supabase.from("categories").delete().eq("id",category.id);
      if(r.error)throw r.error;
      if(editing===category.id)setEditing(null);
      setMsg("✓ Categoría Eliminada Correctamente.");await Promise.all([refresh(),loadAll()]);
    }catch(e){setMsg(errorText(e));}finally{setBusy(false);}
  }
  return <section><PageTitle title="Categorías" text="Creá, Modificá, Inactivá y Eliminá Categorías."/>
    <form className="card inline-form" onSubmit={add}><input placeholder="Ej.: Sub 14 B" value={name} onChange={e=>setName(e.target.value)}/><select value={g} onChange={e=>setG(e.target.value)}><option value="female">Femenino</option><option value="male">Masculino</option></select><button className="primary" disabled={busy}>+ Crear</button></form>
    {msg&&<div className="message">{msg}</div>}
    <div className="category-admin">{allCategories.map(category=><div className="card category-manage-row" key={category.id}>
      {editing===category.id?<div className="category-edit-grid"><input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))}/><select value={draft.gender} onChange={e=>setDraft(d=>({...d,gender:e.target.value}))}><option value="female">Femenino</option><option value="male">Masculino</option></select><label className="category-active-toggle"><input type="checkbox" checked={draft.active} onChange={e=>setDraft(d=>({...d,active:e.target.checked}))}/><span>Activa</span></label><button type="button" className="primary" disabled={busy} onClick={()=>saveEdit(category)}>Guardar</button><button type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</button></div>:
      <><div><b>{category.name}</b><small>{genderText(category.gender)} · {category.active===false?"Inactiva":"Activa"}</small></div><div className="category-manage-actions"><button type="button" disabled={busy} onClick={()=>beginEdit(category)}>✏️ Modificar</button><button type="button" className="danger" disabled={busy} onClick={()=>removeCategory(category)}>🗑️ Eliminar</button></div></>}
    </div>)}</div>
  </section>;
}
function Permissions({profile,categories}) {
  const [admins,setAdmins]=useState([]),[selected,setSelected]=useState(""),[perms,setPerms]=useState({});
  useEffect(()=>{async function load(){const a=await supabase.from("profiles").select("id,full_name").eq("role","admin").order("full_name");setAdmins(a.data||[]);const p=await supabase.from("admin_category_permissions").select("*");setPerms(Object.fromEntries((p.data||[]).map(x=>[`${x.admin_id}:${x.category_id}`,x])))}void load();},[]);
  if(profile.role!=="super_admin")return null;
  async function setP(c,field,value){if(!selected)return;const key=`${selected}:${c.id}`,cur=perms[key]||{can_view:false,can_edit:false},next={...cur,[field]:value};if(next.can_edit)next.can_view=true;const r=!next.can_view&&!next.can_edit?await supabase.from("admin_category_permissions").delete().eq("admin_id",selected).eq("category_id",c.id):await supabase.from("admin_category_permissions").upsert({admin_id:selected,category_id:c.id,can_view:next.can_view,can_edit:next.can_edit},{onConflict:"admin_id,category_id"});if(!r.error)setPerms(p=>({...p,[key]:next}));}
  return <section><PageTitle title="Permisos" text="Definí Qué Categorías Puede Ver y Editar Cada Profe."/>
    <div className="card permission-professor-picker"><label>Profe<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Seleccione Profe</option>{admins.map(a=><option key={a.id} value={a.id}>{a.full_name}</option>)}</select></label></div>
    {!selected?<div className="card empty permission-empty">Seleccione Profe Para Configurar Sus Permisos.</div>:<div className="permission-list">{categories.map(c=>{const p=perms[`${selected}:${c.id}`]||{};return <div className="card permission-row" key={c.id}><b>{genderText(c.gender)} · {c.name}</b><label><input type="checkbox" checked={!!p.can_view} onChange={e=>setP(c,"can_view",e.target.checked)}/> Ver</label><label><input type="checkbox" checked={!!p.can_edit} onChange={e=>setP(c,"can_edit",e.target.checked)}/> Editar</label></div>})}</div>}
  </section>;
}
function RequestsPage({ profile }) {
  const [players,setPlayers]=useState([]),[professors,setProfessors]=useState([]),[loading,setLoading]=useState(true),[msg,setMsg]=useState(""),[busy,setBusy]=useState("");
  const load=async(show=true)=>{if(show)setLoading(true);try{const r=await supabase.rpc("get_registration_requests");if(r.error)throw r.error;setPlayers(Array.isArray(r.data?.players)?r.data.players:[]);setProfessors(Array.isArray(r.data?.professors)?r.data.professors:[]);}catch(e){setMsg(errorText(e));}finally{if(show)setLoading(false);}};
  useEffect(()=>{let stopped=false,timer=null;void load(true);const sync=()=>{if(stopped)return;clearTimeout(timer);timer=setTimeout(()=>{if(!stopped)void load(false)},120)};const channel=supabase.channel(`requests-page:${profile.id}`).on("postgres_changes",{event:"*",schema:"public",table:"players"},sync).on("postgres_changes",{event:"*",schema:"public",table:"profiles"},sync).subscribe();return()=>{stopped=true;clearTimeout(timer);void supabase.removeChannel(channel);};},[profile.id]);
  async function review(kind,id,decision){setBusy(`${kind}:${id}`);setMsg("");try{const r=await supabase.rpc("review_registration_with_reason",{p_target_id:id,p_kind:kind,p_decision:decision,p_reason:null});if(r.error)throw r.error;if(!r.data?.ok)throw new Error(r.data?.message||"No Se Pudo Resolver La Solicitud.");setMsg(decision==="approved"?"✓ Solicitud Aprobada.":"✓ Solicitud Rechazada.");await load(false);}catch(e){setMsg(errorText(e));}finally{setBusy("");}}
  const pendingPlayers=players.filter(x=>x.approval_status==="pending"), pendingProfessors=professors.filter(x=>x.approval_status==="pending");
  const card=(kind,item)=><article className="registration-request-card" key={`${kind}:${item.id}`}><div className="registration-request-info"><strong>{item.full_name||"Sin Nombre"}</strong><span>{kind==="player"?`${item.sex==="male"?"Masculino":"Femenino"} · ${item.category_name||"Sin Categoría"}`:item.email||"Sin Correo"}</span></div><div className="registration-request-actions"><button className="approve" disabled={!!busy} onClick={()=>review(kind,item.id,"approved")}>✓ Aprobar</button><button className="reject" disabled={!!busy} onClick={()=>review(kind,item.id,"rejected")}>✕ Rechazar</button></div></article>;
  return <section className="registration-approval-page"><header className="registration-approval-title"><div><h1>Solicitudes</h1><p>Aprobá Las Cuentas Pendientes Sin Recargar La Página.</p></div><button type="button" onClick={()=>load(true)}>↻ Actualizar</button></header>{msg&&<div className="registration-approval-message">{msg}</div>}{loading?<div className="registration-approval-empty">Cargando Solicitudes...</div>:<>{profile.role==="super_admin"&&<section className="registration-approval-section"><div className="registration-approval-section-head"><h2>👨‍🏫 Profes</h2><span>{pendingProfessors.length} Pendiente{pendingProfessors.length===1?"":"s"}</span></div>{pendingProfessors.length?pendingProfessors.map(x=>card("professor",x)):<div className="registration-approval-empty">No Hay Solicitudes De Profes Pendientes.</div>}</section>}<section className="registration-approval-section"><div className="registration-approval-section-head"><h2>🏐 Jugador@s</h2><span>{pendingPlayers.length} Pendiente{pendingPlayers.length===1?"":"s"}</span></div>{pendingPlayers.length?pendingPlayers.map(x=>card("player",x)):<div className="registration-approval-empty">No Hay Solicitudes De Jugador@s Pendientes.</div>}</section></>}</section>;
}

function SolapasSettings({ profile, disabledTabs, onSavedVisibility, navigationItems, navigationOrder, onSavedOrder }) {
  const labels = navigationItems.map(([,label])=>label);
  const [visibilityDraft,setVisibilityDraft]=useState(disabledTabs),[orderDraft,setOrderDraft]=useState(()=>mergeNavigationOrder(navigationItems,navigationOrder).map(([,label])=>label));
  const [msg,setMsg]=useState(""),[savingVisibility,setSavingVisibility]=useState(false),[savingOrder,setSavingOrder]=useState(false),[dragged,setDragged]=useState("");
  useEffect(()=>setVisibilityDraft(disabledTabs),[disabledTabs]);
  useEffect(()=>setOrderDraft(mergeNavigationOrder(navigationItems,navigationOrder).map(([,label])=>label)),[navigationOrder,labels.join("|")]);
  const visibilityOptions=["Asistencia","Jugador@s","Historial","Horarios","Pagos","Solicitudes","Profes","Categorías","Permisos"];

  function moveLabel(label,direction){
    setOrderDraft(current=>{
      const next=[...current], index=next.indexOf(label), target=index+direction;
      if(index<0||target<0||target>=next.length)return current;
      [next[index],next[target]]=[next[target],next[index]];
      return next;
    });
  }
  function dropOn(target){
    if(!dragged||dragged===target)return;
    setOrderDraft(current=>{
      const next=current.filter(label=>label!==dragged);
      const index=next.indexOf(target);
      next.splice(index<0?next.length:index,0,dragged);
      return next;
    });
    setDragged("");
  }
  async function saveOrder(){
    setSavingOrder(true);setMsg("");
    try{
      const r=await supabase.from("user_ui_preferences").upsert({user_id:profile.id,navigation_order:orderDraft,updated_at:new Date().toISOString()},{onConflict:"user_id"});
      if(r.error)throw r.error;
      onSavedOrder(orderDraft);
      setMsg("✓ Orden De Solapas Guardado Para Tu Cuenta.");
    }catch(e){setMsg(errorText(e));}finally{setSavingOrder(false);}
  }
  async function saveVisibility(){
    if(profile.role!=="super_admin")return;
    setSavingVisibility(true);setMsg("");
    try{
      const r=await supabase.from("app_ui_settings").update({disabled_tabs:visibilityDraft,updated_at:new Date().toISOString(),updated_by:profile.id}).eq("id","global");
      if(r.error)throw r.error;
      onSavedVisibility(visibilityDraft);
      setMsg("✓ Visibilidad Global Actualizada Correctamente.");
    }catch(e){setMsg(errorText(e));}finally{setSavingVisibility(false);}
  }
  return <section><PageTitle title="Solapas" text="Ordená Las Secciones A Tu Gusto. Este Orden Es Personal Para Tu Cuenta."/>
    <div className="card solapas-order-card">
      <div className="card-head"><div><h2>Orden Personal</h2><span>Arrastrá Las Solapas O Usá Las Flechas. El Cambio Solo Afecta Tu Cuenta.</span></div></div>
      <div className="solapas-order-list">{orderDraft.map((label,index)=><div className={`solapas-order-item ${dragged===label?"dragging":""}`} key={label} draggable onDragStart={()=>setDragged(label)} onDragEnd={()=>setDragged("")} onDragOver={e=>e.preventDefault()} onDrop={()=>dropOn(label)}>
        <span className="solapas-drag-handle" title="Arrastrar">☰</span><b>{label}</b>
        <div className="solapas-order-actions"><button type="button" aria-label={`Subir ${label}`} disabled={index===0} onClick={()=>moveLabel(label,-1)}>↑</button><button type="button" aria-label={`Bajar ${label}`} disabled={index===orderDraft.length-1} onClick={()=>moveLabel(label,1)}>↓</button></div>
      </div>)}</div>
      <button className="primary wide" type="button" disabled={savingOrder} onClick={saveOrder}>{savingOrder?"Guardando...":"Guardar Orden"}</button>
    </div>
    {profile.role==="super_admin"&&<div className="card solapas-page-card"><div className="card-head"><div><h2>Visibilidad Global</h2><span>Definí Qué Secciones Pueden Ver Los Profes y Jugador@s.</span></div></div><div className="solapas-page-grid">{visibilityOptions.map(label=><label className="solapas-option" key={label}><input type="checkbox" checked={!visibilityDraft.includes(label)} onChange={e=>setVisibilityDraft(cur=>e.target.checked?cur.filter(x=>x!==label):[...cur,label])}/><span>{label}</span></label>)}</div><button className="primary wide" type="button" disabled={savingVisibility} onClick={saveVisibility}>{savingVisibility?"Guardando...":"Guardar Visibilidad"}</button></div>}
    {msg&&<div className="message">{msg}</div>}
  </section>;
}

function PlayerDashboard({session,onLogout,onBackAdmin}) {
  const [player,setPlayer]=useState(null),[rows,setRows]=useState([]),[editing,setEditing]=useState(false),[msg,setMsg]=useState(""),[view,setView]=useState("profile"),[playerHiddenTabs,setPlayerHiddenTabs]=useState([]);
  useEffect(()=>{async function load(){if(!isAuthSession(session)&&!isLegacySession(session))return;const ui=await supabase.from("app_ui_settings").select("disabled_tabs").eq("id","global").maybeSingle();setPlayerHiddenTabs(Array.isArray(ui.data?.disabled_tabs)?ui.data.disabled_tabs:[]);if(session?.legacy){setPlayer(session);const r=await supabase.rpc("player_attendance",{p_name:session.name,p_code:session.code});setRows(r.data||[]);return;} const p=await supabase.from("players").select("*").eq("user_id",session.user.id).maybeSingle();setPlayer(p.data); if(p.data){const r=await supabase.from("attendance").select("session_id,status,training_sessions(session_date,activity_type)").eq("player_id",p.data.id).order("session_id");setRows((r.data||[]).map(x=>({session_date:x.training_sessions?.session_date,activity_type:x.training_sessions?.activity_type,status:x.status,session_id:x.session_id})));}}load()},[session]);
  useEffect(()=>{if(playerHiddenTabs.includes("Horarios")&&view==="schedule")setView("profile");},[playerHiddenTabs,view]);
  if(!player)return <main className="loading-screen"><Brand/>Cargando Tu Perfil...</main>;
  const counts={present:rows.filter(r=>r.status==="present").length,late:rows.filter(r=>r.status==="late").length,absent:rows.filter(r=>r.status==="absent").length};
  return <main className="player-app"><header className="topbar"><Brand compact/><button onClick={onLogout}>Salir</button></header><div className="player-wrap"><div className="player-section-nav">{onBackAdmin&&<button type="button" className="player-back-admin" onClick={onBackAdmin}>← Administración</button>}<button type="button" className={view==="profile"?"active":""} onClick={()=>setView("profile")}>👤 Mi Perfil</button>{!playerHiddenTabs.includes("Horarios")&&<button type="button" className={view==="schedule"?"active":""} onClick={()=>setView("schedule")}>🕐 Horarios</button>}</div>{view==="schedule"?<div className="player-schedule-wrap"><TrainingSchedule playerMode/></div>:<><section className="hero-profile card"><Avatar player={player}/><div className="grow"><span className="eyebrow">Mi Perfil</span><h1>{player.full_name || player.name}</h1><p>{player.category_name || "Categoría Pendiente"} · {player.team ? `Equipo ${player.team}` : "Sin Asignar"}</p></div><button className="profile-edit-btn" onClick={()=>setEditing(true)}>✏️ Editar Mis Datos</button></section><div className="stats"><div className="card"><b>{counts.present}</b><span>Presentes</span></div><div className="card"><b>{counts.late}</b><span>Tardanzas</span></div><div className="card"><b>{counts.absent}</b><span>Ausencias</span></div></div><div className="card access-box"><span>Tu Código Personal</span><strong>{player.access_code || session.code || "—"}</strong><button onClick={()=>copyText(player.access_code||session.code).then(()=>setMsg("✓ Código Copiado."))}>📋 Copiar Código</button></div><div className="card"><div className="card-head"><h2>Mi Asistencia</h2></div><div className="simple-list">{rows.map((r,i)=><div className="history-row" key={r.session_id||i}><div className="grow"><b>{dateText(r.session_date)}</b><span>{TYPES[r.activity_type]?.[1]}</span></div><span className={`badge ${r.status}`}>{STATUS[r.status]?.[1]}</span></div>)}</div></div>{msg&&<div className="message">{msg}</div>}</>}</div>{editing&&!session.legacy&&<PlayerSelfEdit player={player} onClose={()=>setEditing(false)} onSaved={updated=>{setPlayer(updated);setEditing(false);setMsg("✓ Perfil Actualizado Correctamente.")}}/>}</main>;
}
function PlayerSelfEdit({player,onClose,onSaved}) { const [data,setData]=useState({first:player.first_name||"",last:player.last_name||"",dni:player.dni||"",birth:player.birth_date||"",sex:player.sex||"female",file:null}); const [saving,setSaving]=useState(false); const fileRef=useRef(null); async function save(e){e.preventDefault();setSaving(true);try{const r=await supabase.from("players").update({first_name:data.first,last_name:data.last,full_name:`${data.last.toUpperCase()} ${data.first}`,dni:data.dni,birth_date:data.birth,sex:data.sex}).eq("id",player.id).select().single();if(r.error)throw r.error;let updated=r.data;if(data.file){const path=`${player.user_id}/${Date.now()}-${data.file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const up=await supabase.storage.from("player-selfies").upload(path,data.file,{upsert:true,contentType:data.file.type||"image/jpeg"});if(up.error)throw up.error;const ur=await supabase.from("players").update({selfie_path:path}).eq("id",player.id).select().single();if(ur.error)throw ur.error;updated=ur.data;}onSaved(updated);}catch(e){alert(errorText(e));}finally{setSaving(false)}} return <div className="modal"><div className="modal-card"><div className="modal-head"><h2>Mi Perfil</h2><button type="button" onClick={onClose}>×</button></div><form onSubmit={save}><div className="two"><input value={data.first} onChange={e=>setData(d=>({...d,first:e.target.value}))}/><input value={data.last} onChange={e=>setData(d=>({...d,last:e.target.value}))}/></div><div className="two"><select value={data.sex} onChange={e=>setData(d=>({...d,sex:e.target.value}))}><option value="female">Femenino</option><option value="male">Masculino</option></select><input value={data.dni} placeholder="DNI" onChange={e=>setData(d=>({...d,dni:e.target.value}))}/></div><input type="date" value={data.birth} onChange={e=>setData(d=>({...d,birth:e.target.value}))}/><label className="selfie-field"><span>Selfie</span><span className="file-button" onClick={() => fileRef.current?.click()}>📷 {data.file?"Cambiar Selfie":"Subir Selfie"}</span><input ref={fileRef} className="hidden-file" type="file" accept="image/*" capture="user" onChange={e=>setData(d=>({...d,file:e.target.files?.[0]||null}))}/>{data.file&&<span className="file-name">✓ {data.file.name}</span>}</label><div className="form-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?"Guardando...":"Guardar Cambios"}</button></div></form></div></div>; }

function App() {
  const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[playerSession,setPlayerSession]=useState(readStoredPlayer),[players,setPlayers]=useState([]),[categories,setCategories]=useState([]),[permissions,setPermissions]=useState({}),[tab,setTab]=useState("home");
  const [disabledTabs,setDisabledTabs]=useState([]),[navigationOrder,setNavigationOrder]=useState([]);
  const [dualPlayerAvailable,setDualPlayerAvailable]=useState(false),[dualPlayerMode,setDualPlayerMode]=useState(false);
  const authIntent = useRef(null), authEpoch = useRef(0);
  function clearIdentity() { setSession(null); setProfile(null); setPlayerSession(null); setPlayers([]); setCategories([]); setPermissions({}); setDisabledTabs([]); setNavigationOrder([]); setDualPlayerAvailable(false); setDualPlayerMode(false); }
  async function applySession(current) {
    const epoch = ++authEpoch.current;
    if (!isAuthSession(current)) { clearIdentity(); return; }
    const p = await supabase.from('profiles').select('*').eq('id',current.user.id).maybeSingle();
    if (epoch !== authEpoch.current) return;
    if (p.error || !p.data) { clearIdentity(); return; }
    if (p.data.role === 'player') { setSession(null); setProfile(null); setPlayerSession(current); return; }
    if (!['admin','super_admin'].includes(p.data.role)) { clearIdentity(); return; }
    const [c, pe, ps, ui, pref] = await Promise.all([
      supabase.from('categories').select('*').eq('active',true).order('gender').order('name'),
      supabase.from('admin_category_permissions').select('category_id,can_view,can_edit').eq('admin_id',current.user.id),
      supabase.from('players').select('*').eq('active',true).order('full_name'),
      supabase.from('app_ui_settings').select('disabled_tabs').eq('id','global').maybeSingle(),
      supabase.from('user_ui_preferences').select('navigation_order').eq('user_id',current.user.id).maybeSingle()
    ]);
    if (epoch !== authEpoch.current) return;
    const map = Object.fromEntries((pe.data||[]).map(x=>[x.category_id,x]));
    let nextPlayers = ps.data || [];
    if (p.data.role === "super_admin") {
      const emailRows = await supabase.rpc("get_superadmin_player_account_emails");
      if (!emailRows.error) {
        const byId = Object.fromEntries((emailRows.data || []).map(row => [row.player_id, row.email || null]));
        nextPlayers = nextPlayers.map(row => ({...row, account_email: byId[row.id] ?? null}));
      }
    }
    const ownPlayer = nextPlayers.find(row=>row.user_id===current.user.id && row.active && row.approval_status==="approved");
    setPermissions(map); setCategories((c.data||[]).filter(x=>can(p.data,x,map))); setPlayers(nextPlayers); setDisabledTabs(Array.isArray(ui.data?.disabled_tabs)?ui.data.disabled_tabs:[]); setNavigationOrder(Array.isArray(pref.data?.navigation_order)?pref.data.navigation_order:[]); setDualPlayerAvailable(!!ownPlayer);
    setPlayerSession(null); setProfile(p.data); setSession(current);
  }
  useEffect(()=>{
    let mounted = true;
    const accept = current => { if (mounted && !authIntent.current) void applySession(current); };
    // Preserve only a validated legacy session when no Auth session exists.
    supabase.auth.getSession().then(({data})=>{if(data.session)accept(data.session)});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,current)=>{
      if (event === 'INITIAL_SESSION' && !current) return;
      setTimeout(()=>accept(current), 0);
    });
    return ()=>{mounted=false;authEpoch.current++;subscription.unsubscribe();};
  },[]);
  const refresh=()=>isAuthSession(session)?applySession(session):Promise.resolve();


  const logout=async()=>{authEpoch.current++;removeStoredPlayer(localStorage);clearIdentity();await supabase.auth.signOut({scope:'local'});};
  async function acceptAdmin(current) {
    if (!isAuthSession(current)) throw new Error('La Sesión No Es Válida. Volvé A Ingresar.');
    const p = await supabase.from('profiles').select('role').eq('id',current.user.id).maybeSingle();
    if (p.error || !['admin','super_admin'].includes(p.data?.role)) {
      clearIdentity(); await supabase.auth.signOut({scope:'local'});
      throw new Error('Esta Cuenta No Tiene Acceso Como Profe. Ingresá Desde Jugador@s.');
    }
    await applySession(current);
  }
  if (dualPlayerMode&&isAuthSession(session)) return <PlayerDashboard session={session} onLogout={logout} onBackAdmin={()=>setDualPlayerMode(false)}/>;
  if ((isAuthSession(playerSession)||isLegacySession(playerSession))&&!session) return <PlayerDashboard session={playerSession} onLogout={logout}/>;
  if(!isAuthSession(session)||!['admin','super_admin'].includes(profile?.role)) return <Login
    onAuthStart={mode=>{authIntent.current=mode;authEpoch.current++;}}
    onAuthEnd={()=>{authIntent.current=null;}}
    onAdmin={acceptAdmin}
    onPlayer={current=>{if(isLegacySession(current)){storeLegacyPlayer(current);setPlayerSession(current);}else if(isAuthSession(current)){setPlayerSession(current);}}}/>;
  const nav=[['home','Asistencia'],['players','Jugador@s'],['history','Historial'],['schedule','Horarios'],['payments','Pagos'],['requests','Solicitudes']];
  if(dualPlayerAvailable)nav.splice(2,0,['playerProfile','Mi Perfil']);
  if(profile.role==='super_admin')nav.push(['admins','Profes'],['categories','Categorías'],['permissions','Permisos']);
  nav.push(['settings','Solapas']);
  const allowedNav = profile.role === "super_admin" ? nav : nav.filter(([,label])=>label==="Solapas"||!disabledTabs.includes(label));
  const visibleNav = mergeNavigationOrder(allowedNav,navigationOrder);
  return <main className="app"><header className="topbar"><Brand compact/><div className="top-user"><span className="top-user-name">{profile.full_name||"Profe"}</span><button className="topbar-exit" onClick={logout}>Salir</button></div></header><nav>{visibleNav.map(([k,l])=><button key={k} data-feature-tab={l} className={k==="playerProfile"?"player-profile-nav":tab===k?"active":""} onClick={()=>k==="playerProfile"?setDualPlayerMode(true):setTab(k)}>{l}</button>)}</nav><div className="content"><div className="watermark"/><div className="content-inner">{tab==='home'&&<Attendance profile={profile} players={players} categories={categories} permissions={permissions} refresh={refresh}/>} {tab==='players'&&<Players profile={profile} players={players} categories={categories} permissions={permissions} refresh={refresh}/>} {tab==='history'&&<History profile={profile} players={players} categories={categories} permissions={permissions} refresh={refresh}/>} {tab==='schedule'&&<TrainingSchedule/>} {tab==='payments'&&<AdminPaymentPanel role={profile.role} canApprovePayments={profile.role==="super_admin"||profile.can_approve_payments===true} embedded/>} {tab==='requests'&&<RequestsPage profile={profile}/>} {tab==='admins'&&<AdminUsers profile={profile}/>}  {tab==='categories'&&<Categories profile={profile} categories={categories} refresh={refresh}/>} {tab==='permissions'&&<Permissions profile={profile} categories={categories}/>} {tab==='settings'&&<SolapasSettings profile={profile} disabledTabs={disabledTabs} onSavedVisibility={setDisabledTabs} navigationItems={allowedNav} navigationOrder={navigationOrder} onSavedOrder={setNavigationOrder}/>} </div></div><footer><img src={LOGO} alt=""/><span>{APP_NAME} · {TAGLINE}</span></footer></main>;
}
export default App;