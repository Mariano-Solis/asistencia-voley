import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const TRAINING_URL = "https://voleiboles.lovable.app/";

export default function ProfessorTrainingHub() {
  const [host, setHost] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      const app = document.querySelector("main.app");
      const nav = app?.querySelector(":scope > nav");
      const content = app?.querySelector(".content-inner");
      if (!app || !nav || !content) {
        setHost(null);
        return;
      }

      let button = nav.querySelector("[data-training-hub-button]");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.setAttribute("data-training-hub-button", "true");
        button.textContent = "Entrenamiento";
        button.addEventListener("click", () => setOpen(true));
        nav.appendChild(button);
      }

      let node = content.querySelector("[data-training-hub-host]");
      if (!node) {
        node = document.createElement("div");
        node.setAttribute("data-training-hub-host", "true");
        content.appendChild(node);
      }
      setHost(node);
    };

    const closeFromNativeNav = (event) => {
      const button = event.target?.closest?.("main.app > nav button");
      if (!button || button.hasAttribute("data-training-hub-button")) return;
      setOpen(false);
    };

    sync();
    document.addEventListener("click", closeFromNativeNav, true);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("click", closeFromNativeNav, true);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!host) return;
    const content = host.parentElement;
    const button = document.querySelector("main.app > nav [data-training-hub-button]");
    if (!content) return;

    Array.from(content.children).forEach((child) => {
      if (child === host) {
        child.style.display = open ? "" : "none";
      } else {
        child.style.display = open ? "none" : "";
      }
    });

    button?.classList.toggle("active", open);
  }, [host, open]);

  if (!host) return null;

  return createPortal(
    <section className="training-hub-section">
      <div className="page-title">
        <div>
          <h1>Entrenamiento</h1>
          <p>Material de consulta y apoyo para Profes.</p>
        </div>
      </div>

      <div className="card training-resource-card">
        <div className="training-resource-icon">🏐</div>
        <div className="grow">
          <span className="eyebrow">Biblioteca externa</span>
          <h2>+1000 Dinámicas de Voleibol</h2>
          <p>Acceso directo al material de entrenamiento, ejercicios, dinámicas, planificación y recursos para la cancha.</p>
        </div>
        <a className="training-resource-link" href={TRAINING_URL} target="_blank" rel="noreferrer">Abrir material ↗</a>
      </div>

      <div className="card training-library-ready">
        <div>
          <h2>Biblioteca del Profe</h2>
          <p>Esta sección queda preparada para incorporar más adelante imágenes, PDFs y otros materiales propios de entrenamiento sin mezclarlo con Asistencia ni Historial.</p>
        </div>
        <span className="training-coming-soon">Próxima etapa</span>
      </div>
    </section>,
    host,
  );
}
