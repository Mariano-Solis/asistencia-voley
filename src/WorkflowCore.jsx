import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

const dateText=v=>v?new Date(`${v}T12:00:00`).toLocaleDateString("es-AR"):"—";
const typeText={training:"Entrenamiento",match:"Partido",tournament:"Torneo"};
const statusText={present:"Presente",late:"Tarde",absent:"Ausente"};

function useHost(title,attr,hideSelector){
  const [host,setHost]=useState(null);
  useEffect(()=>{const sync=()=>{const section=Array.from(document.querySelectorAll("section")).find(s=>s.querySelector(".page-title h1")?.textContent?.trim()===title);if(!section)return setHost(null);if(hideSelector)section.querySelectorAll(hideSelector).forEach(el=>el.style.display="none");let node=section.querySelector(`[${attr}]`);if(!node){node=document.createElement("div");node.setAttribute(attr,"true");section.appendChild(node)}setHost(node)};sync();const o=new MutationObserver(sync);o.observe(document.body,{childList:true,subtree:true});return()=>o.disconnect()},[title,attr,hideSelector]);
  return host;
}

function AttendancePrompt(){
  useEffect(()=>{
    const sync=()=>{
      const section=Array.from(document.querySelectorAll("section")).find(s=>s.querySelector(".page-title h1")?.textContent?.trim()==="Asistencia");
      if(!section)return;
      const filterCard=section.querySelector(".filter-card");
      const original=filterCard?.querySelector("select");
      const attendanceCard=section.querySelector(".attendance-card");
      if(!filterCard||!original)return;

      original.style.display="none";
      let proxy=filterCard.querySelector("select[data-attendance-category-proxy]");
      if(!proxy){
        proxy=document.createElement("select");
        proxy.setAttribute("data-attendance-category-proxy","true");
        proxy.innerHTML='<option value="">- Seleccione Categoría -</option>';
        Array.from(original.options).forEach(opt=>{if(opt.value){const clone=opt.cloneNode(true);proxy.appendChild(clone)}});
        original.insertAdjacentElement("afterend",proxy);
        proxy.value="";
        proxy.addEventListener("change",()=>{
          original.value=proxy.value;
          original.dispatchEvent(new Event("change",{bubbles:true}));
          if(attendanceCard) attendanceCard.style.display=proxy.value?"":"none";
        });
      }
      if(!proxy.dataset.ready){proxy.dataset.ready="true";proxy.value="";if(attendanceCard)attendanceCard.style.display="none";}
    };
    sync();const o=new MutationObserver(sync);o.observe(document.body,{childList:true,subtree:true});return()=>o.disconnect();
  },[]);
  return null;
}

function RosterShare(){
  const host=useHost("Jugador@s","data-roster-share-v2");const [categoryId,setCategoryId]=useState(""),[label,setLabel]=useState(""),[msg,setMsg]=useState("");
  useEffect(()=>{if(!host)return;const section=host.closest("section");const select=Array.from(section.querySelectorAll("select")).find(s=>Array.from(s.options).some(o=>o.value==="all"));const sync=()=>{if(!select||!select.value||select.value==="all"){setCategoryId("");setLabel("");return}setCategoryId(select.value);setLabel(select.options[select.selectedIndex]?.textContent?.trim()||"Categoría")};sync();select?.addEventListener("change",sync);return()=>select?.removeEventListener("change",sync)},[host]);
  async function share(){const r=await supabase.from("players").select("full_name,team").eq("active",true).eq("category_id",categoryId).order("full_name");if(r.error)return setMsg(r.error.message);const text=["Municipalidad de San Martín - VOLEY","#VamosElPoli","",`Plantilla · ${label}`,"",...(r.data||[]).map((p,i)=>`${i+1}. ${p.full_name}${p.team?` · Equipo ${p.team}`:""}`),"",`Total: ${(r.data||[]).length} Jugador@s`].join("\n");try{if(navigator.share)await navigator.share({title:`Plantilla · ${label}`,text});else{await navigator.clipboard.writeText(text);setMsg("✓ Plantilla copiada al portapapeles.")}}catch(_){}}
  if(!host)return null;return createPortal(<div className="workflow-share-bar"><button className="primary" disabled={!categoryId} onClick={share}>📤 Compartir plantilla del equipo</button>{!categoryId&&<span>Filtrá primero una categoría.</span>}{msg&&<span className="workflow-ok">{msg}</span>}</div>,host)
}

function HistoryTool(){
  const host=useHost("Historial","data-history-tool-v2",".toolbar");
  const [categories,setCategories]=useState([]),[branch,setBranch]=useState(""),[players,setPlayers]=useState([]),[category,setCategory]=useState(""),[player,setPlayer]=useState(""),[from,setFrom]=useState("2026-01-01"),[to,setTo]=useState(new Date().toLocaleDateString("en-CA",{timeZone:"America/Argentina/Mendoza"})),[rows,setRows]=useState([]),[detail,setDetail]=useState([]),[loading,setLoading]=useState(false);
  const branchCategories=useMemo(()=>categories.filter(c=>c.gender===branch),[categories,branch]);
  useEffect(()=>{if(host)supabase.from("categories").select("id,name,gender").eq("active",true).order("name").then(({data})=>setCategories(data||[]))},[host]);
  useEffect(()=>{setCategory("");setPlayer("");setPlayers([]);setRows([]);setDetail([])},[branch]);
  useEffect(()=>{setPlayer("");setRows([]);setDetail([]);if(!category)return setPlayers([]);supabase.from("players").select("id,full_name").eq("active",true).eq("category_id",category).order("full_name").then(({data})=>setPlayers(data||[]));const section=host?.closest("section");const oldSelect=Array.from(section?.querySelectorAll("select")||[]).find(s=>Array.from(s.options).some(o=>o.value==="all"));if(oldSelect){oldSelect.value=category||"all";oldSelect.dispatchEvent(new Event("change",{bubbles:true}))}},[category,host]);
  async function build(){if(!category)return;setLoading(true);try{const s=await supabase.from("training_sessions").select("id,session_date,activity_type").eq("category_id",category).gte("session_date",from).lte("session_date",to).order("session_date");if(s.error)throw s.error;const ids=(s.data||[]).map(x=>x.id),people=player?players.filter(p=>p.id===player):players;if(!ids.length){setRows(people.map(p=>({...p,present:0,late:0,absent:0,total:0})));setDetail([]);return}let q=supabase.from("attendance").select("player_id,session_id,status").in("session_id",ids);if(player)q=q.eq("player_id",player);const a=await q;if(a.error)throw a.error;const map=Object.fromEntries((s.data||[]).map(x=>[x.id,x]));setRows(people.map(p=>{const mine=(a.data||[]).filter(x=>x.player_id===p.id);return{...p,present:mine.filter(x=>x.status==="present").length,late:mine.filter(x=>x.status==="late").length,absent:mine.filter(x=>x.status==="absent").length,total:mine.length}}));setDetail(player?(a.data||[]).map(x=>({...x,...map[x.session_id]})).sort((x,y)=>String(x.session_date).localeCompare(String(y.session_date))):[])}finally{setLoading(false)}}
  if(!host)return null;return createPortal(<div className="card workflow-card"><div className="workflow-head"><div><h2>Tabla de asistencias</h2><p>Elegí primero la rama y después la categoría. Luego podés consultar todo el equipo o un Jugador@ específico.</p></div></div><div className="workflow-grid"><label>Rama<select value={branch} onChange={e=>setBranch(e.target.value)}><option value="">- Seleccione Rama -</option><option value="female">Femenino</option><option value="male">Masculino</option></select></label><label>Categoría<select value={category} onChange={e=>setCategory(e.target.value)} disabled={!branch}><option value="">- Seleccione Categoría -</option>{branchCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Jugador@<select value={player} onChange={e=>setPlayer(e.target.value)} disabled={!category}><option value="">Todos los Jugador@s</option>{players.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label><label>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div><button className="primary" disabled={!category||loading} onClick={build}>{loading?"Generando...":"📊 Generar tabla"}</button>{!!rows.length&&<div className="workflow-table-wrap"><table className="workflow-table"><thead><tr><th>Jugador@</th><th>Presente</th><th>Tarde</th><th>Ausente</th><th>Total</th><th>% Presencia</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.full_name}</td><td>{r.present}</td><td>{r.late}</td><td>{r.absent}</td><td>{r.total}</td><td>{r.total?Math.round(r.present/r.total*100):0}%</td></tr>)}</tbody></table></div>}{!!detail.length&&<div className="workflow-table-wrap"><table className="workflow-table compact"><thead><tr><th>Fecha</th><th>Actividad</th><th>Estado</th></tr></thead><tbody>{detail.map((r,i)=><tr key={`${r.session_id}-${i}`}><td>{dateText(r.session_date)}</td><td>{typeText[r.activity_type]||r.activity_type}</td><td>{statusText[r.status]||r.status}</td></tr>)}</tbody></table></div>}</div>,host)
}

function CategoryExplorer(){
  const host=useHost("Categorías","data-category-explorer-v2",".category-admin");const [categories,setCategories]=useState([]),[branch,setBranch]=useState(""),[category,setCategory]=useState(""),[players,setPlayers]=useState([]),[professors,setProfessors]=useState([]);const branchCategories=useMemo(()=>categories.filter(c=>c.gender===branch),[categories,branch]);
  useEffect(()=>{if(host)supabase.from("categories").select("id,name,gender,admin_id").eq("active",true).order("name").then(({data})=>setCategories(data||[]))},[host]);
  useEffect(()=>{setCategory("");setPlayers([]);setProfessors([])},[branch]);
  useEffect(()=>{(async()=>{if(!category)return;const c=categories.find(x=>x.id===category);const [pl,pe,pr]=await Promise.all([supabase.from("players").select("id,full_name,team").eq("active",true).eq("category_id",category).order("full_name"),supabase.from("admin_category_permissions").select("admin_id,can_view,can_edit").eq("category_id",category),supabase.from("profiles").select("id,full_name").eq("role","admin")]);setPlayers(pl.data||[]);const ids=new Set((pe.data||[]).filter(x=>x.can_view||x.can_edit).map(x=>x.admin_id));if(c?.admin_id)ids.add(c.admin_id);setProfessors((pr.data||[]).filter(x=>ids.has(x.id)))})()},[category,categories]);
  if(!host)return null;return createPortal(<div className="card workflow-card"><div className="workflow-head"><div><h2>Explorar categoría</h2><p>Elegí Rama y Categoría para ver Jugador@s y Profes a cargo.</p></div></div><div className="workflow-grid two-col"><label>Rama<select value={branch} onChange={e=>setBranch(e.target.value)}><option value="">- Seleccione Rama -</option><option value="female">Femenino</option><option value="male">Masculino</option></select></label><label>Categoría<select value={category} onChange={e=>setCategory(e.target.value)} disabled={!branch}><option value="">- Seleccione Categoría -</option>{branchCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>{category&&<div className="workflow-split"><div><h3>Jugador@s ({players.length})</h3><div className="workflow-list">{players.map(p=><div key={p.id}><b>{p.full_name}</b><span>{p.team?`Equipo ${p.team}`:"Sin asignar"}</span></div>)}</div></div><div><h3>Profes a cargo ({professors.length})</h3><div className="workflow-list">{professors.length?professors.map(p=><div key={p.id}><b>{p.full_name}</b><span>Profe</span></div>):<div className="empty">Sin Profes asignados.</div>}</div></div></div>}</div>,host)
}

export default function WorkflowCore(){return <><AttendancePrompt/><RosterShare/><HistoryTool/><CategoryExplorer/></>}
