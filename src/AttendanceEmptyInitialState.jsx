import { useEffect } from "react";

const PLACEHOLDER_VALUE = "__attendance_unselected__";
const PLACEHOLDER_LABEL = "Sin Categoría";

function findAttendanceSection() {
  return Array.from(document.querySelectorAll("main.app section")).find((section) =>
    section.querySelector(".page-title h1")?.textContent?.trim() === "Asistencia" &&
    section.querySelector('select[data-attendance-category-proxy="true"]')
  ) || null;
}

function setWaitingState(filterCard, attendanceCard, activityLabel, activityPicker, waiting) {
  filterCard.dataset.attendanceWaitingCategory = waiting ? "true" : "false";
  attendanceCard.hidden = waiting;
  if (activityLabel) activityLabel.hidden = waiting;
  if (activityPicker) activityPicker.hidden = waiting;
}

function syncWaitingSelection(section) {
  if (!section) return;
  const select = section.querySelector('select[data-attendance-category-proxy="true"]');
  const filterCard = select?.closest(".filter-card");
  const attendanceCard = section.querySelector(".attendance-card");
  if (!select || !filterCard || !attendanceCard) return;

  const placeholder = Array.from(select.options).find(option => option.value === PLACEHOLDER_VALUE);
  if (placeholder) placeholder.textContent = PLACEHOLDER_LABEL;

  if (filterCard.dataset.attendanceWaitingCategory !== "true") return;

  // React conserva internamente la primera categoría habilitada, pero mientras el
  // Profe no haya elegido una categoría de forma explícita la interfaz debe seguir
  // mostrando el estado neutro, incluso después de re-renderizados por la carga.
  if (select.value !== PLACEHOLDER_VALUE) select.value = PLACEHOLDER_VALUE;

  const activityLabel = Array.from(filterCard.querySelectorAll("label")).find(
    (label) => label.textContent?.trim() === "Actividad"
  );
  const activityPicker = filterCard.querySelector(".activity-picker");
  setWaitingState(filterCard, attendanceCard, activityLabel, activityPicker, true);
}

function prepare(section) {
  if (!section) return;

  const select = section.querySelector('select[data-attendance-category-proxy="true"]');
  const filterCard = select?.closest(".filter-card");
  const attendanceCard = section.querySelector(".attendance-card");
  if (!select || !filterCard || !attendanceCard) return;

  if (section.dataset.emptyInitialStateReady === "true") {
    syncWaitingSelection(section);
    return;
  }

  section.dataset.emptyInitialStateReady = "true";

  const placeholder = document.createElement("option");
  placeholder.value = PLACEHOLDER_VALUE;
  placeholder.textContent = PLACEHOLDER_LABEL;
  select.prepend(placeholder);

  const activityLabel = Array.from(filterCard.querySelectorAll("label")).find(
    (label) => label.textContent?.trim() === "Actividad"
  );
  const activityPicker = filterCard.querySelector(".activity-picker");

  const applySelectionState = (event) => {
    const waiting = !select.value || select.value === PLACEHOLDER_VALUE;

    if (waiting && event) event.stopPropagation();
    setWaitingState(filterCard, attendanceCard, activityLabel, activityPicker, waiting);
  };

  // Estado inicial obligatorio: ninguna categoría queda preseleccionada visualmente.
  filterCard.dataset.attendanceWaitingCategory = "true";
  select.value = PLACEHOLDER_VALUE;
  applySelectionState();

  select.addEventListener("change", applySelectionState);
}

export default function AttendanceEmptyInitialState() {
  useEffect(() => {
    const refresh = () => prepare(findAttendanceSection());
    refresh();

    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("voley:attendance-state", refresh);

    return () => {
      observer.disconnect();
      window.removeEventListener("voley:attendance-state", refresh);
    };
  }, []);

  return null;
}
