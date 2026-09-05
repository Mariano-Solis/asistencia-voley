import { useEffect } from "react";

function installToggle({ title, cardSelector, label, icon }) {
  const section = Array.from(document.querySelectorAll("section")).find(
    (s) => s.querySelector(".page-title h1")?.textContent?.trim() === title
  );
  if (!section) return;

  const card = section.querySelector(cardSelector);
  if (!card) return;

  let button = section.querySelector(`[data-collapsible-toggle="${title}"]`);
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "admin-collapse-toggle";
    button.dataset.collapsibleToggle = title;
    button.innerHTML = `<span>${icon}</span><strong>${label}</strong><span class="admin-collapse-chevron">⌄</span>`;
    card.insertAdjacentElement("beforebegin", button);
  }

  if (!card.dataset.collapsibleReady) {
    card.dataset.collapsibleReady = "true";
    card.classList.add("admin-collapsible-panel");
    card.hidden = true;
    button.setAttribute("aria-expanded", "false");

    button.addEventListener("click", () => {
      const opening = card.hidden;
      card.hidden = !opening;
      button.classList.toggle("open", opening);
      button.setAttribute("aria-expanded", opening ? "true" : "false");
      const chevron = button.querySelector(".admin-collapse-chevron");
      if (chevron) chevron.textContent = opening ? "⌃" : "⌄";
      if (opening) setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    });
  }
}

export default function AdminCollapsibles() {
  useEffect(() => {
    const sync = () => {
      installToggle({
        title: "Jugador@s",
        cardSelector: ".add-player-card",
        label: "Agregar Jugador@ desde la Administración",
        icon: "➕",
      });
      installToggle({
        title: "Profes",
        cardSelector: ".admin-create-card",
        label: "Crear cuenta de Profe",
        icon: "👨‍🏫",
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
