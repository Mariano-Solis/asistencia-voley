import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { isAuthSession, isLegacySession, readStoredPlayer, removeStoredPlayer, storeLegacyPlayer } from "./sessionSafety";
import { CONFLICT_MESSAGE, attendanceWriteError, attendanceFingerprint, readAttendance } from "./attendanceSafety";
import TrainingSchedule from "./TrainingSchedule";

const APP_NAME = "Municipalidad de San Martín - VOLEY";
const TAGLINE = "#VamosElPoli";
const LOGO = "/Logo.jpg";
const PUBLIC_APP_URL = "https://voleysanmartin.com.ar/";
const TYPES = { training: ["🏐", "Entrenamiento"], match: ["🏆", "Partido"], tournament: ["🥇", "Torneo"] };
const STATUS = { present: ["✓", "Presente"], late: ["◷", "Tarde"], absent: ["✕", "Ausente"] };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Mendoza" });
const clean = v => String(v ?? "").trim();
const gender = v => ["female", "femenino", "femenina", "mujer", "f"].includes(clean(v).toLowerCase()) ? "female" : "male";
const genderText = g => gender(g) === "female" ? "Femenino" : "Masculino";
const plural = g => gender(g) === "female" ? "Jugadoras" : "Jugadores";
const dateText = v => v ? new Date(`${v}T12:00:00`).toLocaleDateString("es-AR") : "—";
const errorText = e => e?.message || "Ocurrió un error.";
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
  if (!ok) throw new Error("No se pudo copiar.");
}
async function shareText(title, text) {
  if (navigator.share) { await navigator.share({ title, text }); return; }
  await copyText(text);
}
function ageOf(birth) { if (!birth) return "—"; const b = new Date(`${birth}T12:00:00`), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--; return a; }
function categoryName(categories, id) { return categories.find(c => c.id === id)?.name || "Sin categoría"; }

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
          if (!data?.ok) throw new Error(data?.message || "Nombre o código incorrectos.");
          onPlayer({ legacy: true, id: data.id, name: data.full_name, code: code.trim().toUpperCase(), category_id: data.category_id, category_name: data.category_name });
        }
      } else if (mode === "admin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error; await onAdmin(data.session);
      } else {
        if (!first.trim() || !last.trim() || !email.trim() || !birth || !dni.trim()) throw new Error("Completá todos los datos obligatorios.");
        if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
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
        if (!data.session) { setMessage("✓ Cuenta creada. Revisá tu correo para confirmar la cuenta y luego ingresá como Jugador@."); setMode("player"); return; }
        if (!isAuthSession(data.session)) throw new Error("La sesión no es válida. Volvé a ingresar.");
        const uid = data.session.user.id;
        const playerRow = await supabase.from("players").select("*").eq("user_id", uid).single();
        if (playerRow.error) throw playerRow.error;
        if (selfie) { const path = `${uid}/${Date.now()}-${selfie.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`; const up = await supabase.storage.from("player-selfies").upload(path, selfie, { upsert: true, contentType: selfie.type || "image/jpeg" }); if (!up.error) await supabase.from("players").update({ selfie_path: path }).eq("id", playerRow.data.id); }
        setMessage(`✓ Cuenta creada. Tu código personal es ${playerRow.data.access_code}. Guardalo: también podés copiarlo desde tu perfil.`); onPlayer(data.session);
      }
    } catch (e) { setMessage(errorText(e)); } finally { setLoading(false); onAuthEnd?.(); }
  }
  return <main className="auth"><div className="auth-bg-logo"/><section className="auth-card">
    <Brand/><div className="auth-tabs"><button type="button" className={mode === "player" ? "active" : ""} onClick={() => setMode("player")}>Jugador@s</button><button type="button" className={mode === "admin" ? "active" : ""} onClick={() => setMode("admin")}>Profe</button><button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Crear cuenta</button></div>
    <p className="auth-subtitle">{mode === "signup" ? "Creá tu cuenta personal de Jugador@." : mode === "admin" ? "Acceso para profes y administradores." : "Ingresá para consultar tu asistencia."}</p>
    <form onSubmit={submit}>
      {mode === "player" && <><input type="email" placeholder="Correo electrónico" value={email} onChange={e => setEmail(e.target.value)}/><input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)}/><div className="or">o acceso con código personal</div><input placeholder="Nombre y apellido" value={name} onChange={e => setName(e.target.value)}/><input placeholder="Código personal" value={code} onChange={e => setCode(e.target.value.toUpperCase())}/><button className="primary" disabled={loading}>{loading ? "Ingresando..." : "Ingresar"}</button></>}
      {mode === "admin" && <><input required type="email" placeholder="Correo electrónico" value={email} onChange={e => setEmail(e.target.value)}/><input required type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)}/><button className="primary" disabled={loading}>{loading ? "Ingresando..." : "Ingresar como profe"}</button></>}
      {mode === "signup" && <><div className="two"><input required placeholder="Nombre" value={first} onChange={e => setFirst(e.target.value)}/><input required placeholder="Apellido" value={last} onChange={e => setLast(e.target.value)}/></div><div className="two"><select value={sex} onChange={e => setSex(e.target.value)}><option value="female">Femenino</option><option value="male">Masculino</option></select><input required placeholder="DNI" value={dni} onChange={e => setDni(e.target.value)}/></div><label className="field-label">Fecha de nacimiento<input required type="date" value={birth} onChange={e => setBirth(e.target.value)}/></label><label className="selfie-field"><span>Selfie</span><span className="file-button" onClick={() => fileRef.current?.click()}>📷 Elegir selfie</span><input ref={fileRef} className="hidden-file" type="file" accept="image/*" capture="user" onChange={e => setSelfie(e.target.files?.[0] || null)}/>{selfie && <span className="file-name">✓ {selfie.name}</span>}</label><input required type="email" placeholder="Correo electrónico" value={email} onChange={e => setEmail(e.target.value)}/><input required type="password" minLength={6} placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)}/><button className="primary" disabled={loading}>{loading ? "Creando..." : "Crear mi cuenta"}</button></>}
    </form>{message && <div className="message">{message}</div>}<small className="legal">La profe asignará la categoría y equipo cuando corresponda.</small>
  </section></main>;
}

function StatusButtons({ value, onChange, disabled = false }) { return <div className="status-picker">{Object.entries(STATUS).map(([k, v]) => <button disabled={disabled} type="button" key={k} className={`status ${k} ${value === k ? "active" : ""}`} onClick={() => onChange(k)}><b>{v[0]}</b><span>{v[1]}</span></button>)}</div>; }

function Attendance({ profile, players, categories, permissions, refresh }) {
  const editable = useMemo(() => categories.filter(c => can(profile, c, permissions, true)), [categories, profile, permissions]);
  const [date, setDate] = useState(today()); const [categoryId, setCategoryId] = useState(editable[0]?.id || ""); const [type, setType] = useState("training"); const [open, setOpen] = useState(true);
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
    if (savingRef.current) { window.alert("Esperá a que termine el guardado antes de salir."); return false; }
    if (draftRef.current && !window.confirm("Tenés cambios de asistencia sin guardar. ¿Querés descartarlos y continuar?")) return false;
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
  useEffect(() => { if (!editable.some(c => c.id === categoryId)) setCategoryId(editable[0]?.id || ""); }, [editable, categoryId]);
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
      baselineRef.current=verified;setLoadedAt(verified.loadedAt);discardDraft();setMsg('✓ Registro guardado.');
      await refresh();
    }catch(error){draftRef.current=true;setDirty(true);setMsg(attendanceWriteError(error));}
    finally{savingRef.current=false;setSaving(false);}
  }
  return <section data-attendance-dirty={dirty ? "true" : "false"} data-attendance-loaded-at={loadedAt || ""}><PageTitle title="Asistencia" text="Tomá y modificá la asistencia de cada Jugador@." action={<input type="date" value={date} disabled={saving} onChange={changeDate}/>}/><div className="card filter-card"><label>Categoría</label><select data-attendance-category-proxy="true" value={categoryId} disabled={saving} onChange={changeCategory}>{editable.map(c => <option key={c.id} value={c.id}>{genderText(c.gender)} · {c.name}</option>)}</select><label>Actividad</label><div className="activity-picker">{Object.entries(TYPES).map(([k,v]) => <button type="button" key={k} className={type === k && open ? "active" : type === k ? "selected" : ""} disabled={saving} onClick={() => changeActivity(k)}>{v[0]} {v[1]}</button>)}</div>{open && type === "match" && <div className="event-grid"><label>Rival<input value={details.opponent} disabled={saving || loading} onChange={e => editDetails(d => ({...d, opponent: e.target.value}))}/></label><label>Lugar<input value={details.location} disabled={saving || loading} onChange={e => editDetails(d => ({...d, location: e.target.value}))}/></label></div>}{open && type === "tournament" && <div className="event-grid"><label>Lugar<input value={details.location} disabled={saving || loading} onChange={e => editDetails(d => ({...d, location: e.target.value}))}/></label><label>Desde<input type="date" value={details.start} disabled={saving || loading} onChange={e => editDetails(d => ({...d, start: e.target.value}))}/></label><label>Hasta<input type="date" value={details.end} disabled={saving || loading} onChange={e => editDetails(d => ({...d, end: e.target.value}))}/></label></div>}</div><div className="card attendance-card"><div className="card-head"><h3>{plural(categories.find(c => c.id === categoryId)?.gender)} · {categoryName(categories, categoryId)}</h3><span>{list.length} Jugador@s</span></div>{list.length ? list.map(p => <div className="attendance-row" key={p.id}><Avatar player={p}/><div className="grow"><b>{p.full_name}</b><small>{p.team ? `Equipo ${p.team}` : "Sin asignar"}</small></div><StatusButtons value={att[p.id]} disabled={saving || loading} onChange={v => { markDirty(); setAtt(a => ({...a, [p.id]: v})); }}/></div>) : <Empty text="No hay Jugador@s en esta categoría."/>}<button className="primary wide" disabled={saving || loading || conflict || !open || !list.length} onClick={save}>{saving ? "Guardando..." : "Guardar / modificar registro"}</button>{msg && <div className="message" role="status">{msg}</div>}{conflict && <button type="button" className="attendance-review" disabled={saving} onClick={reviewChanges}>Revisar cambios guardados</button>}{loadedAt && <small className="attendance-loaded">Última lectura: {new Date(loadedAt).toLocaleTimeString()}</small>}</div></section>;
}
function Avatar({ player }) { if (player?.selfie_path) { const { data } = supabase.storage.from("player-selfies").getPublicUrl(player.selfie_path); return <img className="avatar photo" src={data.publicUrl} alt=""/>; } return <div className="avatar">{player?.full_name?.charAt(0)?.toUpperCase() || "J"}</div>; }
function PageTitle({ title, text, action }) { return <div className="page-title"><div><h1>{title}</h1><p>{text}</p></div>{action}</div>; }
function Empty({ text }) { return <div className="empty">{text}</div>; }

function Players({ profile, players, categories, permissions, refresh }) {
  const editable = categories.filter(c => can(profile, c, permissions, true)); const visible = categories.filter(c => can(profile, c, permissions));
  const [search, setSearch] = useState(""); const [filter, setFilter] = useState("all"); const [open, setOpen] = useState(null); const [msg, setMsg] = useState(""); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ first: "", last: "", category: editable[0]?.id || "", sex: "female", dni: "", birth: "", team: "", file: null }); const fileRef = useRef(null);
  const list = players.filter(p => { const c = categories.find(x => x.id === p.category_id); const allowed = c ? can(profile, c, permissions) : profile.role === "super_admin"; return allowed && (filter === "all" || p.category_id === filter) && (!search || p.full_name.toLowerCase().includes(search.toLowerCase())); });
  async function savePlayer(e) { e.preventDefault(); if (!form.first || !form.last || !form.category) return; setSaving(true); try { let categoryId = form.category; const auto = await supabase.rpc("calculate_player_category", { p_birth_date: form.birth, p_sex: form.sex }); if (!auto.error && auto.data) categoryId = auto.data; const row = { first_name: form.first.trim(), last_name: form.last.trim(), full_name: `${form.last.trim().toUpperCase()} ${form.first.trim()}`, sex: form.sex, dni: clean(form.dni) || null, birth_date: form.birth || null, category_id: categoryId, team: form.team || null, access_code: accessCode(), active: true }; const r = await supabase.from("players").insert(row); if (r.error) throw r.error; setForm(f => ({...f, first: "", last: "", dni: "", birth: "", team: "", file: null})); setMsg("✓ Jugador@ agregado."); await refresh(); } catch(e) { setMsg(errorText(e)); } finally { setSaving(false); } }
  async function saveEdit(p, data) { setSaving(true); try { let categoryId = data.category; const auto = await supabase.rpc("calculate_player_category", { p_birth_date: data.birth, p_sex: data.sex }); if (!auto.error && auto.data) categoryId = auto.data; const r = await supabase.from("players").update({ first_name: data.first, last_name: data.last, full_name: `${data.last.toUpperCase()} ${data.first}`, sex: data.sex, dni: data.dni || null, birth_date: data.birth || null, category_id: categoryId, team: data.team || null }).eq("id", p.id); if (r.error) throw r.error; if (data.file) { const path = `${p.user_id || "admin"}/${Date.now()}-${data.file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`; const up = await supabase.storage.from("player-selfies").upload(path, data.file, { upsert: true, contentType: data.file.type || "image/jpeg" }); if (up.error) throw up.error; const ur = await supabase.from("players").update({ selfie_path: path }).eq("id", p.id); if (ur.error) throw ur.error; } setOpen(null); setMsg("✓ Datos actualizados."); await refresh(); } catch(e) { setMsg(errorText(e)); } finally { setSaving(false); } }
  async function remove(p) { if (!confirm(`¿Eliminar a ${p.full_name}?`)) return; const r = await supabase.from("players").update({active:false}).eq("id", p.id); if (r.error) setMsg(errorText(r.error)); else { setMsg("✓ Jugador@ eliminado."); await refresh(); } }
  async function share(p) { try { await shareText(`${APP_NAME} · Acceso`, `${APP_NAME}\
${TAGLINE}\
\
Jugador@: ${p.full_name}\
Código personal: ${p.access_code}`); setMsg("✓ Datos compartidos/copiados."); } catch(e) { if(e?.name !== "AbortError") setMsg(errorText(e)); } }
  return <section><PageTitle title="Jugador@s" text="Datos personales, selfie, categoría, equipo y código de acceso."/><div className="card add-player-card"><h3>Agregar Jugador@ desde la administración</h3><form onSubmit={savePlayer}><div className="three"><input required placeholder="Nombre" value={form.first} onChange={e=>setForm(f=>({...f,first:e.target.value}))}/><input required placeholder="Apellido" value={form.last} onChange={e=>setForm(f=>({...f,last:e.target.value}))}/><select value={form.sex} onChange={e=>setForm(f=>({...f,sex:e.target.value}))}><option value="female">Femenino</option><option value="male">Masculino</option></select></div><div className="three"><input placeholder="DNI" value={form.dni} onChange={e=>setForm(f=>({...f,dni:e.target.value}))}/><input type="date" value={form.birth} onChange={e=>setForm(f=>({...f,birth:e.target.value}))}/><select value={form.team} onChange={e=>setForm(f=>({...f,team:e.target.value}))}><option value="">Sin asignar</option><option value="A">Equipo A</option><option value="B">Equipo B</option><option value="C">Equipo C</option><option value="D">Equipo D</option><option value="E">Equipo E</option></select></div><select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{editable.map(c=><option key={c.id} value={c.id}>{genderText(c.gender)} · {c.name}</option>)}</select><button className="primary" disabled={saving}>+ Agregar Jugador@</button></form></div><div className="toolbar card"><input placeholder="Buscar por nombre" value={search} onChange={e=>setSearch(e.target.value)}/><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todas las categorías</option>{visible.map(c=><option key={c.id} value={c.id}>{genderText(c.gender)} · {c.name}</option>)}</select></div>{msg && <div className="message">{msg}</div>}<div className="player-grid">{list.length ? list.map(p => <PlayerCard key={p.id} player={p} categories={categories} canEdit={profile.role === "super_admin" || can(profile, categories.find(c=>c.id===p.category_id), permissions, true)} onEdit={() => setOpen(p)} onDelete={() => remove(p)} onShare={() => share(p)}/>) : <Empty text="No hay registros."/>}</div>{open && <PlayerEdit player={open} categories={editable} onClose={() => setOpen(null)} onSave={saveEdit} saving={saving}/>}</section>;
}
function PlayerCard({player,categories,canEdit,onEdit,onDelete,onShare}) { const cat=categories.find(c=>c.id===player.category_id); return <article className="player-card card"><div className="player-card-top"><Avatar player={player}/><div className="grow"><h3>{player.full_name}</h3><p>{cat ? `${genderText(cat.gender)} · ${cat.name}` : "Sin categoría"}</p></div><span className="team-badge">{player.team ? `Equipo ${player.team}` : "Sin asignar"}</span></div><div className="player-data"><span><b>DNI</b>{player.dni || "—"}</span><span><b>Edad</b>{ageOf(player.birth_date)}</span><span><b>Acceso</b>{player.access_code}</span></div><div className="player-actions"><button onClick={onShare}>📤 Compartir</button><button onClick={() => copyText(player.access_code).catch(()=>{})}>📋 Código</button>{canEdit && <><button onClick={onEdit}>✏️ Modificar</button><button className="danger" onClick={onDelete}>🗑️ Eliminar</button></>}</div></article>; }
function PlayerEdit({player,categories,onClose,onSave,saving}) { const parts=player.full_name.split(/\s+/); const [data,setData]=useState({first:player.first_name||parts.slice(1).join(" "),last:player.last_name||parts[0]||"",sex:player.sex||"female",dni:player.dni||"",birth:player.birth_date||"",team:player.team||"",category:player.category_id||categories[0]?.id||"",file:null}); const fileRef=useRef(null); return <div className="modal"><div className="modal-card"><div className="modal-head"><h2>Modificar Jugador@</h2><button type="button" onClick={onClose}>×</button></div><form onSubmit={e=>{e.preventDefault();onSave(player,data)}}><div className="two"><input value={data.first} onChange={e=>setData(d=>({...d,first:e.target.value}))}/><input value={data.last} onChange={e=>setData(d=>({...d,last:e.target.value}))}/></div><div className="two"><select value={data.sex} onChange={e=>setData(d=>({...d,sex:e.target.value}))}><option value="female">Femenino</option><option value="male">Masculino</option></select><input value={data.dni} placeholder="DNI" onChange={e=>setData(d=>({...d,dni:e.target.value}))}/></div><input type="date" value={data.birth} onChange={e=>setData(d=>({...d,birth:e.target.value}))}/><select value={data.team} onChange={e=>setData(d=>({...d,team:e.target.value}))}><option value="">Sin asignar</option>{["A","B","C","D","E"].map(x=><option key={x} value={x}>Equipo {x}</option>)}</select><select value={data.category} onChange={e=>setData(d=>({...d,category:e.target.value}))}>{categories.map(c=><option key={c.id} value={c.id}>{genderText(c.gender)} · {c.name}</option>)}</select><label className="selfie-field"><span>Selfie</span><span className="file-button" onClick={() => fileRef.current?.click()}>📷 Cambiar selfie</span><input ref={fileRef} className="hidden-file" type="file" accept="image/*" capture="user" onChange={e=>setData(d=>({...d,file:e.target.files?.[0]||null}))}/>{data.file&&<span className="file-name">✓ {data.file.name}</span>}</label><div className="form-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>Guardar</button></div></form></div></div>; }

function History({profile,categories,permissions,players,refresh}) {
  const [sessions,setSessions]=useState([]),[selected,setSelected]=useState(null),[rows,setRows]=useState([]),[filter,setFilter]=useState("all"),[msg,setMsg]=useState("");
  async function load(){ let q=supabase.from("training_sessions").select("*, categories(id,name,gender)").order("session_date",{ascending:false}); if(filter!=="all") q=q.eq("category_id",filter); const r=await q; if(r.error)setMsg(errorText(r.error)); else setSessions(r.data||[]); }
  useEffect(()=>{load()},[filter]);
  async function openSession(s){ const a=await supabase.from("attendance").select("player_id,status").eq("session_id",s.id); setRows(a.data||[]); setSelected(s); }
  async function remove(){ if(!selected || !confirm("¿Eliminar definitivamente este registro y su asistencia?")) return; await supabase.from("attendance").delete().eq("session_id",selected.id); const r=await supabase.from("training_sessions").delete().eq("id",selected.id); if(r.error)setMsg(errorText(r.error)); else { setSelected(null); await load(); await refresh(); setMsg("✓ Registro eliminado."); } }
  if(selected) return <section><div className="back-row"><button className="back-btn" onClick={()=>setSelected(null)}>← Volver al historial</button><span>{dateText(selected.session_date)}</span></div><div className="card session-detail"><div className="detail-head"><div><span className="eyebrow">{TYPES[selected.activity_type]?.[1]}</span><h2>{TYPES[selected.activity_type]?.[0]} {selected.categories?.name}</h2><p>{selected.activity_type === "match" ? `Vs. ${selected.opponent || "—"}${selected.event_location ? ` · ${selected.event_location}` : ""}` : selected.activity_type === "tournament" ? `${selected.tournament_location || selected.event_location || "—"} · ${dateText(selected.tournament_start_date || selected.session_date)} → ${dateText(selected.tournament_end_date || selected.session_date)}` : "Registro de entrenamiento"}</p></div><div className="record-actions">{can(profile, selected.categories, permissions, true) && <button className="danger" onClick={remove}>🗑️ Eliminar</button>}</div></div><div className="simple-list">{rows.map(r=>{const p=players.find(x=>x.id===r.player_id);return <div className="history-row" key={r.player_id}><Avatar player={p}/><div className="grow"><b>{p?.full_name || "Jugador@"}</b></div><StatusButtons value={r.status} disabled={!can(profile, selected.categories, permissions, true)} onChange={async status=>{const u=await supabase.from("attendance").update({status}).eq("session_id",selected.id).eq("player_id",r.player_id);if(!u.error)setRows(x=>x.map(y=>y.player_id===r.player_id?{...y,status}:y));}}/></div>})}</div></div>{msg&&<div className="message">{msg}</div>}</section>;
  return <section><PageTitle title="Historial" text="Entrá a cada sesión para ver o modificar su asistencia."/><div className="card toolbar"><label>Categoría</label><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todas</option>{categories.map(c=><option key={c.id} value={c.id}>{genderText(c.gender)} · {c.name}</option>)}</select></div><div className="session-list">{sessions.length ? sessions.map(s=><button key={s.id} className="session-card card" onClick={()=>openSession(s)}><span className="session-icon">{TYPES[s.activity_type]?.[0]}</span><div className="grow"><b>{dateText(s.session_date)} · {s.categories?.name}</b><span>{TYPES[s.activity_type]?.[1]}{s.opponent ? ` · Vs. ${s.opponent}` : ""}</span></div><span>→</span></button>) : <Empty text="No hay registros."/>}</div></section>;
}

function AdminUsers({ profile }) {
  const [admins,setAdmins]=useState([]),[name,setName]=useState(""),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[msg,setMsg]=useState(""),[saving,setSaving]=useState(false);
  async function load(){const r=await supabase.from("profiles").select("id,full_name,role").eq("role","admin").order("full_name");if(!r.error)setAdmins(r.data||[]);}
  useEffect(()=>{if(profile.role==='super_admin')load()},[profile.role]);
  if(profile.role!=="super_admin")return null;
  async function create(e){e.preventDefault();setMsg("");if(!name.trim()||!email.trim()||password.length<6){setMsg("Completá nombre, correo y una contraseña de al menos 6 caracteres.");return;}setSaving(true);try{const r=await supabase.rpc("create_admin_user",{p_email:email.trim(),p_password:password,p_full_name:name.trim()});if(r.error)throw r.error;setName("");setEmail("");setPassword("");setMsg("✓ Profe creado correctamente. Ya puede ingresar desde la pestaña Profe.");await load();}catch(e){setMsg(errorText(e));}finally{setSaving(false)}}
  return <section><PageTitle title="Profes" text="Creá y administrá las cuentas de los profes."/><div className="card admin-create-card"><div className="card-head"><div><h2>Nuevo profe</h2><span>La cuenta queda activa inmediatamente.</span></div></div><form onSubmit={create}><div className="three"><input required placeholder="Nombre y apellido" value={name} onChange={e=>setName(e.target.value)}/><input required type="email" placeholder="Correo electrónico" value={email} onChange={e=>setEmail(e.target.value)}/><input required minLength={6} type="password" placeholder="Contraseña inicial" value={password} onChange={e=>setPassword(e.target.value)}/></div><button className="primary" disabled={saving}>{saving?"Creando...":"+ Crear cuenta de profe"}</button></form>{msg&&<div className="message">{msg}</div>}</div><div className="admin-list">{admins.length?admins.map(a=><div className="card admin-row" key={a.id}><div><b>{a.full_name||"Profe"}</b><span>Cuenta de Profe</span></div><span className="team-badge">ACTIVO</span></div>):<Empty text="Todavía no hay profes creados."/>}</div></section>;
}

function Categories({profile,categories,refresh}) { const [name,setName]=useState(""),[g,setG]=useState("female"),[msg,setMsg]=useState(""); async function add(e){e.preventDefault();if(!name.trim())return;const r=await supabase.from("categories").insert({name:name.trim(),gender:g,active:true,admin_id:profile.id});if(r.error)setMsg(errorText(r.error));else{setName("");setMsg("✓ Categoría creada.");await refresh();}} if(profile.role!=="super_admin")return null; return <section><PageTitle title="Categorías" text="Creá categorías normales y variantes B."/><div className="card inline-form"><input placeholder="Ej.: Sub14 B" value={name} onChange={e=>setName(e.target.value)}/><select value={g} onChange={e=>setG(e.target.value)}><option value="female">Femenino</option><option value="male">Masculino</option></select><button className="primary" onClick={add}>+ Crear</button></div>{msg&&<div className="message">{msg}</div>}<div className="category-admin">{categories.map(c=><div className="card category-row" key={c.id}><div><b>{c.name}</b><small>{genderText(c.gender)}</small></div></div>)}</div></section>; }
function Permissions({profile,categories}) { const [admins,setAdmins]=useState([]),[selected,setSelected]=useState(""),[perms,setPerms]=useState({}); useEffect(()=>{async function load(){const a=await supabase.from("profiles").select("id,full_name").eq("role","admin").order("full_name");setAdmins(a.data||[]);if(!selected&&a.data?.[0])setSelected(a.data[0].id);const p=await supabase.from("admin_category_permissions").select("*");setPerms(Object.fromEntries((p.data||[]).map(x=>[`${x.admin_id}:${x.category_id}`,x])))}load()},[selected]); if(profile.role!=="super_admin")return null; async function setP(c,field,value){const key=`${selected}:${c.id}`,cur=perms[key]||{can_view:false,can_edit:false},next={...cur,[field]:value};if(next.can_edit)next.can_view=true;const r=!next.can_view&&!next.can_edit?await supabase.from("admin_category_permissions").delete().eq("admin_id",selected).eq("category_id",c.id):await supabase.from("admin_category_permissions").upsert({admin_id:selected,category_id:c.id,can_view:next.can_view,can_edit:next.can_edit},{onConflict:"admin_id,category_id"});if(!r.error)setPerms(p=>({...p,[key]:next}));} return <section><PageTitle title="Permisos" text="Definí qué categorías puede ver y editar cada profe."/><div className="card"><label>Profe<select value={selected} onChange={e=>setSelected(e.target.value)}>{admins.map(a=><option key={a.id} value={a.id}>{a.full_name}</option>)}</select></label></div><div className="permission-list">{categories.map(c=>{const p=perms[`${selected}:${c.id}`]||{};return <div className="card permission-row" key={c.id}><b>{genderText(c.gender)} · {c.name}</b><label><input type="checkbox" checked={!!p.can_view} onChange={e=>setP(c,"can_view",e.target.checked)}/> Ver</label><label><input type="checkbox" checked={!!p.can_edit} onChange={e=>setP(c,"can_edit",e.target.checked)}/> Editar</label></div>})}</div></section>; }

function PlayerDashboard({session,onLogout}) {
  const [player,setPlayer]=useState(null),[rows,setRows]=useState([]),[editing,setEditing]=useState(false),[msg,setMsg]=useState(""),[view,setView]=useState("profile");
  useEffect(()=>{async function load(){if(!isAuthSession(session)&&!isLegacySession(session))return;if(session?.legacy){setPlayer(session);const r=await supabase.rpc("player_attendance",{p_name:session.name,p_code:session.code});setRows(r.data||[]);return;} const p=await supabase.from("players").select("*").eq("user_id",session.user.id).maybeSingle();setPlayer(p.data); if(p.data){const r=await supabase.from("attendance").select("session_id,status,training_sessions(session_date,activity_type)").eq("player_id",p.data.id).order("session_id");setRows((r.data||[]).map(x=>({session_date:x.training_sessions?.session_date,activity_type:x.training_sessions?.activity_type,status:x.status,session_id:x.session_id})));}}load()},[session]);
  if(!player)return <main className="loading-screen"><Brand/>Cargando tu perfil...</main>;
  const counts={present:rows.filter(r=>r.status==="present").length,late:rows.filter(r=>r.status==="late").length,absent:rows.filter(r=>r.status==="absent").length};
  return <main className="player-app"><header className="topbar"><Brand compact/><button onClick={onLogout}>Salir</button></header><div className="player-wrap"><div className="player-section-nav"><button type="button" className={view==="profile"?"active":""} onClick={()=>setView("profile")}>👤 Mi perfil</button><button type="button" className={view==="schedule"?"active":""} onClick={()=>setView("schedule")}>🕐 Horarios</button></div>{view==="schedule"?<div className="player-schedule-wrap"><TrainingSchedule playerMode/></div>:<><section className="hero-profile card"><Avatar player={player}/><div className="grow"><span className="eyebrow">Mi perfil</span><h1>{player.full_name || player.name}</h1><p>{player.category_name || "Categoría pendiente"} · {player.team ? `Equipo ${player.team}` : "Sin asignar"}</p></div><button className="profile-edit-btn" onClick={()=>setEditing(true)}>✏️ Editar mis datos</button></section><div className="stats"><div className="card"><b>{counts.present}</b><span>Presentes</span></div><div className="card"><b>{counts.late}</b><span>Tardanzas</span></div><div className="card"><b>{counts.absent}</b><span>Ausencias</span></div></div><div className="card access-box"><span>Tu código personal</span><strong>{player.access_code || session.code || "—"}</strong><button onClick={()=>copyText(player.access_code||session.code).then(()=>setMsg("✓ Código copiado."))}>📋 Copiar código</button></div><div className="card"><div className="card-head"><h2>Mi asistencia</h2></div><div className="simple-list">{rows.map((r,i)=><div className="history-row" key={r.session_id||i}><div className="grow"><b>{dateText(r.session_date)}</b><span>{TYPES[r.activity_type]?.[1]}</span></div><span className={`badge ${r.status}`}>{STATUS[r.status]?.[1]}</span></div>)}</div></div>{msg&&<div className="message">{msg}</div>}</>}</div>{editing&&!session.legacy&&<PlayerSelfEdit player={player} onClose={()=>setEditing(false)} onSaved={updated=>{setPlayer(updated);setEditing(false);setMsg("✓ Perfil actualizado correctamente.")}}/>}</main>;
}
function PlayerSelfEdit({player,onClose,onSaved}) { const [data,setData]=useState({first:player.first_name||"",last:player.last_name||"",dni:player.dni||"",birth:player.birth_date||"",sex:player.sex||"female",file:null}); const [saving,setSaving]=useState(false); const fileRef=useRef(null); async function save(e){e.preventDefault();setSaving(true);try{const r=await supabase.from("players").update({first_name:data.first,last_name:data.last,full_name:`${data.last.toUpperCase()} ${data.first}`,dni:data.dni,birth_date:data.birth,sex:data.sex}).eq("id",player.id).select().single();if(r.error)throw r.error;let updated=r.data;if(data.file){const path=`${player.user_id}/${Date.now()}-${data.file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const up=await supabase.storage.from("player-selfies").upload(path,data.file,{upsert:true,contentType:data.file.type||"image/jpeg"});if(up.error)throw up.error;const ur=await supabase.from("players").update({selfie_path:path}).eq("id",player.id).select().single();if(ur.error)throw ur.error;updated=ur.data;}onSaved(updated);}catch(e){alert(errorText(e));}finally{setSaving(false)}} return <div className="modal"><div className="modal-card"><div className="modal-head"><h2>Mi perfil</h2><button type="button" onClick={onClose}>×</button></div><form onSubmit={save}><div className="two"><input value={data.first} onChange={e=>setData(d=>({...d,first:e.target.value}))}/><input value={data.last} onChange={e=>setData(d=>({...d,last:e.target.value}))}/></div><div className="two"><select value={data.sex} onChange={e=>setData(d=>({...d,sex:e.target.value}))}><option value="female">Femenino</option><option value="male">Masculino</option></select><input value={data.dni} placeholder="DNI" onChange={e=>setData(d=>({...d,dni:e.target.value}))}/></div><input type="date" value={data.birth} onChange={e=>setData(d=>({...d,birth:e.target.value}))}/><label className="selfie-field"><span>Selfie</span><span className="file-button" onClick={() => fileRef.current?.click()}>📷 {data.file?"Cambiar selfie":"Subir selfie"}</span><input ref={fileRef} className="hidden-file" type="file" accept="image/*" capture="user" onChange={e=>setData(d=>({...d,file:e.target.files?.[0]||null}))}/>{data.file&&<span className="file-name">✓ {data.file.name}</span>}</label><div className="form-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?"Guardando...":"Guardar cambios"}</button></div></form></div></div>; }

function App() {
  const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[playerSession,setPlayerSession]=useState(readStoredPlayer),[players,setPlayers]=useState([]),[categories,setCategories]=useState([]),[permissions,setPermissions]=useState({}),[tab,setTab]=useState("home");
  const authIntent = useRef(null), authEpoch = useRef(0);
  function clearIdentity() { setSession(null); setProfile(null); setPlayerSession(null); setPlayers([]); setCategories([]); setPermissions({}); }
  async function applySession(current) {
    const epoch = ++authEpoch.current;
    if (!isAuthSession(current)) { clearIdentity(); return; }
    const p = await supabase.from('profiles').select('*').eq('id',current.user.id).maybeSingle();
    if (epoch !== authEpoch.current) return;
    if (p.error || !p.data) { clearIdentity(); return; }
    if (p.data.role === 'player') { setSession(null); setProfile(null); setPlayerSession(current); return; }
    if (!['admin','super_admin'].includes(p.data.role)) { clearIdentity(); return; }
    const [c, pe, ps] = await Promise.all([
      supabase.from('categories').select('*').eq('active',true).order('gender').order('name'),
      supabase.from('admin_category_permissions').select('category_id,can_view,can_edit').eq('admin_id',current.user.id),
      supabase.from('players').select('*').eq('active',true).order('full_name')
    ]);
    if (epoch !== authEpoch.current) return;
    const map = Object.fromEntries((pe.data||[]).map(x=>[x.category_id,x]));
    setPermissions(map); setCategories((c.data||[]).filter(x=>can(p.data,x,map))); setPlayers(ps.data||[]);
    setPlayerSession(null); setProfile(p.data); setSession(current);
  }
  useEffect(()=>{
    let mounted = true;
    const accept = current => { if (mounted && !authIntent.current) void applySession(current); };
    // Preserve only a validated legacy session when no Auth session exists.
    supabase.auth.getSession().then(({data})=>{if(data.session)accept(data.session)});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,current)=>{
      if (event === 'INITIAL_SESSION' && !current) return;
      queueMicrotask(()=>accept(current));
    });
    return ()=>{mounted=false;authEpoch.current++;subscription.unsubscribe();};
  },[]);
  const refresh=()=>isAuthSession(session)?applySession(session):Promise.resolve();
  const logout=async()=>{authEpoch.current++;removeStoredPlayer(localStorage);clearIdentity();await supabase.auth.signOut({scope:'local'});};
  async function acceptAdmin(current) {
    if (!isAuthSession(current)) throw new Error('La sesión no es válida. Volvé a ingresar.');
    const p = await supabase.from('profiles').select('role').eq('id',current.user.id).maybeSingle();
    if (p.error || !['admin','super_admin'].includes(p.data?.role)) {
      clearIdentity(); await supabase.auth.signOut({scope:'local'});
      throw new Error('Esta cuenta no tiene acceso como Profe. Ingresá desde Jugador@s.');
    }
    await applySession(current);
  }
  if ((isAuthSession(playerSession)||isLegacySession(playerSession))&&!session) return <PlayerDashboard session={playerSession} onLogout={logout}/>;
  if(!isAuthSession(session)||!['admin','super_admin'].includes(profile?.role)) return <Login
    onAuthStart={mode=>{authIntent.current=mode;authEpoch.current++;}}
    onAuthEnd={()=>{authIntent.current=null;}}
    onAdmin={acceptAdmin}
    onPlayer={current=>{if(isLegacySession(current)){storeLegacyPlayer(current);setPlayerSession(current);}else if(isAuthSession(current)){setPlayerSession(current);}}}/>;
  const nav=[['home','Asistencia'],['players','Jugador@s'],['history','Historial'],['schedule','Horarios']];if(profile.role==='super_admin')nav.push(['admins','Profes'],['categories','Categorías'],['permissions','Permisos']);
  return <main className="app"><header className="topbar"><Brand compact/><div className="top-user"><span>{profile.full_name||"Profe"}</span><span className="role">{profile.role==='super_admin'?'Super Admin':'Profe'}</span><button onClick={logout}>Salir</button></div></header><nav>{nav.map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}</nav><div className="content"><div className="watermark"/><div className="content-inner">{tab==='home'&&<Attendance profile={profile} players={players} categories={categories} permissions={permissions} refresh={refresh}/>} {tab==='players'&&<Players profile={profile} players={players} categories={categories} permissions={permissions} refresh={refresh}/>} {tab==='history'&&<History profile={profile} players={players} categories={categories} permissions={permissions} refresh={refresh}/>} {tab==='schedule'&&<TrainingSchedule/>} {tab==='admins'&&<AdminUsers profile={profile}/>} {tab==='categories'&&<Categories profile={profile} categories={categories} refresh={refresh}/>} {tab==='permissions'&&<Permissions profile={profile} categories={categories}/>}</div></div><footer><img src={LOGO} alt=""/><span>{APP_NAME} · {TAGLINE}</span></footer></main>;
}
export default App;