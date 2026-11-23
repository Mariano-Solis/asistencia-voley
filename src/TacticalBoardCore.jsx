import { useRef, useState } from "react";
import "./planning.css";

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
