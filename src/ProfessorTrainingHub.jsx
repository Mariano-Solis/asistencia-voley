import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import {
  compactBytes,
  isLibraryImage,
  materialIcon,
  prepareTrainingLibraryFile,
  trainingLibraryPath,
} from "./trainingLibrary";

const TRAINING_URL = "https://voleiboles.lovable.app/";
const ACCEPTED_FILES = "image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

function safeExternalUrl(value){
  try{
    const url=new URL(String(value||"").trim());
    if(!["http:","https:"].includes(url.protocol))return null;
    return url.toString();
  }catch{
    return null;
  }
}

export default function ProfessorTrainingHub({ profile, simulationMode = false }) {
  const [items,setItems]=useState([]);
  const [signedUrls,setSignedUrls]=useState({});
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [mode,setMode]=useState("file");
  const [title,setTitle]=useState("");
  const [link,setLink]=useState("");
  const [file,setFile]=useState(null);
  const [visibility,setVisibility]=useState("private");
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const [preview,setPreview]=useState(null);
  const fileRef=useRef(null);

  async function load(){
    setLoading(true);
    const r=await supabase
      .from("training_library_items")
      .select("id,owner_id,title,item_type,storage_path,external_url,mime_type,file_size,visibility,created_at")
      .order("created_at",{ascending:false});
    if(r.error){
      setMsg(r.error.message||"No Se Pudo Cargar La Biblioteca.");
      setItems([]);
      setLoading(false);
      return;
    }

    const raw=r.data||[];
    const next=simulationMode ? raw.filter(item=>item.owner_id===profile?.id||item.visibility==="shared") : raw;
    setItems(next);
    const fileItems=next.filter(item=>item.item_type==="file"&&item.storage_path);
    const pairs=await Promise.all(fileItems.map(async item=>{
      const result=await supabase.storage.from("training-library").createSignedUrl(item.storage_path,3600);
      return [item.id,result.data?.signedUrl||""];
    }));
    setSignedUrls(Object.fromEntries(pairs));
    setLoading(false);
  }

  useEffect(()=>{void load();},[profile?.id,simulationMode]);

  useEffect(()=>{
    if(!preview)return;
    const onKey=e=>{if(e.key==="Escape")setPreview(null);};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[preview]);

  const canManageAll=profile?.role==="super_admin";
  const countLabel=useMemo(()=>String(items.length)+" Material"+(items.length===1?"":"es"),[items.length]);

  function resetForm(){
    setTitle("");
    setLink("");
    setFile(null);
    setVisibility("private");
    if(fileRef.current)fileRef.current.value="";
  }

  async function addMaterial(event){
    event.preventDefault();
    if(!profile?.id)return;
    setBusy(true);
    setMsg("");
    try{
      if(mode==="link"){
        const cleanUrl=safeExternalUrl(link);
        if(!cleanUrl)throw new Error("Ingresá Un Link Válido Que Comience Con http:// O https://.");
        const fallbackTitle=new URL(cleanUrl).hostname.replace(/^www\./,"");
        const r=await supabase.from("training_library_items").insert({
          owner_id:profile.id,
          title:title.trim()||fallbackTitle,
          item_type:"link",
          external_url:cleanUrl,
          visibility,
        });
        if(r.error)throw r.error;
      }else{
        if(!file)throw new Error("Seleccioná Un Archivo.");
        const prepared=await prepareTrainingLibraryFile(file);
        const path=trainingLibraryPath(profile.id,prepared);
        const upload=await supabase.storage.from("training-library").upload(path,prepared,{
          cacheControl:"3600",
          contentType:prepared.type,
          upsert:false,
        });
        if(upload.error)throw upload.error;

        const r=await supabase.from("training_library_items").insert({
          owner_id:profile.id,
          title:title.trim()||prepared.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," "),
          item_type:"file",
          storage_path:path,
          mime_type:prepared.type,
          file_size:prepared.size,
          visibility,
        });
        if(r.error){
          try{await supabase.storage.from("training-library").remove([path]);}catch{}
          throw r.error;
        }
      }

      resetForm();
      setShowAdd(false);
      setMsg("✓ Material Agregado A La Biblioteca.");
      await load();
    }catch(error){
      setMsg(error?.message||"No Se Pudo Agregar El Material.");
    }finally{
      setBusy(false);
    }
  }

  async function removeMaterial(item){
    if(!window.confirm("¿Eliminar “"+item.title+"” De La Biblioteca?"))return;
    setBusy(true);
    setMsg("");
    try{
      const del=await supabase.from("training_library_items").delete().eq("id",item.id);
      if(del.error)throw del.error;
      if(item.item_type==="file"&&item.storage_path){
        const storageDelete=await supabase.storage.from("training-library").remove([item.storage_path]);
        if(storageDelete.error)console.warn("No Se Pudo Limpiar El Archivo De Storage.",storageDelete.error);
      }
      setMsg("✓ Material Eliminado.");
      await load();
    }catch(error){
      setMsg(error?.message||"No Se Pudo Eliminar El Material.");
    }finally{
      setBusy(false);
    }
  }

  function openMaterial(item){
    if(item.item_type==="link"){
      window.open(item.external_url,"_blank","noopener,noreferrer");
      return;
    }
    const url=signedUrls[item.id];
    if(!url){setMsg("No Se Pudo Abrir El Archivo. Actualizá La Biblioteca.");return;}
    if(isLibraryImage(item)){setPreview({...item,url});return;}
    window.open(url,"_blank","noopener,noreferrer");
  }

  return (
    <section className="training-hub-section">
      <div className="page-title">
        <div>
          <h1>Entrenamiento</h1>
          <p>Material De Consulta y Apoyo Para Profes.</p>
        </div>
      </div>

      <div className="card training-resource-card">
        <div className="training-resource-icon">🏐</div>
        <div className="grow">
          <span className="eyebrow">Biblioteca Externa</span>
          <h2>+1000 Dinámicas De Voleibol</h2>
          <p>Acceso Directo Al Material De Entrenamiento, Ejercicios, Dinámicas, Planificación y Recursos Para La Cancha.</p>
        </div>
        <a className="training-resource-link" href={TRAINING_URL} target="_blank" rel="noreferrer">Abrir Material ↗</a>
      </div>

      <section className="card training-library">
        <div className="training-library-head">
          <div>
            <h2>Biblioteca Del Profe</h2>
            <p>Imágenes, PDFs, Planificaciones, Archivos y Links.</p>
          </div>
          <span>{countLabel}</span>
        </div>

        {!simulationMode&&<button
          type="button"
          className="training-library-add-toggle"
          aria-expanded={showAdd}
          onClick={()=>setShowAdd(value=>!value)}
        >
          <span><b>+ Agregar Material</b><small>{showAdd?"Ocultar Carga":"Subir Archivo O Guardar Link"}</small></span>
          <strong>{showAdd?"⌃":"⌄"}</strong>
        </button>}

        {simulationMode&&<div className="training-library-simulation-note">Vista Profe · La Carga De Material Está Bloqueada En La Simulación.</div>}

        {!simulationMode&&showAdd&&<form className="training-library-form" onSubmit={addMaterial}>
          <div className="training-library-mode">
            <button type="button" className={mode==="file"?"active":""} onClick={()=>setMode("file")}>📎 Archivo</button>
            <button type="button" className={mode==="link"?"active":""} onClick={()=>setMode("link")}>🔗 Link</button>
          </div>

          <input
            value={title}
            onChange={e=>setTitle(e.target.value)}
            placeholder="Título (Opcional)"
            maxLength={120}
          />

          {mode==="file"?<label className="training-library-file-picker">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_FILES}
              onChange={e=>setFile(e.target.files?.[0]||null)}
            />
            <span>{file?"✓ "+file.name:"📁 Elegir Archivo"}</span>
            <small>Las Imágenes Se Optimizan Automáticamente Antes De Subirse.</small>
          </label>:<input
            type="url"
            value={link}
            onChange={e=>setLink(e.target.value)}
            placeholder="https://..."
            required
          />}

          <div className="training-library-visibility">
            <span className="training-library-visibility-title">¿Quién Puede Verlo?</span>
            <div>
              <button type="button" className={visibility==="private"?"active":""} onClick={()=>setVisibility("private")}>
                <b>🔒 Privado</b>
                
              </button>
              <button type="button" className={visibility==="shared"?"active":""} onClick={()=>setVisibility("shared")}>
                <b>👥 Compartido</b>
                <small>Todos Los Profes</small>
              </button>
            </div>
          </div>

          <div className="training-library-form-actions">
            <button type="button" onClick={()=>{resetForm();setShowAdd(false)}}>Cancelar</button>
            <button className="primary" disabled={busy}>{busy?"Guardando...":"Guardar Material"}</button>
          </div>
        </form>}

        {msg&&<div className="message training-library-message">{msg}</div>}

        {loading?<div className="training-library-empty">Cargando Biblioteca...</div>:
          items.length?<div className="training-library-grid">
            {items.map(item=>{
              const url=signedUrls[item.id];
              const canDelete=canManageAll||item.owner_id===profile?.id;
              return <article className="training-material-card" key={item.id}>
                <button type="button" className="training-material-open" onClick={()=>openMaterial(item)}>
                  <span className="training-material-preview">
                    {isLibraryImage(item)&&url
                      ?<img src={url} alt="" loading="lazy"/>
                      :<span>{materialIcon(item)}</span>}
                  </span>
                  <span className="training-material-copy">
                    <b>{item.title}</b>
                    <small>{item.item_type==="link"?"Link":compactBytes(item.file_size)}</small>
                    <em className={"training-material-visibility "+(item.visibility==="shared"?"shared":"private")}>
                      {item.visibility==="shared"?"👥 Compartido":"🔒 Privado"}
                    </em>
                  </span>
                  <strong>›</strong>
                </button>
                {canDelete&&<button type="button" className="training-material-delete" disabled={busy} onClick={()=>removeMaterial(item)} aria-label={"Eliminar "+item.title}>×</button>}
              </article>;
            })}
          </div>:<div className="training-library-empty">Todavía No Hay Materiales. Agregá El Primero.</div>}
      </section>

      {preview&&createPortal(<div className="training-image-preview" onClick={()=>setPreview(null)} role="dialog" aria-modal="true" aria-label={preview.title}>
        <div className="training-image-preview-card" onClick={event=>event.stopPropagation()}>
          <button type="button" onClick={()=>setPreview(null)} aria-label="Cerrar">×</button>
          <img src={preview.url} alt={preview.title}/>
          <span>{preview.title}</span>
        </div>
      </div>,document.body)}
    </section>
  );
}
