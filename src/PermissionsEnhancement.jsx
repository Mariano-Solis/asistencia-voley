import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

const BRANCHES=[{value:"female",label:"Femenino"},{value:"male",label:"Masculino"}];

export default function PermissionsEnhancement(){
  const [host,setHost]=useState(null),[admins,setAdmins]=useState([]),[categories,setCategories]=useState([]),[prof,setProf]=useState(""),[branch,setBranch]=useState(""),[cat,setCat]=useState(""),[perm,setPerm]=useState({can_view:false,can_edit:false}),[msg,setMsg]=useState("");

  useEffect(()=>{
    const sync=()=>{
      const section=Array.from(document.querySelectorAll("section")).find(s=>s.querySelector(".page-title h1")?.textContent?.trim()==="Permisos");
      if(!section)return setHost(null);
      const list=section.querySelector(".permission-list");
      if(list){list.style.display="none";const card=list.previousElementSibling;if(card?.classList.contains("card"))card.style.display="none";}
      let node=section.querySelector("[data-permissions-v2]");
      if(!node){node=document.createElement("div");node.setAttribute("data-permissions-v2","true");section.appendChild(node)}
      setHost(node);
    };
    sync();const o=new MutationObserver(sync);o.observe(document.body,{childList:true,subtree:true});return()=>o.disconnect();
  },[]);

  useEffect(()=>{if(!host)return;Promise.all([
    supabase.from("profiles").select("id,full_name").eq("role","admin").order("full_name"),
    supabase.from("categories").select("id,name,gender").eq("active",true).order("name")
  ]).then(([a,c])=>{setAdmins(a.data||[]);setCategories(c.data||[])})},[host]);

  useEffect(()=>{setBranch("");setCat("");setPerm({can_view:false,can_edit:false});setMsg("")},[prof]);
  useEffect(()=>{setCat("");setPerm({can_view:false,can_edit:false});setMsg("")},[branch]);
  useEffect(()=>{(async()=>{if(!prof||!cat)return;const r=await supabase.from("admin_category_permissions").select("can_view,can_edit").eq("admin_id",prof).eq("category_id",cat).maybeSingle();setPerm(r.data||{can_view:false,can_edit:false})})()},[prof,cat]);

  async function save(next){
    if(!prof||!cat)return;
    if(next.can_edit)next.can_view=true;
    const r=!next.can_view&&!next.can_edit
      ? await supabase.from("admin_category_permissions").delete().eq("admin_id",prof).eq("category_id",cat)
      : await supabase.from("admin_category_permissions").upsert({admin_id:prof,category_id:cat,...next},{onConflict:"admin_id,category_id"});
    if(r.error)return setMsg(r.error.message);
    setPerm(next);setMsg("✓ Permiso actualizado.");
  }

  if(!host)return null;
  return createPortal(<div className="card workflow-card">
    <div className="workflow-head"><div><h2>Asignar permisos</h2><p>Elegí Profe, Rama y Categoría. No se selecciona nada automáticamente.</p></div></div>
    <div className="workflow-grid three-col">
      <label>Profe<select value={prof} onChange={e=>setProf(e.target.value)}><option value="">- Seleccione Profe -</option>{admins.map(a=><option key={a.id} value={a.id}>{a.full_name}</option>)}</select></label>
      <label>Rama<select value={branch} onChange={e=>setBranch(e.target.value)} disabled={!prof}><option value="">- Seleccione Rama -</option>{BRANCHES.map(b=><option key={b.value} value={b.value}>{b.label}</option>)}</select></label>
      <label>Categoría<select value={cat} onChange={e=>setCat(e.target.value)} disabled={!branch}><option value="">- Seleccione Categoría -</option>{categories.filter(c=>c.gender===branch).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    </div>
    {cat&&<div className="permission-choice"><label><input type="checkbox" checked={perm.can_view} onChange={e=>save({...perm,can_view:e.target.checked,can_edit:e.target.checked?perm.can_edit:false})}/> Ver</label><label><input type="checkbox" checked={perm.can_edit} onChange={e=>save({...perm,can_edit:e.target.checked})}/> Editar</label></div>}
    {msg&&<div className="message">{msg}</div>}
  </div>,host)
}
