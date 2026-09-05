import { useEffect } from "react";

export default function WorkflowDOMPolish(){
  useEffect(()=>{
    const sync=()=>{
      const sections=Array.from(document.querySelectorAll("section"));

      const attendance=sections.find(s=>s.querySelector(".page-title h1")?.textContent?.trim()==="Asistencia");
      if(attendance){
        const select=attendance.querySelector(".filter-card select");
        if(select&&select.options.length){
          if(!select.querySelector('option[value=""]')){
            const option=document.createElement("option");
            option.value="";
            option.textContent="- Seleccione Categoría -";
            select.prepend(option);
          }
          if(!attendance.dataset.categoryUserSelected){
            select.value="";
            const card=attendance.querySelector(".attendance-card");
            if(card)card.style.display="none";
            const picker=attendance.querySelector(".activity-picker");
            if(picker)picker.closest(".filter-card")?.classList.add("awaiting-category");
            if(!select.dataset.categoryListener){
              select.dataset.categoryListener="true";
              select.addEventListener("change",()=>{
                if(select.value){
                  attendance.dataset.categoryUserSelected="true";
                  const attendanceCard=attendance.querySelector(".attendance-card");
                  if(attendanceCard)attendanceCard.style.display="";
                  select.closest(".filter-card")?.classList.remove("awaiting-category");
                }
              });
            }
          }else{
            const card=attendance.querySelector(".attendance-card");
            if(card)card.style.display="";
            select.closest(".filter-card")?.classList.remove("awaiting-category");
          }
        }
      }

      const players=sections.find(s=>s.querySelector(".page-title h1")?.textContent?.trim()==="Jugador@s");
      if(players){
        const host=players.querySelector("[data-roster-share-v2]");
        const toolbar=players.querySelector(".toolbar");
        if(host&&toolbar&&toolbar.nextElementSibling!==host)toolbar.insertAdjacentElement("afterend",host);
      }

      const history=sections.find(s=>s.querySelector(".page-title h1")?.textContent?.trim()==="Historial");
      if(history){
        const host=history.querySelector("[data-history-tool-v2]");
        const title=history.querySelector(".page-title");
        if(host&&title&&title.nextElementSibling!==host)title.insertAdjacentElement("afterend",host);

        const categorySelect=host?.querySelector("label:nth-of-type(2) select");
        const sessionList=history.querySelector(".session-list");
        const updateSessions=()=>{if(sessionList)sessionList.style.display=categorySelect?.value?"":"none";};
        updateSessions();
        if(categorySelect&&!categorySelect.dataset.sessionVisibilityListener){
          categorySelect.dataset.sessionVisibilityListener="true";
          categorySelect.addEventListener("change",updateSessions);
        }
      }
    };
    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);
  return null;
}
