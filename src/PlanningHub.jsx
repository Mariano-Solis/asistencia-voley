import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { compactBytes, prepareTrainingLibraryFile } from "./trainingLibrary";
import "./planning.css";

const TYPES = {
  routine:{icon:"🏋️",label:"Rutina"},
  note:{icon:"📝",label:"Nota"},
  image:{icon:"🖼️",label:"Imagen"},
  pdf:{icon:"📄",label:"PDF"},
  board:{icon:"🏐",label:"Pizarra Táctica"},
};

function categoryTitle(category){
  if(!category)return "Sin Categoría";
  const gender=String(category.gender||"").toLowerCase()==="female"?"Femenino":"Masculino";
  return `${gender} · ${category.name}`;
}
function localDate(value){
  if(!value)return "";
  try{return new Date(`${value}T12:00:00`).toLocaleDateString("es-AR")}catch{return value}
}
function safeName(name="material"){
  return String(name).replace(/[^a-zA-Z0-9._-]/g,"_").slice(-110)||"material";
}
function planningPath(categoryId,file){
  const id=globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now();
  return `${categoryId}/${id}-${safeName(file?.name)}`;
}
function defaultBoardTokens(){
  return [
    {id:"home-1",type:"home",label:"1",x:105,y:72},
    {id:"home-2",type:"home",label:"2",x:105,y:150},
    {id:"home-3",type:"home",label:"3",x:105,y:228},
    {id:"home-4",type:"home",label:"4",x:220,y:72},
    {id:"home-5",type:"home",label:"5",x:220,y:150},
    {id:"home-6",type:"home",label:"6",x:220,y:228},
    {id:"away-1",type:"away",label:"1",x:380,y:72},
    {id:"away-2",type:"away",label:"2",x:380,y:150},
    {id:"away-3",type:"away",label:"3",x:380,y:228},
    {id:"away-4",type:"away",label:"4",x:495,y:72},
    {id:"away-5",type:"away",label:"5",x:495,y:150},
    {id:"away-6",type:"away",label:"6",x:495,y:228},
    {id:"ball-1",type:"ball",label:"🏐",x:270,y:150},
  ];
}
function normalizeBoardData(value){
  if(Array.isArray(value))return {strokes:value,tokens:defaultBoardTokens()};
  return {
    strokes:Array.isArray(value?.strokes)?value.strokes:[],
    tokens:Array.isArray(value?.tokens)&&value.tokens.length?value.tokens:defaultBoardTokens(),
  };
}
function boardHasChanges(value){
  const data=normalizeBoardData(value);
  return data.strokes.length>0||data.tokens.some((token,index)=>{
    const original=defaultBoardTokens()[index];
    return !original||token.x!==original.x||token.y!==original.y;
  });
}
function BoardSvg({strokes=[],tokens=[],interactive=false,onPointerDown,onPointerMove,onPointerUp}){
  return <svg
    className={"planning-court "+(interactive?"interactive":"")}
    viewBox="0 0 600 300"
    role="img"
    aria-label="Cancha de vóley"
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerUp}
    onPointerLeave={interactive?onPointerUp:undefined}
  >
    <rect x="10" y="10" width="580" height="280" rx="16" fill="#dce9ef"/>
    <rect x="48" y="42" width="504" height="216" fill="#efb36f" stroke="#fff" strokeWidth="5"/>
    <line x1="300" y1="42" x2="300" y2="258" stroke="#fff" strokeWidth="5"/>
    <line x1="174" y1="42" x2="174" y2="258" stroke="#fff" strokeWidth="3"/>
    <line x1="426" y1="42" x2="426" y2="258" stroke="#fff" strokeWidth="3"/>
    <line x1="300" y1="26" x2="300" y2="274" stroke="#555" strokeWidth="4"/>
    {tokens.map(token=><g key={token.id} className={"planning-token planning-token-"+token.type} transform={`translate(${token.x} ${token.y})`}>
      <circle r={token.type==="ball"?17:18}/>
      <text textAnchor="middle" dominantBaseline="middle" dy={token.type==="ball"?1:0}>{token.label}</text>
    </g>)}
    {strokes.map((stroke,index)=><polyline
      key={index}
      points={(stroke.points||[]).map(p=>`${p.x},${p.y}`).join(" ")}
      fill="none"
      stroke={stroke.color||"#c3131b"}
      strokeWidth={stroke.width||5}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity=".95"
    />)}
  </svg>;
}

function TacticalBoardEditor({value,onChange,fullscreen=false,onExpand=null,fastMode=false}){
  const data=normalizeBoardData(value);
  const [color,setColor]=useState("#c3131b");
  const [tool,setTool]=useState("draw");
  const drawing=useRef(false);
  const currentStroke=useRef(-1);
  const movingTokenId=useRef(null);

  function point(event){
    const svg=event.currentTarget;
    const rect=svg.getBoundingClientRect();
    return {
      x:Math.max(48,Math.min(552,((event.clientX-rect.left)/rect.width)*600)),
      y:Math.max(42,Math.min(258,((event.clientY-rect.top)/rect.height)*300)),
    };
  }
  function tokenAt(p){
    return data.tokens.find(token=>{
      const dx=token.x-p.x,dy=token.y-p.y;
      return Math.sqrt(dx*dx+dy*dy)<=(token.type==="ball"?24:27);
    })||null;
  }
  function down(event){
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const p=point(event);
    if(tool==="move"){
      const token=tokenAt(p);
      movingTokenId.current=token?.id||null;
      return;
    }
    if(tool==="erase"){
      const token=tokenAt(p);
      if(token){
        onChange(current=>({...normalizeBoardData(current),tokens:normalizeBoardData(current).tokens.filter(item=>item.id!==token.id)}));
      }
      return;
    }
    const nextStroke={color,width:5,points:[p]};
    currentStroke.current=data.strokes.length;
    drawing.current=true;
    onChange(current=>{
      const board=normalizeBoardData(current);
      return {...board,strokes:[...board.strokes,nextStroke]};
    });
  }
  function move(event){
    const p=point(event);
    if(tool==="move"&&movingTokenId.current){
      onChange(current=>{
        const board=normalizeBoardData(current);
        return {...board,tokens:board.tokens.map(token=>token.id===movingTokenId.current?{...token,x:p.x,y:p.y}:token)};
      });
      return;
    }
    if(tool!=="draw"||!drawing.current)return;
    onChange(current=>{
      const board=normalizeBoardData(current);
      return {...board,strokes:board.strokes.map((stroke,index)=>index===currentStroke.current?{...stroke,points:[...(stroke.points||[]),p]}:stroke)};
    });
  }
  function up(){
    drawing.current=false;
    currentStroke.current=-1;
    movingTokenId.current=null;
  }
  function undo(){
    onChange(current=>{
      const board=normalizeBoardData(current);
      return {...board,strokes:board.strokes.slice(0,-1)};
    });
  }
  function clearDrawing(){
    if(!data.strokes.length)return;
    if(fastMode||window.confirm("¿Borrar Todo Lo Dibujado En La Pizarra?")){
      onChange(current=>({...normalizeBoardData(current),strokes:[]}));
    }
  }
  function resetTokens(){
    if(fastMode||window.confirm("¿Reiniciar Todas Las Fichas y La Pelota A Su Posición Inicial?")){
      onChange(current=>({...normalizeBoardData(current),tokens:defaultBoardTokens()}));
    }
  }

  return <div className={"planning-board-editor "+(fullscreen?"fullscreen":"")}>
    <div className="planning-board-tools">
      <span>Herramienta</span>
      <button type="button" className={"planning-board-action "+(tool==="draw"?"active":"")} onClick={()=>setTool("draw")}>✏️ Dibujar</button>
      <button type="button" className={"planning-board-action "+(tool==="move"?"active":"")} onClick={()=>setTool("move")}>🧩 Mover Fichas</button>
      <button type="button" className={"planning-board-action "+(tool==="erase"?"active":"")} onClick={()=>setTool("erase")}>🗑 Quitar Ficha</button>
      <span>Color</span>
      {["#c3131b","#1668c7","#111827"].map(item=><button type="button" key={item} className={color===item?"active":""} style={{background:item}} onClick={()=>{setColor(item);setTool("draw")}} aria-label={"Color "+item}/>)}
      <button type="button" className="planning-board-action" onClick={undo} disabled={!data.strokes.length}>↶ Deshacer</button>
      <button type="button" className="planning-board-action" onClick={clearDrawing} disabled={!data.strokes.length}>{fastMode?"🧹 Borrar Dibujo":"Limpiar Dibujo"}</button>
      <button type="button" className="planning-board-action" onClick={resetTokens}>Reiniciar Fichas</button>
      {!fullscreen&&onExpand&&<button type="button" className="planning-board-action planning-board-expand" onClick={onExpand}>⛶ Expandir</button>}
    </div>
    <BoardSvg
      strokes={data.strokes}
      tokens={data.tokens}
      interactive
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
    />
    <div className="planning-board-legend">
      <span><i className="home"/> Equipo Propio</span>
      <span><i className="away"/> Rival</span>
      <span><i className="ball"/> 🏐 Pelota</span>
    </div>
    <small>{tool==="move"?"Arrastrá Las Fichas y La Pelota Con El Dedo.":tool==="erase"?"Tocá Una Ficha Para Quitarla.":"Dibujá Con El Dedo O Mouse. Podés Cambiar De Color, Deshacer O Limpiar."}</small>
  </div>;
}

export { TacticalBoardEditor, defaultBoardTokens, normalizeBoardData, BoardSvg };

export default function PlanningHub({
  profile=null,
  categories=[],
  permissions={},
  player=null,
  playerCategory=null,
  legacy=false,
  simulationMode=false,
}){
  const isPlayer=!!player;
  const [selectedCategoryId,setSelectedCategoryId]=useState(()=>player?.category_id||categories?.[0]?.id||"");
  const [items,setItems]=useState([]);
  const [signedUrls,setSignedUrls]=useState({});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const [composer,setComposer]=useState("");
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");
  const [targetDate,setTargetDate]=useState("");
  const [visible,setVisible]=useState(true);
  const [file,setFile]=useState(null);
  const [boardData,setBoardData]=useState(()=>normalizeBoardData(null));
  const [boardExpanded,setBoardExpanded]=useState(false);
  const [preview,setPreview]=useState(null);
  const fileRef=useRef(null);

  const selectedCategory=useMemo(()=>{
    if(isPlayer)return playerCategory||categories.find(c=>c.id===player?.category_id)||null;
    return categories.find(c=>c.id===selectedCategoryId)||null;
  },[isPlayer,playerCategory,categories,player?.category_id,selectedCategoryId]);

  const canEditSelected=!isPlayer&&!simulationMode&&!!selectedCategory&&(
    profile?.role==="super_admin"||permissions?.[selectedCategory.id]?.can_edit===true
  );

  useEffect(()=>{
    if(isPlayer&&player?.category_id)setSelectedCategoryId(player.category_id);
    else if(!selectedCategoryId&&categories.length)setSelectedCategoryId(categories[0].id);
  },[isPlayer,player?.category_id,categories,selectedCategoryId]);

  async function load(){
    if(legacy){setLoading(false);setItems([]);return;}
    if(!selectedCategory?.id){setLoading(false);setItems([]);return;}
    setLoading(true);setMsg("");
    try{
      const result=await supabase.from("planning_items")
        .select("id,category_id,created_by,item_type,title,body,storage_path,mime_type,file_size,board_data,target_date,visible_to_players,created_at,updated_at")
        .eq("category_id",selectedCategory.id)
        .order("target_date",{ascending:true,nullsFirst:false})
        .order("created_at",{ascending:false});
      if(result.error)throw result.error;
      const rows=result.data||[];
      setItems(rows);
      const fileRows=rows.filter(item=>item.storage_path);
      const pairs=await Promise.all(fileRows.map(async item=>{
        const signed=await supabase.storage.from("planning-materials").createSignedUrl(item.storage_path,3600);
        return [item.id,signed.data?.signedUrl||""];
      }));
      setSignedUrls(Object.fromEntries(pairs));
    }catch(error){
      setItems([]);
      setMsg(error?.message||"No Se Pudo Cargar La Planificación.");
    }finally{setLoading(false);}
  }

  useEffect(()=>{void load()},[selectedCategory?.id,legacy]);

  function resetComposer(){
    setComposer("");setTitle("");setBody("");setTargetDate("");setVisible(true);setFile(null);setBoardData(normalizeBoardData(null));setBoardExpanded(false);
    if(fileRef.current)fileRef.current.value="";
  }

  async function saveTextItem(type){
    if(!canEditSelected||!selectedCategory?.id)return;
    if(!title.trim())throw new Error("Escribí Un Título.");
    if(!body.trim())throw new Error("Escribí La Actividad O Nota.");
    const user=await supabase.auth.getUser();
    const uid=user.data?.user?.id;
    if(!uid)throw new Error("No Hay Una Sesión Activa.");
    const inserted=await supabase.from("planning_items").insert({
      category_id:selectedCategory.id,
      created_by:uid,
      item_type:type,
      title:title.trim(),
      body:body.trim(),
      target_date:targetDate||null,
      visible_to_players:visible,
    });
    if(inserted.error)throw inserted.error;
  }

  async function saveBoard(){
    if(!canEditSelected||!selectedCategory?.id)return;
    if(!title.trim())throw new Error("Escribí Un Título Para La Pizarra.");
    const user=await supabase.auth.getUser();
    const uid=user.data?.user?.id;
    if(!uid)throw new Error("No Hay Una Sesión Activa.");
    const inserted=await supabase.from("planning_items").insert({
      category_id:selectedCategory.id,
      created_by:uid,
      item_type:"board",
      title:title.trim(),
      body:body.trim()||null,
      board_data:normalizeBoardData(boardData),
      target_date:targetDate||null,
      visible_to_players:visible,
    });
    if(inserted.error)throw inserted.error;
  }

  async function saveFile(type){
    if(!canEditSelected||!selectedCategory?.id)return;
    if(!file)throw new Error("Seleccioná Un Archivo.");
    if(type==="pdf"&&file.type!=="application/pdf"&&!String(file.name).toLowerCase().endsWith(".pdf"))throw new Error("Seleccioná Un Archivo PDF.");
    if(type==="image"&&!String(file.type||"").startsWith("image/"))throw new Error("Seleccioná Una Imagen.");
    const prepared=await prepareTrainingLibraryFile(file);
    if(type==="pdf"&&prepared.type!=="application/pdf")throw new Error("El Archivo Debe Ser PDF.");
    if(type==="image"&&!prepared.type.startsWith("image/"))throw new Error("El Archivo Debe Ser Una Imagen.");
    const user=await supabase.auth.getUser();
    const uid=user.data?.user?.id;
    if(!uid)throw new Error("No Hay Una Sesión Activa.");
    const path=planningPath(selectedCategory.id,prepared);
    const upload=await supabase.storage.from("planning-materials").upload(path,prepared,{
      contentType:prepared.type,
      cacheControl:"3600",
      upsert:false,
    });
    if(upload.error)throw upload.error;
    const inserted=await supabase.from("planning_items").insert({
      category_id:selectedCategory.id,
      created_by:uid,
      item_type:type,
      title:title.trim()||prepared.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," "),
      body:body.trim()||null,
      storage_path:path,
      mime_type:prepared.type,
      file_size:prepared.size,
      target_date:targetDate||null,
      visible_to_players:visible,
    });
    if(inserted.error){
      try{await supabase.storage.from("planning-materials").remove([path])}catch{}
      throw inserted.error;
    }
  }

  async function save(event){
    event.preventDefault();
    if(!composer||busy)return;
    setBusy(true);setMsg("");
    try{
      if(composer==="routine"||composer==="note")await saveTextItem(composer);
      else if(composer==="board")await saveBoard();
      else if(composer==="image"||composer==="pdf")await saveFile(composer);
      setMsg("✓ Planificación Guardada Para "+categoryTitle(selectedCategory)+".");
      resetComposer();
      await load();
    }catch(error){setMsg(error?.message||"No Se Pudo Guardar La Planificación.")}
    finally{setBusy(false);}
  }

  async function removeItem(item){
    if(!canEditSelected||busy)return;
    if(!window.confirm(`¿Eliminar “${item.title}” De La Planificación?\n\nLos Jugador@s Dejarán De Verlo Inmediatamente.`))return;
    setBusy(true);setMsg("");
    try{
      const removed=await supabase.from("planning_items").delete().eq("id",item.id).select("id").maybeSingle();
      if(removed.error)throw removed.error;
      if(!removed.data?.id)throw new Error("No Tenés Permiso Para Eliminar Este Material.");
      if(item.storage_path){
        const storageDelete=await supabase.storage.from("planning-materials").remove([item.storage_path]);
        if(storageDelete.error)console.warn(storageDelete.error);
      }
      setMsg("✓ Material Eliminado.");
      await load();
    }catch(error){setMsg(error?.message||"No Se Pudo Eliminar El Material.")}
    finally{setBusy(false);}
  }

  async function toggleVisibility(item){
    if(!canEditSelected||busy)return;
    setBusy(true);setMsg("");
    try{
      const result=await supabase.from("planning_items")
        .update({visible_to_players:!item.visible_to_players,updated_at:new Date().toISOString()})
        .eq("id",item.id);
      if(result.error)throw result.error;
      await load();
    }catch(error){setMsg(error?.message||"No Se Pudo Cambiar La Visibilidad.")}
    finally{setBusy(false);}
  }

  function openItem(item){
    if(item.item_type==="image"){
      const url=signedUrls[item.id];
      if(url)setPreview({kind:"image",item,url});
      else setMsg("Actualizá Para Volver A Generar El Acceso A La Imagen.");
      return;
    }
    if(item.item_type==="pdf"){
      const url=signedUrls[item.id];
      if(url)window.open(url,"_blank","noopener,noreferrer");
      else setMsg("Actualizá Para Volver A Generar El Acceso Al PDF.");
      return;
    }
    if(item.item_type==="board")setPreview({kind:"board",item});
  }

  if(legacy)return <section className="planning-page">
    <div className="planning-title"><div className="planning-title-icon">☑️</div><div><h1>Planificación</h1><p>Actividades y materiales de tu categoría.</p></div></div>
    <div className="planning-empty">Para Ver La Planificación Ingresá Con Tu Correo y Contraseña. El Acceso Por Código Personal No Puede Abrir Archivos Privados De La Categoría.</div>
  </section>;

  return <section className="planning-page">
    <div className="planning-title">
      <div className="planning-title-icon">☑️</div>
      <div>
        <h1>Planificación</h1>
        <p>{isPlayer?"Actividades, rutinas y materiales compartidos con tu categoría.":"Creá y compartí planes de entrenamiento, ejercicios y materiales con l@s jugador@s de cada categoría."}</p>
      </div>
    </div>

    {!isPlayer&&<div className="card planning-category-card">
      <label>Categoría
        <select value={selectedCategoryId} onChange={e=>{setSelectedCategoryId(e.target.value);resetComposer();}}>
          {categories.map(category=><option key={category.id} value={category.id}>{categoryTitle(category)}</option>)}
        </select>
      </label>
      <div><span>Planificación Activa</span><b>{categoryTitle(selectedCategory)}</b><small>{canEditSelected?"Podés Crear y Modificar Material Para Esta Categoría.":"Sólo Lectura En Esta Categoría."}</small></div>
    </div>}

    {isPlayer&&<div className="planning-player-category">
      <span>Tu Categoría</span><b>{categoryTitle(selectedCategory)}</b>
    </div>}

    {canEditSelected&&<section className="card planning-create-card">
      <div className="planning-section-head"><div><span>Crear Nuevo Material</span><h2>¿Qué Querés Compartir?</h2><p>Todo Lo Que Guardes Queda Asociado Sólo A {categoryTitle(selectedCategory)}.</p></div></div>
      <div className="planning-create-actions">
        <button type="button" className={composer==="routine"?"active":""} onClick={()=>setComposer(composer==="routine"?"":"routine")}><b>➕</b><span>Crear</span><small>Plan / Rutina</small></button>
        <button type="button" className={composer==="image"?"active":""} onClick={()=>setComposer(composer==="image"?"":"image")}><b>🖼️</b><span>Subir Imagen</span><small>Ejercicio / Pizarra</small></button>
        <button type="button" className={composer==="pdf"?"active":""} onClick={()=>setComposer(composer==="pdf"?"":"pdf")}><b>📄</b><span>Subir PDF</span><small>Documento</small></button>
        <button type="button" className={composer==="note"?"active":""} onClick={()=>setComposer(composer==="note"?"":"note")}><b>📝</b><span>Subir Nota</span><small>Texto Rápido</small></button>
      </div>

      <div className="planning-board-callout">
        <div><span>🏐</span><div><b>Pizarra Táctica</b><small>Dibujá Jugadas, Mové Fichas y Marcá Estrategias.</small></div></div>
        <div className="planning-board-callout-actions">
          <button type="button" onClick={()=>setComposer(composer==="board"?"":"board")}>{composer==="board"?"Cerrar Pizarra":"Abrir Pizarra →"}</button>
          {composer==="board"&&<button type="button" className="secondary" onClick={()=>setBoardExpanded(true)}>⛶ Expandir</button>}
        </div>
      </div>

      {composer&&<form className="planning-composer" onSubmit={save}>
        <div className="planning-composer-grid">
          <label>Título<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={140} placeholder={composer==="routine"?"Ej: Rutina De Golpe Abajo Contra La Pared":"Título Del Material"}/></label>
          <label>Fecha Objetivo (Opcional)<input type="date" value={targetDate} onChange={e=>setTargetDate(e.target.value)}/></label>
        </div>
        {(composer==="routine"||composer==="note"||composer==="board")&&<label>Indicaciones
          <textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={6000} rows={composer==="routine"?7:4} placeholder={composer==="routine"?"Ej:\n1. 3 series de 10 repeticiones.\n2. Mantener la postura baja y la plataforma firme.\n3. Descanso: 30 segundos.":"Escribí La Nota O Explicación..."}/>
        </label>}
        {(composer==="image"||composer==="pdf")&&<>
          <label className="planning-file-picker">
            <input ref={fileRef} type="file" accept={composer==="image"?"image/*":"application/pdf,.pdf"} onChange={e=>setFile(e.target.files?.[0]||null)}/>
            <span>{file?"✓ "+file.name:(composer==="image"?"🖼️ Elegir Imagen":"📄 Elegir PDF")}</span>
            <small>{composer==="image"?"La Imagen Se Optimiza Automáticamente.":"Máximo 12 MB."}</small>
          </label>
          <label>Descripción (Opcional)<textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={3000} rows={3} placeholder="Indicaciones Para L@s Jugador@s..."/></label>
        </>}
        {composer==="board"&&<TacticalBoardEditor value={boardData} onChange={setBoardData} onExpand={()=>setBoardExpanded(true)}/>}
        <label className="planning-visible-toggle"><input type="checkbox" checked={visible} onChange={e=>setVisible(e.target.checked)}/><span><b>Visible Para Jugador@s</b><small>Si Lo Desmarcás, Queda Como Borrador Sólo Para Profes.</small></span></label>
        <div className="planning-composer-actions"><button type="button" onClick={resetComposer}>Cancelar</button><button className="primary" disabled={busy}>{busy?"Guardando...":"Guardar En "+(selectedCategory?.name||"Categoría")}</button></div>
      </form>}
    </section>}

    {msg&&<div className="message planning-message">{msg}</div>}

    <section className="card planning-materials">
      <div className="planning-section-head">
        <div><span>{isPlayer?"Tu Planificación":"Materiales Compartidos"}</span><h2>{categoryTitle(selectedCategory)}</h2><p>{isPlayer?"Todo Lo Que Ves Fue Asignado A Tu Categoría.":"Rutinas, Notas, Pizarras, Imágenes y PDFs De Esta Categoría."}</p></div>
        <b>{items.length} Elemento{items.length===1?"":"s"}</b>
      </div>

      {loading?<div className="planning-empty">Cargando Planificación...</div>:items.length?<div className="planning-list">{items.map(item=>{
        const meta=TYPES[item.item_type]||{icon:"📎",label:"Material"};
        const url=signedUrls[item.id];
        return <article className={"planning-item "+(!item.visible_to_players?"draft":"")} key={item.id}>
          {item.item_type==="image"&&url?<button type="button" className="planning-item-image" onClick={()=>openItem(item)}><img src={url} alt=""/></button>:<div className="planning-item-icon">{meta.icon}</div>}
          <div className="planning-item-main">
            <div className="planning-item-title-row"><div><span>{meta.label}{item.target_date?" · "+localDate(item.target_date):""}</span><h3>{item.title}</h3></div>{!isPlayer&&<em className={item.visible_to_players?"published":"draft"}>{item.visible_to_players?"👁 Visible Para Jugador@s":"🔒 Borrador"}</em>}</div>
            {item.body&&<p className={item.item_type==="routine"?"planning-routine-text":""}>{item.body}</p>}
            {item.item_type==="board"&&<button type="button" className="planning-board-preview-button" onClick={()=>openItem(item)}><BoardSvg strokes={item.board_data?.strokes||[]} tokens={item.board_data?.tokens||[]}/><span>Abrir Pizarra</span></button>}
            {item.item_type==="pdf"&&<button type="button" className="planning-open-file" onClick={()=>openItem(item)}>📄 Abrir PDF {item.file_size?"· "+compactBytes(item.file_size):""}</button>}
            {item.item_type==="image"&&url&&<button type="button" className="planning-open-file" onClick={()=>openItem(item)}>🖼️ Ver Imagen {item.file_size?"· "+compactBytes(item.file_size):""}</button>}
          </div>
          {canEditSelected&&<div className="planning-item-actions">
            <button type="button" onClick={()=>void toggleVisibility(item)} title={item.visible_to_players?"Ocultar A Jugador@s":"Publicar Para Jugador@s"}>{item.visible_to_players?"🙈":"👁"}</button>
            <button type="button" className="danger" onClick={()=>void removeItem(item)} title="Eliminar">🗑️</button>
          </div>}
        </article>;
      })}</div>:<div className="planning-empty">{isPlayer?"Todavía No Hay Actividades Publicadas Para Tu Categoría.":"Todavía No Hay Material En Esta Categoría. Creá El Primero."}</div>}
    </section>

    {boardExpanded&&createPortal(<div className="planning-board-fullscreen-backdrop" role="dialog" aria-modal="true" aria-label="Pizarra Táctica En Pantalla Completa">
      <section className="planning-board-fullscreen-card">
        <header className="planning-board-fullscreen-header">
          <div><span>Pizarra Táctica</span><h2>{title.trim()||"Jugada En Vivo"}</h2><small>{categoryTitle(selectedCategory)}</small></div>
          <button type="button" onClick={()=>setBoardExpanded(false)} aria-label="Cerrar Pantalla Completa">×</button>
        </header>
        <div className="planning-board-fullscreen-body">
          <TacticalBoardEditor value={boardData} onChange={setBoardData} fullscreen/>
        </div>
        <footer className="planning-board-fullscreen-footer">
          <span>Los Cambios Se Mantienen Al Volver A Planificación.</span>
          <button type="button" onClick={()=>setBoardExpanded(false)}>✓ Volver A Planificación</button>
        </footer>
      </section>
    </div>,document.body)}

    {preview&&createPortal(<div className="planning-preview-backdrop" role="dialog" aria-modal="true" onClick={()=>setPreview(null)}>
      <div className="planning-preview-card" onClick={e=>e.stopPropagation()}>
        <header><div><span>{TYPES[preview.item.item_type]?.label}</span><h2>{preview.item.title}</h2></div><button type="button" onClick={()=>setPreview(null)}>×</button></header>
        {preview.kind==="image"&&<img src={preview.url} alt={preview.item.title}/>}
        {preview.kind==="board"&&<BoardSvg strokes={preview.item.board_data?.strokes||[]} tokens={preview.item.board_data?.tokens||[]}/>}
        {preview.item.body&&<p>{preview.item.body}</p>}
      </div>
    </div>,document.body)}
  </section>;
}
