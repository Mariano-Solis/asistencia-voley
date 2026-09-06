import { useEffect } from "react";

const STATUS_BY_LABEL = {
  presentes: "present",
  presente: "present",
  tardanzas: "late",
  tardanza: "late",
  ausencias: "absent",
  ausentes: "absent",
  ausencia: "absent",
};

const TITLE_BY_STATUS = {
  present: "Mi asistencia · Presentes",
  late: "Mi asistencia · Tardanzas",
  absent: "Mi asistencia · Ausentes",
};

export default function SafePlayerAttendanceFilter() {
  useEffect(() => {
    const getStatus = (card) => {
      const label = (card?.querySelector("span")?.textContent || "").trim().toLowerCase();
      return STATUS_BY_LABEL[label] || "";
    };

    const decorateCard = (card) => {
      if (!card) return;
      const status = getStatus(card);
      if (!status) return;
      const playerApp = card.closest(".player-app");
      const active = playerApp?.dataset.safeAttendanceFilter || "";
      card.classList.add("attendance-filter-button");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-pressed", active === status ? "true" : "false");
      card.classList.toggle("attendance-stat-active", active === status);
    };

    const refreshVisibleCards = (playerApp) => {
      playerApp?.querySelectorAll(".stats .card").forEach(decorateCard);
    };

    const applyFilter = (playerApp, status) => {
      if (!playerApp) return;
      playerApp.dataset.safeAttendanceFilter = status || "";

      const attendanceCard = Array.from(playerApp.querySelectorAll(".player-wrap > .card, .player-wrap .card")).find((card) =>
        card.querySelector(".card-head h2")?.textContent?.startsWith("Mi asistencia")
      );
      const list = attendanceCard?.querySelector(".simple-list");
      if (!list) return;

      const rows = Array.from(list.querySelectorAll(":scope > .history-row"));
      let visible = 0;
      rows.forEach((row) => {
        const matches = !status || !!row.querySelector(`.badge.${status}`);
        row.hidden = !matches;
        if (matches) visible += 1;
      });

      let empty = list.querySelector(":scope > .attendance-filter-empty-safe");
      if (!empty) {
        empty = document.createElement("div");
        empty.className = "empty attendance-filter-empty-safe";
        empty.textContent = "No hay registros para este estado.";
        empty.hidden = true;
        list.appendChild(empty);
      }
      empty.hidden = !(status && visible === 0);

      const heading = attendanceCard.querySelector(".card-head h2");
      if (heading) heading.textContent = status ? TITLE_BY_STATUS[status] : "Mi asistencia";
      refreshVisibleCards(playerApp);
    };

    const onPointerOver = (event) => {
      const card = event.target?.closest?.(".player-app .stats .card");
      if (card) decorateCard(card);
    };

    const onFocusIn = (event) => {
      const card = event.target?.closest?.(".player-app .stats .card");
      if (card) decorateCard(card);
    };

    const onClick = (event) => {
      const card = event.target?.closest?.(".player-app .stats .card");
      if (!card) return;
      const playerApp = card.closest(".player-app");
      const status = getStatus(card);
      if (!playerApp || !status) return;
      event.preventDefault();
      const current = playerApp.dataset.safeAttendanceFilter || "";
      applyFilter(playerApp, current === status ? "" : status);
    };

    const onKeyDown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target?.closest?.(".player-app .stats .card");
      if (!card) return;
      event.preventDefault();
      card.click();
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return null;
}
