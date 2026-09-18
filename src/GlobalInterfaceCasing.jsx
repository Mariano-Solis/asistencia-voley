import { useEffect } from "react";

const SKIP_TAGS = new Set(["SCRIPT","STYLE","TEXTAREA","CODE","PRE","INPUT","SELECT","OPTION"]);
const ATTRIBUTES = ["placeholder","title","aria-label"];
const Y_TOKEN = /^[^\p{L}]*y[^\p{L}]*$/iu;

function titleToken(token) {
  if (/^#vamoselpoli$/iu.test(token)) return "#VamosElPoli";
  if (Y_TOKEN.test(token)) return token.replace(/y/iu,"y");
  return token.replace(/\p{L}/u, letter => letter.toLocaleUpperCase("es-AR"));
}

export function formatInterfaceText(value="") {
  return String(value).replace(/\S+/gu, titleToken);
}

function excluded(el) {
  return !el || SKIP_TAGS.has(el.tagName) || !!el.closest?.("[contenteditable='true'],[data-preserve-case='true']");
}

function applyText(root=document.body) {
  if (!root) return;
  const scope = root.nodeType === Node.TEXT_NODE ? root.parentElement : root;
  if (!scope || excluded(scope)) return;

  if (root.nodeType === Node.TEXT_NODE) {
    const next=formatInterfaceText(root.nodeValue||"");
    if(next!==root.nodeValue) root.nodeValue=next;
    return;
  }

  if (root instanceof Element) {
    for (const attr of ATTRIBUTES) {
      if(root.hasAttribute(attr)) {
        const current=root.getAttribute(attr)||"";
        const next=formatInterfaceText(current);
        if(next!==current) root.setAttribute(attr,next);
      }
    }
  }

  const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())){
    if(excluded(node.parentElement)) continue;
    const next=formatInterfaceText(node.nodeValue||"");
    if(next!==node.nodeValue) node.nodeValue=next;
  }
}

export default function GlobalInterfaceCasing(){
  useEffect(()=>{
    let queued=false;
    const normalizeAll=()=>{
      queued=false;
      applyText(document.body);
      document.querySelectorAll(ATTRIBUTES.map(a=>`[${a}]`).join(",")).forEach(el=>{
        if(excluded(el)) return;
        for(const attr of ATTRIBUTES){
          if(!el.hasAttribute(attr)) continue;
          const current=el.getAttribute(attr)||"";
          const next=formatInterfaceText(current);
          if(next!==current) el.setAttribute(attr,next);
        }
      });
    };
    const schedule=()=>{
      if(queued) return;
      queued=true;
      requestAnimationFrame(normalizeAll);
    };

    normalizeAll();
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    window.addEventListener("pageshow",schedule);
    window.addEventListener("focus",schedule);
    document.addEventListener("visibilitychange",schedule);

    return()=>{
      observer.disconnect();
      window.removeEventListener("pageshow",schedule);
      window.removeEventListener("focus",schedule);
      document.removeEventListener("visibilitychange",schedule);
    };
  },[]);
  return null;
}
