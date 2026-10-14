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
const BOARD_SLOT_COORDS={
  home:{
    1:{x:115,y:228},2:{x:255,y:228},3:{x:255,y:150},
    4:{x:255,y:72},5:{x:115,y:72},6:{x:115,y:150},
  },
  away:{
    1:{x:485,y:72},2:{x:345,y:72},3:{x:345,y:150},
    4:{x:345,y:228},5:{x:485,y:228},6:{x:485,y:150},
  },
};
const ROTATION_NEXT={1:6,6:5,5:4,4:3,3:2,2:1};
const PORTRAIT_VIEW_WIDTH=360;
const PORTRAIT_X_SCALE=1.28;

function applySlotPosition(token){
  if(!["home","away"].includes(token?.type))return token;
  const slot=Number(token.slot||token.label);
  const p=BOARD_SLOT_COORDS[token.type]?.[slot];
  return p?{...token,slot,x:p.x,y:p.y}:token;
}
function defaultBoardTokens(){
  const home=[1,2,3,4,5,6].map(slot=>applySlotPosition({id:`home-${slot}`,type:"home",label:String(slot),slot}));
  const away=[1,2,3,4,5,6].map(slot=>applySlotPosition({id:`away-${slot}`,type:"away",label:String(slot),slot}));
  return [...home,...away,{id:"ball-1",type:"ball",label:"🏐",x:300,y:150}];
}
const DEFAULT_BOARD_SETTINGS={
  view:"full",
  showHome:true,
  showAway:true,
  showBall:true,
  rotateTarget:"both",
};
function normalizeBoardSettings(value){
  const raw=value&&typeof value==="object"?value:{};
  return {
    view:["full","home","away"].includes(raw.view)?raw.view:"full",
    showHome:raw.showHome!==false,
    showAway:raw.showAway!==false,
    showBall:raw.showBall!==false,
    rotateTarget:["both","home","away"].includes(raw.rotateTarget)?raw.rotateTarget:"both",
  };
}
function normalizeBoardData(value){
  if(Array.isArray(value))return {strokes:value,tokens:defaultBoardTokens(),settings:{...DEFAULT_BOARD_SETTINGS}};
  const rawTokens=Array.isArray(value?.tokens)&&value.tokens.length?value.tokens:null;
  const tokens=rawTokens
    ? rawTokens.map(token=>{
        if(!["home","away"].includes(token?.type))return token;
        if(Number.isFinite(Number(token.slot)))return {...token,slot:Number(token.slot)};
        return applySlotPosition({...token,slot:Number(token.label)});
      })
    : defaultBoardTokens();
  return {
    strokes:Array.isArray(value?.strokes)?value.strokes:[],
    tokens,
    settings:normalizeBoardSettings(value?.settings),
  };
}
function boardHasChanges(value){
  const data=normalizeBoardData(value);
  const settingsChanged=Object.entries(DEFAULT_BOARD_SETTINGS).some(([key,val])=>data.settings?.[key]!==val);
  return settingsChanged||data.strokes.length>0||data.tokens.some((token,index)=>{
    const original=defaultBoardTokens()[index];
    return !original||token.x!==original.x||token.y!==original.y;
  });
}
function BoardSvg({strokes=[],tokens=[],interactive=false,onPointerDown,onPointerMove,onPointerUp,portrait=false,viewMode="full"}){
  const halfCourt=viewMode==="home"||viewMode==="away";
  const usePortrait=portrait&&!halfCourt;
  const mapPoint=point=>usePortrait
    ? {x:(PORTRAIT_VIEW_WIDTH/2)+(150-point.y)*PORTRAIT_X_SCALE,y:point.x}
    : point;
  const mapLine=(a,b)=>{
    const p1=mapPoint(a),p2=mapPoint(b);
    return {x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y};
  };
  const viewBox=halfCourt
    ? (viewMode==="home"?"0 0 330 300":"270 0 330 300")
    : (usePortrait?`0 0 ${PORTRAIT_VIEW_WIDTH} 600`:"0 0 600 300");
  const courtTopLeft=mapPoint({x:24,y:18});
  const courtBottomRight=mapPoint({x:576,y:282});
  const courtX=usePortrait?Math.min(courtTopLeft.x,courtBottomRight.x):24;
  const courtY=usePortrait?24:18;
  const courtWidth=usePortrait?Math.abs(courtBottomRight.x-courtTopLeft.x):552;
  const courtHeight=usePortrait?552:264;
  const bgRect=usePortrait?{x:3,y:6,width:354,height:588}:{x:6,y:6,width:588,height:288};

  return <svg
    className={"planning-court "+(interactive?"interactive ":"")+(usePortrait?"portrait ":"")+(halfCourt?"half-court ":"")+("view-"+viewMode)}
    viewBox={viewBox}
    preserveAspectRatio={halfCourt?"none":"xMidYMid meet"}
    role="img"
    aria-label={viewMode==="home"?"Media Cancha Propia":viewMode==="away"?"Media Cancha Rival":"Cancha de vóley"}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerUp}
    onPointerLeave={interactive?onPointerUp:undefined}
  >
    <rect {...bgRect} rx="16" fill="#dce9ef"/>
    <rect x={courtX} y={courtY} width={courtWidth} height={courtHeight} fill="#efb36f" stroke="#fff" strokeWidth="5"/>
    <line {...mapLine({x:300,y:18},{x:300,y:282})} stroke="#fff" strokeWidth="5"/>
    <line {...mapLine({x:208,y:18},{x:208,y:282})} stroke="#fff" strokeWidth="3"/>
    <line {...mapLine({x:392,y:18},{x:392,y:282})} stroke="#fff" strokeWidth="3"/>
    <line {...mapLine({x:300,y:6},{x:300,y:294})} stroke="#555" strokeWidth="4"/>
    {tokens.map(token=>{
      const p=mapPoint(token);
      return <g key={token.id} className={"planning-token planning-token-"+token.type} transform={`translate(${p.x} ${p.y})`}>
        <circle r={token.type==="ball"?17:18}/>
        <text textAnchor="middle" dominantBaseline="middle" dy={token.type==="ball"?1:0}>{token.label}</text>
      </g>;
    })}
    {strokes.map((stroke,index)=><polyline
      key={index}
      points={(stroke.points||[]).map(point=>mapPoint(point)).map(p=>`${p.x},${p.y}`).join(" ")}
      fill="none"
      stroke={stroke.color||"#c3131b"}
      strokeWidth={stroke.width||5}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={stroke.opacity??.95}
    />)}
  </svg>;
}

function TacticalBoardEditor({value,onChange,fullscreen=false,onExpand=null,fastMode=false,matchMode=false,portraitMode=false,onSaveBoard=null,onOpenSavedBoards=null,canLoadSavedBoards=false}){
  const data=normalizeBoardData(value);
  const [color,setColor]=useState("#c3131b");
  const [tool,setTool]=useState("move");
  const drawing=useRef(false);
  const currentStroke=useRef(-1);
  const movingTokenId=useRef(null);
  const [rotationHistory,setRotationHistory]=useState([]);
  const settings=data.settings||DEFAULT_BOARD_SETTINGS;
  const visibleTokens=data.tokens.filter(token=>
    token.type==="home"?settings.showHome:
    token.type==="away"?settings.showAway:
    token.type==="ball"?settings.showBall:true
  );
  const halfCourt=settings.view==="home"||settings.view==="away";
  const effectivePortrait=portraitMode&&!halfCourt;

  function updateSettings(patch){
    onChange(current=>{
      const board=normalizeBoardData(current);
      return {...board,settings:{...board.settings,...patch}};
    });
  }

  function point(event){
    const svg=event.currentTarget;
    let rawX,rawY;
    try{
      const pt=svg.createSVGPoint();
      pt.x=event.clientX;
      pt.y=event.clientY;
      const matrix=svg.getScreenCTM();
      const mapped=matrix?pt.matrixTransform(matrix.inverse()):null;
      rawX=mapped?.x;
      rawY=mapped?.y;
    }catch{}
    if(!Number.isFinite(rawX)||!Number.isFinite(rawY)){
      const rect=svg.getBoundingClientRect();
      rawX=((event.clientX-rect.left)/rect.width)*(settings.view==="full"?(effectivePortrait?PORTRAIT_VIEW_WIDTH:600):330)+(settings.view==="away"?270:0);
      rawY=((event.clientY-rect.top)/rect.height)*(effectivePortrait?600:300);
    }
    if(settings.view==="home"||settings.view==="away"){
      const minX=settings.view==="home"?0:270;
      return {
        x:Math.max(minX,Math.min(minX+330,rawX)),
        y:Math.max(0,Math.min(300,rawY)),
      };
    }
    if(effectivePortrait){
      return {
        x:Math.max(24,Math.min(576,rawY)),
        y:Math.max(18,Math.min(282,150-(rawX-(PORTRAIT_VIEW_WIDTH/2))/PORTRAIT_X_SCALE)),
      };
    }
    return {
      x:Math.max(30,Math.min(570,rawX)),
      y:Math.max(24,Math.min(276,rawY)),
    };
  }
  function tokenAt(p){
    return visibleTokens.find(token=>{
      const dx=token.x-p.x,dy=token.y-p.y;
      return Math.sqrt(dx*dx+dy*dy)<=(token.type==="ball"?31:34);
    })||null;
  }
  function distanceToSegment(p,a,b){
    const vx=b.x-a.x,vy=b.y-a.y,wx=p.x-a.x,wy=p.y-a.y;
    const len=vx*vx+vy*vy;
    const t=len?Math.max(0,Math.min(1,(wx*vx+wy*vy)/len)):0;
    const dx=p.x-(a.x+t*vx),dy=p.y-(a.y+t*vy);
    return Math.sqrt(dx*dx+dy*dy);
  }
  function eraseStrokeAt(p){
    let best=-1,bestDistance=Infinity;
    data.strokes.forEach((stroke,index)=>{
      const pts=stroke.points||[];
      for(let i=1;i<pts.length;i++){
        const d=distanceToSegment(p,pts[i-1],pts[i]);
        if(d<bestDistance){bestDistance=d;best=index}
      }
    });
    if(best>=0&&bestDistance<=24){
      onChange(current=>{
        const board=normalizeBoardData(current);
        return {...board,strokes:board.strokes.filter((_,index)=>index!==best)};
      });
    }
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
    if(tool==="eraseDraw"){
      eraseStrokeAt(p);
      return;
    }
    const isMarker=tool==="marker";
    const nextStroke={color,width:isMarker?28:5,opacity:isMarker?0.28:0.95,points:[p]};
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
    if(!["draw","marker"].includes(tool)||!drawing.current)return;
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
  function rotate(){
    const snapshot=data.tokens.map(token=>({...token}));
    setRotationHistory(history=>[...history,snapshot].slice(-12));
    const target=settings.rotateTarget||"both";
    onChange(current=>{
      const board=normalizeBoardData(current);
      return {...board,tokens:board.tokens.map(token=>{
        if(!["home","away"].includes(token.type))return token;
        if(target!=="both"&&token.type!==target)return token;
        const slot=Number(token.slot||token.label);
        return applySlotPosition({...token,slot:ROTATION_NEXT[slot]||slot});
      })};
    });
  }
  function rotateBack(){
    const previous=rotationHistory[rotationHistory.length-1];
    if(!previous)return;
    onChange(current=>({...normalizeBoardData(current),tokens:previous.map(token=>({...token}))}));
    setRotationHistory(history=>history.slice(0,-1));
  }
  function resetTokens(){
    if(fastMode||window.confirm("¿Reiniciar Todas Las Fichas y La Pelota A Su Posición Inicial?")){
      onChange(current=>({...normalizeBoardData(current),tokens:defaultBoardTokens()}));
      setRotationHistory([]);
    }
  }

  return <div className={"planning-board-editor "+(fullscreen?"fullscreen ":"")+(matchMode?"match-mode":"")}>
    <div className="planning-board-tools">
      {!matchMode&&<span>Herramienta</span>}
      <button type="button" className={"planning-board-action "+(tool==="move"?"active":"")} onClick={()=>setTool("move")} title="Mover Fichas y Pelota">🖐️ <b>{matchMode?"Mover":"Mover Fichas"}</b></button>
      <button type="button" className={"planning-board-action "+(tool==="draw"?"active":"")} onClick={()=>setTool("draw")} title="Dibujar">✏️ <b>Dibujar</b></button>
      <button type="button" className={"planning-board-action "+(tool==="marker"?"active":"")} onClick={()=>setTool("marker")} title="Sombrear">🖍️ <b>Sombra</b></button>
      <button type="button" className={"planning-board-action "+(tool==="eraseDraw"?"active":"")} onClick={()=>setTool("eraseDraw")} title="Borrar Un Trazo">⌫ <b>Borrador</b></button>
      <button type="button" className={"planning-board-action "+(tool==="erase"?"active":"")} onClick={()=>setTool("erase")} title="Quitar Una Ficha">🗑️ <b>Ficha</b></button>
      {!matchMode&&<span>Color</span>}
      <div className="planning-board-colors" aria-label="Colores">
        {["#c3131b","#1668c7","#111827","#ffffff","#f3b52b"].map(item=><button type="button" key={item} className={color===item?"active":""} style={{background:item}} onClick={()=>{setColor(item);if(!["draw","marker"].includes(tool))setTool("draw")}} aria-label={"Color "+item}/>)}
      </div>
      <button type="button" className="planning-board-action planning-board-utility" onClick={undo} disabled={!data.strokes.length} title="Deshacer Último Trazo">↶ <b>Deshacer</b></button>
      <button type="button" className="planning-board-action planning-board-utility" onClick={clearDrawing} disabled={!data.strokes.length} title="Borrar Todo El Dibujo">🧹 <b>{matchMode?"Limpiar":"Borrar Dibujo"}</b></button>
      <button type="button" className="planning-board-action planning-board-utility" onClick={resetTokens} title="Reiniciar Fichas">↺ <b>Fichas</b></button>
      {matchMode&&<button type="button" className="planning-board-action planning-board-rotation" onClick={rotate} title="Rotar Una Posición Reglamentaria">🔄 <b>Rotar</b></button>}
      {matchMode&&<button type="button" className="planning-board-action planning-board-rotation" onClick={rotateBack} disabled={!rotationHistory.length} title="Volver A La Rotación Anterior">⏪ <b>Atrás</b></button>}
      {matchMode&&onSaveBoard&&<button type="button" className="planning-board-action planning-board-save" onClick={onSaveBoard} title="Guardar Esta Pizarra">💾 <b>Guardar</b></button>}
      {matchMode&&onOpenSavedBoards&&<button type="button" className="planning-board-action planning-board-save" onClick={onOpenSavedBoards} disabled={!canLoadSavedBoards} title="Abrir Pizarras Guardadas">📂 <b>Cargar</b></button>}
      {!fullscreen&&onExpand&&<button type="button" className="planning-board-action planning-board-expand" onClick={onExpand}>⛶ Expandir</button>}
    </div>
    {matchMode&&<div className="planning-board-config" aria-label="Configuración De Pizarra">
      <div className="planning-board-config-group">
        <span>Vista</span>
        <button type="button" className={settings.view==="full"?"active":""} onClick={()=>updateSettings({view:"full"})}>Completa</button>
        <button type="button" className={settings.view==="home"?"active":""} onClick={()=>updateSettings({view:"home"})}>Mi Lado</button>
        <button type="button" className={settings.view==="away"?"active":""} onClick={()=>updateSettings({view:"away"})}>Rival</button>
      </div>
      <div className="planning-board-config-group">
        <span>Fichas</span>
        <button type="button" className={settings.showHome?"active home":""} onClick={()=>updateSettings({showHome:!settings.showHome})}>🔴 Propio</button>
        <button type="button" className={settings.showAway?"active away":""} onClick={()=>updateSettings({showAway:!settings.showAway})}>🔵 Rival</button>
        <button type="button" className={settings.showBall?"active ball":""} onClick={()=>updateSettings({showBall:!settings.showBall})}>🏐 Pelota</button>
      </div>
      <div className="planning-board-config-group">
        <span>Rotar</span>
        <button type="button" className={settings.rotateTarget==="both"?"active":""} onClick={()=>updateSettings({rotateTarget:"both"})}>Ambos</button>
        <button type="button" className={settings.rotateTarget==="home"?"active":""} onClick={()=>updateSettings({rotateTarget:"home"})}>Propio</button>
        <button type="button" className={settings.rotateTarget==="away"?"active":""} onClick={()=>updateSettings({rotateTarget:"away"})}>Rival</button>
      </div>
    </div>}
    <div className="planning-board-court-stage">
      <BoardSvg
        strokes={data.strokes}
        tokens={visibleTokens}
        interactive
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        portrait={effectivePortrait}
        viewMode={settings.view}
      />
    </div>
    {!matchMode&&<div className="planning-board-legend">
      <span><i className="home"/> Equipo Propio</span>
      <span><i className="away"/> Rival</span>
      <span><i className="ball"/> 🏐 Pelota</span>
    </div>}
    {!matchMode&&<small>{tool==="move"?"Arrastrá Las Fichas y La Pelota Con El Dedo.":tool==="erase"?"Tocá Una Ficha Para Quitarla.":tool==="eraseDraw"?"Tocá Un Trazo Para Borrarlo.":tool==="marker"?"Marcá Zonas Con Una Sombra Semitransparente.":"Dibujá Con El Dedo O Mouse. Podés Cambiar De Color, Deshacer O Limpiar."}</small>}
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
  const [imageFiles,setImageFiles]=useState([]);
  const [imageUrls,setImageUrls]=useState({});
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
    if(legacy){setLoading(false);setItems([]);setImageUrls({});return;}
    if(!selectedCategory?.id){setLoading(false);setItems([]);setImageUrls({});return;}
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

  function resetComposer(){
    setComposer("");setTitle("");setBody("");setTargetDate("");setVisible(true);setFile(null);setImageFiles([]);setBoardData(normalizeBoardData(null));setBoardExpanded(false);
    if(fileRef.current)fileRef.current.value="";
  }

  function removeSelectedImage(index){
    setImageFiles(current=>current.filter((_,itemIndex)=>itemIndex!==index));
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

    const uploaded=[];
    let insertedItemId=null;
    try{
      for(const prepared of preparedFiles){
        const path=planningPath(selectedCategory.id,prepared);
        const upload=await supabase.storage.from("planning-materials").upload(path,prepared,{
          contentType:prepared.type,
          cacheControl:"3600",
          upsert:false,
        });
        if(upload.error)throw upload.error;
        uploaded.push({path,prepared});
      }

      const first=uploaded[0];
      const inserted=await supabase.from("planning_items").insert({
        category_id:selectedCategory.id,
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
      insertedItemId=inserted.data?.id;

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
    }catch(error){
      if(insertedItemId){
        try{await supabase.from("planning_items").delete().eq("id",insertedItemId)}catch{}
      }
      if(uploaded.length){
        try{await supabase.storage.from("planning-materials").remove(uploaded.map(item=>item.path))}catch{}
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

  function openItem(item){
    if(item.item_type==="image"){
      const gallery=imageUrls[item.id]||[];
      if(gallery.length)setPreview({kind:"image",item,images:gallery});
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
        {preview.kind==="image"&&<div className="planning-preview-gallery">
          {(preview.images||[]).map((attachment,index)=><figure key={attachment.id||attachment.storage_path||index}>
            <img src={attachment.url} alt={preview.item.title+" · Imagen "+(index+1)}/>
            {(preview.images||[]).length>1&&<figcaption>{index+1} / {(preview.images||[]).length}</figcaption>}
          </figure>)}
        </div>}
        {preview.kind==="board"&&<BoardSvg strokes={preview.item.board_data?.strokes||[]} tokens={preview.item.board_data?.tokens||[]}/>}
        {preview.item.body&&<p>{preview.item.body}</p>}
      </div>
    </div>,document.body)}
  </section>;
}
