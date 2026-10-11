import { useEffect, useState } from "react";
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

  useEffect(()=>{
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(board))}catch{}
  },[board]);

  useEffect(()=>{
    if(!open)return;
    const onKey=event=>{if(event.key==="Escape")onClose?.()};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[open,onClose]);

  if(!open)return null;

  return createPortal(<div className="quick-board-overlay" role="dialog" aria-modal="true" aria-label="Pizarra Rápida">
    <section className="quick-board-shell">
      <header className="quick-board-header">
        <div>
          <span>Uso En Partido</span>
          <h2>🖍️ Pizarra</h2>
          <small>Dibujá, Mové Fichas y Volvé Sin Perder Lo Que Estabas Haciendo.</small>
        </div>
        <button type="button" className="quick-board-close" onClick={onClose} aria-label="Cerrar Pizarra">×</button>
      </header>

      <main className="quick-board-body">
        <TacticalBoardEditor value={board} onChange={setBoard} fullscreen fastMode/>
      </main>

      <footer className="quick-board-footer">
        <button type="button" onClick={()=>setBoard(normalizeBoardData(null))}>↺ Reiniciar Todo</button>
        <button type="button" className="primary" onClick={onClose}>✓ Volver</button>
      </footer>
    </section>
  </div>,document.body);
}
