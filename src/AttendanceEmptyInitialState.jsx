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

function restoreWaitingVisual(section) {
  if (!section) return;
  const select = section.querySelector('select[data-attendance-category-proxy="true"]');
  const filterCard = select?.closest(".filter-card");
  if (!select || !filterCard || filterCard.dataset.attendanceWaitingCategory !== "true") return;

  // React puede volver a pintar el valor interno de la primera categoría después
  // de terminar la lectura. Restauramos SOLO el valor visual del select. Asignar
  // select.value no modifica el árbol DOM ni dispara change, por lo que no crea
  // ciclos de MutationObserver/re-render.
  if (select.value !== PLACEHOLDER_VALUE) select.value = PLACEHOLDER_VALUE;
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
  placeholder.textContent = PLACEHOLDER_LABEL;
  select.prepend(placeholder);

  const activityLabel = Array.from(filterCard.querySelectorAll("label")).find(
    (label) => label.textContent?.trim() === "Actividad"
  );
  const activityPicker = filterCard.querySelector(".activity-picker");

  const applySelectionState = (event) => {
    const waiting = !select.value || select.value === PLACEHOLDER_VALUE;

    // El placeholder es únicamente el estado neutro de entrada. No se envía a
    // React como category_id y por eso jamás puede crear/cargar una sesión falsa.
    if (waiting && event) event.stopPropagation();

    setWaitingState(filterCard, attendanceCard, activityLabel, activityPicker, waiting);
  };

  filterCard.dataset.attendanceWaitingCategory = "true";
  select.value = PLACEHOLDER_VALUE;
  applySelectionState();

  select.addEventListener("change", applySelectionState);
}

export default function AttendanceEmptyInitialState() {
  useEffect(() => {
    const refresh = () => prepare(findAttendanceSection());
    const restore = () => restoreWaitingVisual(findAttendanceSection());

    refresh();

    // El observer se usa solamente para descubrir la pantalla cuando se navega a
    // Asistencia. prepare() es idempotente y no resincroniza un nodo ya preparado.
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });

    // AppNew emite este evento al cambiar loading/dirty/saving. Cuando finaliza la
    // carga inicial, React puede haber repintado Master A: corregimos solo el value
    // visual, sin tocar hidden, atributos ni estado React y sin provocar un loop.
    window.addEventListener("voley:attendance-state", restore);

    return () => {
      observer.disconnect();
      window.removeEventListener("voley:attendance-state", restore);
    };
  }, []);

  return null;
}
