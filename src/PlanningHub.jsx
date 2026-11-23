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
import { TacticalBoardEditor, defaultBoardTokens, normalizeBoardData, BoardSvg } from "./TacticalBoardCore";
export { TacticalBoardEditor, defaultBoardTokens, normalizeBoardData, BoardSvg } from "./TacticalBoardCore";

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
  const [targetCategoryIds,setTargetCategoryIds]=useState(()=>[player?.category_id||categories?.[0]?.id||""].filter(Boolean));
  const [file,setFile]=useState(null);
  const [imageFiles,setImageFiles]=useState([]);
  const [imageUrls,setImageUrls]=useState({});
  const [boardData,setBoardData]=useState(()=>normalizeBoardData(null));
  const [boardExpanded,setBoardExpanded]=useState(false);
  const [preview,setPreview]=useState(null);
  const [previewIndex,setPreviewIndex]=useState(0);
  const previewGalleryRef=useRef(null);
  const fileRef=useRef(null);

  const selectedCategory=useMemo(()=>{
    if(isPlayer)return playerCategory||categories.find(c=>c.id===player?.category_id)||null;
    return categories.find(c=>c.id===selectedCategoryId)||null;
  },[isPlayer,playerCategory,categories,player?.category_id,selectedCategoryId]);

  const canEditSelected=!isPlayer&&!simulationMode&&!!selectedCategory&&(
    profile?.role==="super_admin"||permissions?.[selectedCategory.id]?.can_edit===true
  );
  const editableCategories=useMemo(()=>isPlayer?[]:categories.filter(category=>
    profile?.role==="super_admin"||permissions?.[category.id]?.can_edit===true
  ),[isPlayer,categories,profile?.role,permissions]);
  const targetCategories=useMemo(()=>editableCategories.filter(category=>targetCategoryIds.includes(category.id)),[editableCategories,targetCategoryIds]);

  useEffect(()=>{
    if(isPlayer&&player?.category_id)setSelectedCategoryId(player.category_id);
    else if(!selectedCategoryId&&categories.length)setSelectedCategoryId(categories[0].id);
  },[isPlayer,player?.category_id,categories,selectedCategoryId]);

  async function load(){
    if(legacy){setLoading(false);setItems([]);setImageUrls({});return;}
    if(!selectedCategory?.id){setLoading(false);setItems([]);setImageUrls({});return;}
    setLoading(true);setMsg("");
    try{
      let query=supabase.from("planning_items")
        .select("id,category_id,created_by,item_type,title,body,storage_path,mime_type,file_size,board_data,target_date,visible_to_players,created_at,updated_at")
        .eq("category_id",selectedCategory.id);
      if(isPlayer)query=query.eq("visible_to_players",true);
      const result=await query
        .order("target_date",{ascending:true,nullsFirst:false})
        .order("created_at",{ascending:false});
      if(result.error)throw result.error;
      const rows=result.data||[];
      setItems(rows);

      const legacyFileRows=rows.filter(item=>item.storage_path&&item.item_type!=="image");
      const legacyPairs=await Promise.all(legacyFileRows.map(async item=>{
        const signed=await supabase.storage.from("planning-materials").createSignedUrl(item.storage_path,3600);
        return [item.id,signed.data?.signedUrl||""];
      }));
      setSignedUrls(Object.fromEntries(legacyPairs));

      const imageItems=rows.filter(item=>item.item_type==="image");
      if(!imageItems.length){
        setImageUrls({});
      }else{
        const childResult=await supabase.from("planning_item_files")
          .select("id,planning_item_id,storage_path,mime_type,file_size,position")
          .in("planning_item_id",imageItems.map(item=>item.id))
          .order("position",{ascending:true});
        if(childResult.error)throw childResult.error;

        const childrenByItem={};
        for(const child of childResult.data||[]){
          if(!childrenByItem[child.planning_item_id])childrenByItem[child.planning_item_id]=[];
          childrenByItem[child.planning_item_id].push(child);
        }

        const galleries={};
        await Promise.all(imageItems.map(async item=>{
          let files=childrenByItem[item.id]||[];
          if(!files.length&&item.storage_path){
            files=[{
              id:"legacy-"+item.id,
              planning_item_id:item.id,
              storage_path:item.storage_path,
              mime_type:item.mime_type,
              file_size:item.file_size,
              position:0,
            }];
          }
          const signedFiles=await Promise.all(files.map(async attachment=>{
            const signed=await supabase.storage.from("planning-materials").createSignedUrl(attachment.storage_path,3600);
            return {...attachment,url:signed.data?.signedUrl||""};
          }));
          galleries[item.id]=signedFiles.filter(attachment=>attachment.url);
        }));
        setImageUrls(galleries);
      }
    }catch(error){
      setItems([]);
      setSignedUrls({});
      setImageUrls({});
      setMsg(error?.message||"No Se Pudo Cargar La Planificación.");
    }finally{setLoading(false);}
  }
  useEffect(()=>{void load()},[selectedCategory?.id,legacy]);

  function resetComposer(primaryCategoryId=null){
    const primary=typeof primaryCategoryId==="string"?primaryCategoryId:selectedCategoryId;
    setComposer("");setTitle("");setBody("");setTargetDate("");setVisible(true);setTargetCategoryIds(primary?[primary]:[]);setFile(null);setImageFiles([]);setBoardData(normalizeBoardData(null));setBoardExpanded(false);
    if(fileRef.current)fileRef.current.value="";
  }

  function toggleTargetCategory(categoryId){
    setTargetCategoryIds(current=>current.includes(categoryId)?current.filter(id=>id!==categoryId):[...current,categoryId]);
  }
  function selectAllTargetCategories(){
    setTargetCategoryIds(editableCategories.map(category=>category.id));
  }
  function targetCategorySummary(){
    if(!targetCategories.length)return "Ninguna Categoría";
    if(targetCategories.length===1)return categoryTitle(targetCategories[0]);
    return targetCategories.length+" Categorías";
  }

  function removeSelectedImage(index){
    setImageFiles(current=>current.filter((_,itemIndex)=>itemIndex!==index));
  }

  async function saveTextItem(type){
    if(!canEditSelected)return;
    if(!targetCategories.length)throw new Error("Elegí Al Menos Una Categoría.");
    if(!title.trim())throw new Error("Escribí Un Título.");
    if(!body.trim())throw new Error("Escribí La Actividad O Nota.");
    const user=await supabase.auth.getUser();
    const uid=user.data?.user?.id;
    if(!uid)throw new Error("No Hay Una Sesión Activa.");
    const rows=targetCategories.map(category=>({
      category_id:category.id,
      created_by:uid,
      item_type:type,
      title:title.trim(),
      body:body.trim(),
      target_date:targetDate||null,
      visible_to_players:visible,
    }));
    const inserted=await supabase.from("planning_items").insert(rows);
    if(inserted.error)throw inserted.error;
  }

  async function saveBoard(){
    if(!canEditSelected)return;
    if(!targetCategories.length)throw new Error("Elegí Al Menos Una Categoría.");
    if(!title.trim())throw new Error("Escribí Un Título Para La Pizarra.");
    const user=await supabase.auth.getUser();
    const uid=user.data?.user?.id;
    if(!uid)throw new Error("No Hay Una Sesión Activa.");
    const normalized=normalizeBoardData(boardData);
    const rows=targetCategories.map(category=>({
      category_id:category.id,
      created_by:uid,
      item_type:"board",
      title:title.trim(),
      body:body.trim()||null,
      board_data:JSON.parse(JSON.stringify(normalized)),
      target_date:targetDate||null,
      visible_to_players:visible,
    }));
    const inserted=await supabase.from("planning_items").insert(rows);
    if(inserted.error)throw inserted.error;
  }

  async function saveFile(type){
    if(!canEditSelected)return;
    if(!targetCategories.length)throw new Error("Elegí Al Menos Una Categoría.");
    const selected=type==="image"?imageFiles:(file?[file]:[]);
    if(!selected.length)throw new Error(type==="image"?"Seleccioná Una O Más Imágenes.":"Seleccioná Un Archivo.");
    if(type==="image"&&selected.length>20)throw new Error("Podés Subir Hasta 20 Imágenes En Un Mismo Material.");
    if(type==="pdf"&&(selected[0].type!=="application/pdf"&&!String(selected[0].name).toLowerCase().endsWith(".pdf")))throw new Error("Seleccioná Un Archivo PDF.");
    if(type==="image"&&selected.some(item=>!String(item.type||"").startsWith("image/")))throw new Error("Todos Los Archivos Deben Ser Imágenes.");

    const preparedFiles=[];
    for(const selectedFile of selected){
      const prepared=await prepareTrainingLibraryFile(selectedFile);
      if(type==="pdf"&&prepared.type!=="application/pdf")throw new Error("El Archivo Debe Ser PDF.");
      if(type==="image"&&!prepared.type.startsWith("image/"))throw new Error("Todos Los Archivos Deben Ser Imágenes.");
      preparedFiles.push(prepared);
    }

    const user=await supabase.auth.getUser();
    const uid=user.data?.user?.id;
    if(!uid)throw new Error("No Hay Una Sesión Activa.");

    const uploadedPaths=[];
    const insertedItemIds=[];
    try{
      for(const category of targetCategories){
        const uploaded=[];
        for(const prepared of preparedFiles){
          const path=planningPath(category.id,prepared);
          const upload=await supabase.storage.from("planning-materials").upload(path,prepared,{
            contentType:prepared.type,
            cacheControl:"3600",
            upsert:false,
          });
          if(upload.error)throw upload.error;
          uploaded.push({path,prepared});
          uploadedPaths.push(path);
        }

        const first=uploaded[0];
        const inserted=await supabase.from("planning_items").insert({
          category_id:category.id,
          created_by:uid,
          item_type:type,
          title:title.trim()||first.prepared.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," "),
          body:body.trim()||null,
          storage_path:first.path,
          mime_type:first.prepared.type,
          file_size:type==="image"?uploaded.reduce((sum,item)=>sum+Number(item.prepared.size||0),0):first.prepared.size,
          target_date:targetDate||null,
          visible_to_players:visible,
        }).select("id").single();
        if(inserted.error)throw inserted.error;
        const insertedItemId=inserted.data?.id;
        insertedItemIds.push(insertedItemId);

        if(type==="image"&&insertedItemId){
          const attachments=uploaded.map((item,index)=>({
            planning_item_id:insertedItemId,
            storage_path:item.path,
            mime_type:item.prepared.type,
            file_size:item.prepared.size,
            position:index,
          }));
          const childInsert=await supabase.from("planning_item_files").insert(attachments);
          if(childInsert.error)throw childInsert.error;
        }
      }
    }catch(error){
      if(insertedItemIds.length){
        try{await supabase.from("planning_items").delete().in("id",insertedItemIds)}catch{}
      }
      if(uploadedPaths.length){
        try{await supabase.storage.from("planning-materials").remove(uploadedPaths)}catch{}
      }
      throw error;
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
      const savedSummary=targetCategories.length===1?categoryTitle(targetCategories[0]):targetCategories.length+" Categorías";
      setMsg("✓ Planificación Guardada Para "+savedSummary+".");
      resetComposer(selectedCategoryId);
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
      const attachmentPaths=(imageUrls[item.id]||[]).map(attachment=>attachment.storage_path).filter(Boolean);
      if(item.storage_path)attachmentPaths.push(item.storage_path);
      const uniquePaths=[...new Set(attachmentPaths)];
      if(uniquePaths.length){
        const storageDelete=await supabase.storage.from("planning-materials").remove(uniquePaths);
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

  function showPreviewImage(index){
    const images=preview?.images||[];
    if(!images.length)return;
    const next=Math.max(0,Math.min(images.length-1,index));
    setPreviewIndex(next);
    const el=previewGalleryRef.current;
    if(el)el.scrollTo({left:el.clientWidth*next,behavior:"smooth"});
  }
  function onPreviewGalleryScroll(event){
    const el=event.currentTarget;
    if(!el.clientWidth)return;
    const next=Math.round(el.scrollLeft/el.clientWidth);
    if(next!==previewIndex)setPreviewIndex(next);
  }

  function openItem(item){
    if(item.item_type==="image"){
      const gallery=imageUrls[item.id]||[];
      if(gallery.length){setPreviewIndex(0);setPreview({kind:"image",item,images:gallery});}
      else setMsg("Actualizá Para Volver A Generar El Acceso A Las Imágenes.");
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
        <select value={selectedCategoryId} onChange={e=>{const next=e.target.value;setSelectedCategoryId(next);resetComposer(next);}}>
          {categories.map(category=><option key={category.id} value={category.id}>{categoryTitle(category)}</option>)}
        </select>
      </label>
      <div><span>Planificación Activa</span><b>{categoryTitle(selectedCategory)}</b><small>{canEditSelected?"Podés Crear y Modificar Material Para Esta Categoría.":"Sólo Lectura En Esta Categoría."}</small></div>
    </div>}

    {isPlayer&&<div className="planning-player-category">
      <span>Tu Categoría</span><b>{categoryTitle(selectedCategory)}</b>
    </div>}

    {canEditSelected&&<section className="card planning-create-card">
      <div className="planning-section-head"><div><span>Crear Nuevo Material</span><h2>¿Qué Querés Compartir?</h2><p>Elegí Una O Varias Categorías Para Compartir El Mismo Material En Una Sola Carga.</p></div></div>
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
        <div className="planning-target-categories">
          <div className="planning-target-categories-head">
            <div><span>Compartir Con</span><b>{targetCategorySummary()}</b></div>
            <div><button type="button" onClick={selectAllTargetCategories}>Todas</button><button type="button" onClick={()=>setTargetCategoryIds(selectedCategoryId?[selectedCategoryId]:[])}>Sólo Activa</button></div>
          </div>
          <div className="planning-target-category-grid">
            {editableCategories.map(category=><label key={category.id} className={targetCategoryIds.includes(category.id)?"active":""}>
              <input type="checkbox" checked={targetCategoryIds.includes(category.id)} onChange={()=>toggleTargetCategory(category.id)}/>
              <span><b>{category.name}</b><small>{String(category.gender||"").toLowerCase()==="female"?"Femenino":"Masculino"}</small></span>
            </label>)}
          </div>
          {!targetCategoryIds.length&&<small className="planning-target-warning">Elegí Al Menos Una Categoría Para Poder Guardar.</small>}
        </div>
        {(composer==="routine"||composer==="note"||composer==="board")&&<label>Indicaciones
          <textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={6000} rows={composer==="routine"?7:4} placeholder={composer==="routine"?"Ej:\n1. 3 series de 10 repeticiones.\n2. Mantener la postura baja y la plataforma firme.\n3. Descanso: 30 segundos.":"Escribí La Nota O Explicación..."}/>
        </label>}
        {(composer==="image"||composer==="pdf")&&<>
          <label className="planning-file-picker">
            <input
              ref={fileRef}
              type="file"
              accept={composer==="image"?"image/*":"application/pdf,.pdf"}
              multiple={composer==="image"}
              onChange={e=>{
                if(composer==="image")setImageFiles(Array.from(e.target.files||[]));
                else setFile(e.target.files?.[0]||null);
              }}
            />
            <span>{composer==="image"
              ?(imageFiles.length?("✓ "+imageFiles.length+" Imagen"+(imageFiles.length===1?"":"es")+" Seleccionada"+(imageFiles.length===1?"":"s")):"🖼️ Elegir Una O Varias Imágenes")
              :(file?"✓ "+file.name:"📄 Elegir PDF")}</span>
            <small>{composer==="image"?"Podés Elegir Varias A La Vez. Se Optimizan Automáticamente. Máximo 20.":"Máximo 12 MB."}</small>
          </label>
          {composer==="image"&&imageFiles.length>0&&<div className="planning-selected-images">
            {imageFiles.map((selectedFile,index)=><div key={selectedFile.name+"-"+selectedFile.lastModified+"-"+index}>
              <span>🖼️</span><b>{selectedFile.name}</b><small>{compactBytes(selectedFile.size)}</small>
              <button type="button" onClick={()=>removeSelectedImage(index)} aria-label={"Quitar "+selectedFile.name}>×</button>
            </div>)}
          </div>}
          <label>Descripción (Opcional)<textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={3000} rows={3} placeholder="Indicaciones Para L@s Jugador@s..."/></label>
        </>}
        {composer==="board"&&<TacticalBoardEditor value={boardData} onChange={setBoardData} onExpand={()=>setBoardExpanded(true)}/>}
        <label className="planning-visible-toggle"><input type="checkbox" checked={visible} onChange={e=>setVisible(e.target.checked)}/><span><b>Visible Para Jugador@s</b><small>Si Lo Desmarcás, Queda Como Borrador Sólo Para Profes.</small></span></label>
        <div className="planning-composer-actions"><button type="button" onClick={resetComposer}>Cancelar</button><button className="primary" disabled={busy||!targetCategories.length}>{busy?"Guardando...":targetCategories.length>1?"Guardar En "+targetCategories.length+" Categorías":"Guardar En "+(targetCategories[0]?.name||"Categoría")}</button></div>
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
        const gallery=imageUrls[item.id]||[];
        const cover=gallery[0]?.url||"";
        const gallerySize=gallery.reduce((sum,attachment)=>sum+Number(attachment.file_size||0),0);
        return <article className={"planning-item "+(!item.visible_to_players?"draft":"")} key={item.id}>
          {item.item_type==="image"&&cover?<button type="button" className="planning-item-image planning-item-image-gallery" onClick={()=>openItem(item)}><img src={cover} alt=""/>{gallery.length>1&&<span>{gallery.length}</span>}</button>:<div className="planning-item-icon">{meta.icon}</div>}
          <div className="planning-item-main">
            <div className="planning-item-title-row"><div><span>{meta.label}{item.target_date?" · "+localDate(item.target_date):""}</span><h3>{item.title}</h3></div>{!isPlayer&&<em className={item.visible_to_players?"published":"draft"}>{item.visible_to_players?"👁 Visible Para Jugador@s":"🔒 Borrador"}</em>}</div>
            {item.body&&<p className={item.item_type==="routine"?"planning-routine-text":""}>{item.body}</p>}
            {item.item_type==="board"&&<button type="button" className="planning-board-preview-button" onClick={()=>openItem(item)}><BoardSvg strokes={item.board_data?.strokes||[]} tokens={item.board_data?.tokens||[]}/><span>Abrir Pizarra</span></button>}
            {item.item_type==="pdf"&&<button type="button" className="planning-open-file" onClick={()=>openItem(item)}>📄 Abrir PDF {item.file_size?"· "+compactBytes(item.file_size):""}</button>}
            {item.item_type==="image"&&gallery.length>0&&<button type="button" className="planning-open-file" onClick={()=>openItem(item)}>🖼️ Ver {gallery.length>1?gallery.length+" Imágenes":"Imagen"} {(gallerySize||item.file_size)?"· "+compactBytes(gallerySize||item.file_size):""}</button>}
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
        {preview.kind==="image"&&<div className="planning-preview-carousel-wrap">
          <div className="planning-preview-carousel" ref={previewGalleryRef} onScroll={onPreviewGalleryScroll}>
            {(preview.images||[]).map((attachment,index)=><figure key={attachment.id||attachment.storage_path||index}>
              <img src={attachment.url} alt={preview.item.title+" · Imagen "+(index+1)}/>
            </figure>)}
          </div>
          {(preview.images||[]).length>1&&<>
            <button type="button" className="planning-preview-nav previous" onClick={()=>showPreviewImage(previewIndex-1)} disabled={previewIndex<=0} aria-label="Imagen Anterior">‹</button>
            <button type="button" className="planning-preview-nav next" onClick={()=>showPreviewImage(previewIndex+1)} disabled={previewIndex>=(preview.images||[]).length-1} aria-label="Imagen Siguiente">›</button>
            <div className="planning-preview-counter">{previewIndex+1} / {(preview.images||[]).length}</div>
            <div className="planning-preview-dots" aria-hidden="true">{(preview.images||[]).map((_,index)=><i key={index} className={index===previewIndex?"active":""}/>)}</div>
          </>}
        </div>}
        {preview.kind==="board"&&<BoardSvg strokes={preview.item.board_data?.strokes||[]} tokens={preview.item.board_data?.tokens||[]}/>}
        {preview.item.body&&<p>{preview.item.body}</p>}
      </div>
    </div>,document.body)}
  </section>;
}
