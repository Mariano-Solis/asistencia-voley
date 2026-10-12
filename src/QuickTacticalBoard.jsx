import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TacticalBoardEditor, normalizeBoardData } from "./PlanningHub";
import "./quick-board.css";

const STORAGE_KEY="mgsm-quick-tactical-board:v1";

function readBoard(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
    return normalizeBoardData(parsed);
  }catch{
    return normalizeBoardData(null);
  }
}

export default function QuickTacticalBoard({open,onClose}){
  const [board,setBoard]=useState(readBoard);
  const overlayRef=useRef(null);

  useEffect(()=>{
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(board))}catch{}
  },[board]);

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
        <TacticalBoardEditor value={board} onChange={setBoard} fullscreen fastMode matchMode/>
      </main>

      <footer className="quick-board-footer">
        <span>Los Cambios Se Guardan Automáticamente</span>
        <button type="button" className="primary" onClick={onClose}>✓ Volver Al Partido</button>
      </footer>
    </section>
  </div>,document.body);
}
