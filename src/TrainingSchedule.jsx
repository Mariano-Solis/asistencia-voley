import { useMemo, useState } from "react";
import "./training-schedule.css";

const DAYS = [
  {
    key: "lunes",
    label: "Lunes",
    rows: [
      ["18:00 a 19:15 HS", "SUB 14 MASC", "SUB 12 A FEM", "SUB 12 B FEM"],
      ["19:15 a 20:30 HS", "SUB 16 MASC", "SUB 14 A FEM", "SUB 14 B FEM"],
      ["20:30 a 21:45 HS", "SUB 18 MASC", "SUB 16 A FEM", "MASTER A FEM"],
      ["21:45 a 23:00 HS", "PRIMERA MASC", "PRIMERA A FEM", "(Libre)"],
    ],
  },
  {
    key: "martes",
    label: "Martes",
    rows: [
      ["18:00 a 19:15 HS", "(Libre)", "(Libre)", "SUB 16 B FEM"],
      ["19:15 a 20:30 HS", "(Libre)", "(Libre)", "SUB 18 B FEM"],
      ["20:30 a 21:45 HS", "(Libre)", "SUB 18 A FEM", "PRIMERA B FEM"],
      ["21:45 a 23:00 HS", "(Libre)", "MASTER B FEM", "(Libre)"],
    ],
  },
  {
    key: "miercoles",
    label: "Miércoles",
    rows: [
      ["18:00 a 19:15 HS", "SUB 14 MASC", "SUB 12 A FEM", "SUB 12 B FEM"],
      ["19:15 a 20:30 HS", "SUB 16 MASC", "SUB 14 A FEM", "SUB 18 A FEM"],
      ["20:30 a 21:45 HS", "SUB 18 MASC", "SUB 16 A FEM", "MASTER A FEM"],
      ["21:45 a 23:00 HS", "PRIMERA MASC", "PRIMERA A FEM", "(Libre)"],
    ],
  },
  {
    key: "jueves",
    label: "Jueves",
    rows: [
      ["18:00 a 19:15 HS", "(Libre)", "SUB 12 A FEM", "(Libre)"],
      ["19:15 a 20:30 HS", "SUB 16 A FEM", "SUB 14 B FEM", "SUB 18 B FEM"],
      ["20:30 a 21:45 HS", "SUB 18 A FEM", "SUB 16 B FEM", "PRIMERA B FEM"],
      ["21:45 a 23:00 HS", "(Libre)", "MASTER B FEM", "(Libre)"],
    ],
  },
  {
    key: "viernes",
    label: "Viernes",
    rows: [
      ["18:00 a 19:15 HS", "SUB 14 MASC", "HOCKEY", "HOCKEY"],
      ["19:15 a 20:30 HS", "SUB 16 MASC", "SUB 14 A FEM", "(Libre)"],
      ["20:30 a 21:45 HS", "SUB 18 MASC", "PRIMERA A FEM", "(Libre)"],
      ["21:45 a 23:00 HS", "PRIMERA MASC", "(Libre)", "(Libre)"],
    ],
  },
];

function initialDay() {
  const index = new Date().getDay();
  const map = { 1: "lunes", 2: "martes", 3: "miercoles", 4: "jueves", 5: "viernes" };
  return map[index] || "lunes";
}

function slotClass(value) {
  if (value === "(Libre)") return "is-free";
  if (value === "HOCKEY") return "is-hockey";
  if (value.includes("MASC")) return "is-male";
  if (value.includes("FEM")) return "is-female";
  return "";
}

export default function TrainingSchedule({ playerMode = false }) {
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const selected = useMemo(() => DAYS.find((day) => day.key === selectedDay) || DAYS[0], [selectedDay]);

  return (
    <section className={`training-schedule ${playerMode ? "training-schedule-player" : ""}`}>
      <div className="training-schedule-head">
        <div>
          <span className="training-schedule-eyebrow">🏐 Municipalidad De San Martín - VOLEY</span>
          <h1>Horarios</h1>
          <p>Horarios De Entrenamiento Por Día, Cancha y Categoría.</p>
        </div>
        <div className="training-schedule-badge">#VamosElPoli</div>
      </div>

      <div className="training-day-tabs" role="tablist" aria-label="Días De Entrenamiento">
        {DAYS.map((day) => (
          <button
            key={day.key}
            type="button"
            role="tab"
            aria-selected={selectedDay === day.key}
            className={selectedDay === day.key ? "active" : ""}
            onClick={() => setSelectedDay(day.key)}
          >
            {day.label}
          </button>
        ))}
      </div>

      <div className="training-day-card">
        <div className="training-day-title">
          <strong>{selected.label}</strong>
          <span>Cancha 1 · Cancha 2 · Cancha 3</span>
        </div>

        <div className="training-mobile-list">
          {selected.rows.map(([time, court1, court2, court3]) => (
            <article className="training-mobile-slot" key={`${selected.key}-${time}`}>
              <div className="training-mobile-time">🕐 {time}</div>
              <div className={`training-mobile-court ${slotClass(court1)}`}><span>Cancha 1</span><b>{court1}</b></div>
              <div className={`training-mobile-court ${slotClass(court2)}`}><span>Cancha 2</span><b>{court2}</b></div>
              <div className={`training-mobile-court ${slotClass(court3)}`}><span>Cancha 3</span><b>{court3}</b></div>
            </article>
          ))}
        </div>

        <div className="training-table-wrap">
          <table className="training-table">
            <thead>
              <tr><th>Hora</th><th>Cancha 1</th><th>Cancha 2</th><th>Cancha 3</th></tr>
            </thead>
            <tbody>
              {selected.rows.map(([time, court1, court2, court3]) => (
                <tr key={`${selected.key}-${time}`}>
                  <th>{time}</th>
                  <td className={slotClass(court1)}>{court1}</td>
                  <td className={slotClass(court2)}>{court2}</td>
                  <td className={slotClass(court3)}>{court3}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="training-legend" aria-label="Referencias">
        <span><i className="legend-dot male"/> Masculino</span>
        <span><i className="legend-dot female"/> Femenino</span>
        <span><i className="legend-dot hockey"/> Hockey</span>
        <span><i className="legend-dot free"/> Libre</span>
      </div>
    </section>
  );
}
