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

export default function PlayerAttendanceFilter() {
  useEffect(() => {
    const applyFilter = (playerApp, status) => {
      const rows = Array.from(playerApp.querySelectorAll(".simple-list .history-row"));
      let visibleCount = 0;

      rows.forEach((row) => {
        const badge = row.querySelector(".badge");
        const matches = !status || badge?.classList.contains(status);
        row.style.display = matches ? "" : "none";
        if (matches) visibleCount += 1;
      });

      const list = playerApp.querySelector(".simple-list");
      if (list) {
        let empty = list.querySelector(".attendance-filter-empty");
        if (!empty) {
          empty = document.createElement("div");
          empty.className = "empty attendance-filter-empty";
          list.appendChild(empty);
        }
        empty.textContent = status ? "No hay registros para este estado." : "";
        empty.style.display = status && visibleCount === 0 ? "" : "none";
      }

      const heading = playerApp.querySelector(".simple-list")?.closest(".card")?.querySelector(".card-head h2");
      if (heading) heading.textContent = status ? TITLE_BY_STATUS[status] : "Mi asistencia";

      playerApp.dataset.attendanceFilter = status || "";
      playerApp.querySelectorAll(".stats .card").forEach((card) => {
        card.classList.toggle("attendance-stat-active", card.dataset.attendanceStatus === status && !!status);
        card.setAttribute("aria-pressed", card.dataset.attendanceStatus === status && !!status ? "true" : "false");
      });
    };

    const enhance = () => {
      document.querySelectorAll(".player-app").forEach((playerApp) => {
        const stats = playerApp.querySelector(".stats");
        if (!stats) return;

        stats.querySelectorAll(".card").forEach((card) => {
          const label = (card.querySelector("span")?.textContent || "").trim().toLowerCase();
          const status = STATUS_BY_LABEL[label];
          if (!status) return;

          card.dataset.attendanceStatus = status;
          card.setAttribute("role", "button");
          card.setAttribute("tabindex", "0");
          card.setAttribute("aria-label", `Filtrar por ${label}`);
          card.setAttribute("aria-pressed", playerApp.dataset.attendanceFilter === status ? "true" : "false");

          if (card.dataset.attendanceFilterBound === "true") return;
          card.dataset.attendanceFilterBound = "true";

          const activate = () => {
            const current = playerApp.dataset.attendanceFilter || "";
            applyFilter(playerApp, current === status ? "" : status);
          };

          card.addEventListener("click", activate);
          card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              activate();
            }
          });
        });

        const current = playerApp.dataset.attendanceFilter || "";
        if (current) applyFilter(playerApp, current);
      });
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
