import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TacticalBoardEditor, normalizeBoardData } from "./PlanningHub";
import "./quick-board.css";

const STORAGE_KEY="mgsm-quick-tactical-board:v1";
const PRESETS_KEY="mgsm-quick-tactical-board-presets:v1";

function readBoard(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
    return normalizeBoardData(parsed);
  }catch{
    return normalizeBoardData(null);
  }
}
function readPresets(){
  try{
    const parsed=JSON.parse(localStorage.getItem(PRESETS_KEY)||"[]");
    return Array.isArray(parsed)?parsed:[];
  }catch{
    return [];
  }
}

export default function QuickTacticalBoard({open,onClose}){
  const [board,setBoard]=useState(readBoard);
  const [portraitMode,setPortraitMode]=useState(()=>window.matchMedia?.("(orientation: portrait)")?.matches??true);
  const [presets,setPresets]=useState(readPresets);
  const [libraryOpen,setLibraryOpen]=useState(false);
  const [savingPreset,setSavingPreset]=useState(false);
  const [presetName,setPresetName]=useState("");
  const overlayRef=useRef(null);

  useEffect(()=>{
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(board))}catch{}
  },[board]);

  useEffect(()=>{
    try{localStorage.setItem(PRESETS_KEY,JSON.stringify(presets))}catch{}
  },[presets]);

  useEffect(()=>{
    const media=window.matchMedia?.("(orientation: portrait)");
    if(!media)return;
    const update=()=>setPortraitMode(media.matches);
    update();
    media.addEventListener?.("change",update);
    return()=>media.removeEventListener?.("change",update);
  },[]);



  useEffect(()=>{
    if(!open)return;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const onKey=event=>{if(event.key==="Escape")onClose?.()};
    window.addEventListener("keydown",onKey);
    const node=overlayRef.current;
    if(node?.requestFullscreen&&!document.fullscreenElement){
      Promise.resolve(node.requestFullscreen()).catch(()=>{});
    }
    return()=>{
      window.removeEventListener("keydown",onKey);
      document.body.style.overflow=previousOverflow;
      if(document.fullscreenElement===node)Promise.resolve(document.exitFullscreen?.()).catch(()=>{});
    };
  },[open,onClose]);

  function openSave(){
    setPresetName("");
    setSavingPreset(true);
    setLibraryOpen(true);
  }
  function openLibrary(){
    setSavingPreset(false);
    setLibraryOpen(true);
  }
  function savePreset(){
    const name=presetName.trim();
    if(!name)return;
    const snapshot=JSON.parse(JSON.stringify(normalizeBoardData(board)));
    const item={
      id:globalThis.crypto?.randomUUID?.()||String(Date.now()),
      name,
      board:snapshot,
      saved_at:new Date().toISOString(),
    };
    setPresets(current=>[item,...current].slice(0,30));
    setPresetName("");
    setSavingPreset(false);
  }
  function loadPreset(item){
    setBoard(normalizeBoardData(JSON.parse(JSON.stringify(item.board))));
    setLibraryOpen(false);
  }
  function removePreset(id){
    setPresets(current=>current.filter(item=>item.id!==id));
  }

  if(!open)return null;

  return createPortal(<div ref={overlayRef} className="quick-board-overlay" role="dialog" aria-modal="true" aria-label="Pizarra Rápida">
    <section className="quick-board-shell">
      <header className="quick-board-header">
        <button type="button" className="quick-board-back" onClick={onClose} aria-label="Volver">←</button>
        <div>
          <span>Uso En Partido</span>
          <h2>🖍️ Pizarra</h2>
        </div>
        <button type="button" className="quick-board-reset" onClick={()=>setBoard(normalizeBoardData(null))}>↺ Todo</button>
      </header>

      <main className="quick-board-body">
        <TacticalBoardEditor value={board} onChange={setBoard} fullscreen fastMode matchMode portraitMode={portraitMode} onSaveBoard={openSave} onOpenSavedBoards={openLibrary} canLoadSavedBoards={presets.length>0}/>
      </main>

      <footer className="quick-board-footer">
        <span>Los Cambios Se Guardan Automáticamente</span>
        <button type="button" className="primary" onClick={onClose}>✓ Volver Al Partido</button>
      </footer>

      {libraryOpen&&<div className="quick-board-library-backdrop" role="dialog" aria-modal="true" aria-label="Pizarras Guardadas" onClick={()=>setLibraryOpen(false)}>
        <section className="quick-board-library" onClick={event=>event.stopPropagation()}>
          <header>
            <div><span>Biblioteca Táctica</span><h3>{savingPreset?"Guardar Pizarra":"Pizarras Guardadas"}</h3></div>
            <button type="button" onClick={()=>setLibraryOpen(false)} aria-label="Cerrar">×</button>
          </header>
          {savingPreset&&<div className="quick-board-save-row">
            <input autoFocus value={presetName} onChange={event=>setPresetName(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")savePreset()}} placeholder="Ej.: Defensa Pelota Alta 4"/>
            <button type="button" className="primary" disabled={!presetName.trim()} onClick={savePreset}>💾 Guardar Actual</button>
          </div>}
          <div className="quick-board-library-list">
            {presets.length?presets.map(item=><article key={item.id}>
              <div><b>{item.name}</b><small>{item.saved_at?new Date(item.saved_at).toLocaleString("es-AR"):"Pizarra Guardada"}</small></div>
              <button type="button" className="load" onClick={()=>loadPreset(item)}>📂 Cargar</button>
              <button type="button" className="delete" onClick={()=>removePreset(item.id)} aria-label={"Eliminar "+item.name}>🗑️</button>
            </article>):<div className="quick-board-library-empty">Todavía No Hay Pizarras Guardadas.</div>}
          </div>
        </section>
      </div>}
    </section>
  </div>,document.body);
}
