import { useEffect } from "react";

const PLACEHOLDER_VALUE = "__attendance_unselected__";

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

function prepare(section) {
  if (!section || section.dataset.emptyInitialStateReady === "true") return;

  const select = section.querySelector('select[data-attendance-category-proxy="true"]');
  const filterCard = select?.closest(".filter-card");
  const attendanceCard = section.querySelector(".attendance-card");
  if (!select || !filterCard || !attendanceCard) return;

  section.dataset.emptyInitialStateReady = "true";

  // "Sin categoría" es una opción real del selector visual. No representa una
  // categoría de la base de datos ni puede generar una sesión de asistencia.
  const placeholder = document.createElement("option");
  placeholder.value = PLACEHOLDER_VALUE;
  placeholder.textContent = "Sin categoría";
  select.prepend(placeholder);

  const activityLabel = Array.from(filterCard.querySelectorAll("label")).find(
    (label) => label.textContent?.trim() === "Actividad"
  );
  const activityPicker = filterCard.querySelector(".activity-picker");

  const applySelectionState = (event) => {
    const waiting = !select.value || select.value === PLACEHOLDER_VALUE;

    // React mantiene internamente la última categoría real. Cuando se elige
    // "Sin categoría" detenemos este change antes de que llegue al onChange de
    // React: así el placeholder no puede convertirse accidentalmente en un id
    // de categoría ni disparar lecturas/guardados contra una categoría inválida.
    if (waiting && event) event.stopPropagation();

    setWaitingState(filterCard, attendanceCard, activityLabel, activityPicker, waiting);
  };

  // La pantalla siempre inicia en estado neutro. El Profe debe seleccionar
  // explícitamente una categoría antes de ver Jugador@s o cargar asistencia.
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

    return () => observer.disconnect();
  }, []);

  return null;
}
