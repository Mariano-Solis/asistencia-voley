import { useEffect } from "react";

const PLACEHOLDER_VALUE = "__attendance_unselected__";

function findAttendanceSection() {
  return Array.from(document.querySelectorAll("main.app section")).find((section) =>
    section.querySelector(".page-title h1")?.textContent?.trim() === "Asistencia" &&
    section.querySelector('select[data-attendance-category-proxy="true"]')
  ) || null;
}

function prepare(section) {
  if (!section || section.dataset.emptyInitialStateReady === "true") return;

  const select = section.querySelector('select[data-attendance-category-proxy="true"]');
  const filterCard = select?.closest(".filter-card");
  const attendanceCard = section.querySelector(".attendance-card");
  if (!select || !filterCard || !attendanceCard) return;

  section.dataset.emptyInitialStateReady = "true";

  const placeholder = document.createElement("option");
  placeholder.value = PLACEHOLDER_VALUE;
  placeholder.textContent = "Sin categoría";
  placeholder.disabled = true;
  placeholder.hidden = true;
  select.prepend(placeholder);

  // La selección real de React se conserva internamente, pero la pantalla comienza
  // deliberadamente neutra hasta que el Profe elija una categoría de forma explícita.
  select.value = PLACEHOLDER_VALUE;
  filterCard.dataset.attendanceWaitingCategory = "true";
  attendanceCard.hidden = true;

  const activityLabel = Array.from(filterCard.querySelectorAll("label")).find(
    (label) => label.textContent?.trim() === "Actividad"
  );
  const activityPicker = filterCard.querySelector(".activity-picker");
  if (activityLabel) activityLabel.hidden = true;
  if (activityPicker) activityPicker.hidden = true;

  const reveal = () => {
    if (!select.value || select.value === PLACEHOLDER_VALUE) return;
    filterCard.dataset.attendanceWaitingCategory = "false";
    if (activityLabel) activityLabel.hidden = false;
    if (activityPicker) activityPicker.hidden = false;
    attendanceCard.hidden = false;
  };

  select.addEventListener("change", reveal);
}

export default function AttendanceEmptyInitialState() {
  useEffect(() => {
    const refresh = () => prepare(findAttendanceSection());
    refresh();

    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
