import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor, CapacitorHttp } from "@capacitor/core";

const NATIVE_STANDINGS = {
  "female:sub12": { tournamentId: 897, stageId: 3640 },
  "female:sub14": { tournamentId: 898, stageId: 3641 },
  "female:sub16": { tournamentId: 899, stageId: 3642 },
  "female:sub18": { tournamentId: 900, stageId: 3643 },
  "female:mayores": { tournamentId: 901, stageId: 3644 },
  "male:sub14": { tournamentId: 896, stageId: 3639 },
  "male:sub16": { tournamentId: 895, stageId: 3638 },
  "male:sub18": { tournamentId: 894, stageId: 3637 },
  "male:mayores": { tournamentId: 893, stageId: 3636 },
};

const CATEGORY_OPTIONS = {
  female: [
    ["mayores", "Primera"],
    ["sub18", "Sub 18"],
    ["sub16", "Sub 16"],
    ["sub14", "Sub 14"],
    ["sub12", "Sub 12"],
  ],
  male: [
    ["mayores", "Primera"],
    ["sub18", "Sub 18"],
    ["sub16", "Sub 16"],
    ["sub14", "Sub 14"],
  ],
};

function branchLabel(value) {
  return value === "female" ? "Femenino" : "Masculino";
}

function formatTime(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "America/Argentina/Mendoza",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

export default function StandingsHub({ compact = false }) {
  const [branch, setBranch] = useState("female");
  const [category, setCategory] = useState("mayores");
  const [query, setQuery] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const abortRef = useRef(null);

  const options = CATEGORY_OPTIONS[branch];

  useEffect(() => {
    if (!options.some(([value]) => value === category)) setCategory(options[0][0]);
  }, [branch]);

  async function load({ quiet = false } = {}) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setMessage("");
    try {
      let payload;

      if (Capacitor.isNativePlatform()) {
        const ids = NATIVE_STANDINGS[`${branch}:${category}`];
        if (!ids) throw new Error("Rama O Categoría No Válida.");

        const response = await CapacitorHttp.get({
          url: "https://api.courtrack.com/api/torneo/getPosiciones",
          params: {
            id_torneos: String(ids.tournamentId),
            id_etapas: String(ids.stageId),
          },
          headers: { Accept: "application/json" },
          connectTimeout: 12000,
          readTimeout: 12000,
        });

        const nativePayload = typeof response.data === "string"
          ? JSON.parse(response.data || "{}")
          : (response.data || {});

        if (response.status < 200 || response.status >= 300 || nativePayload?.error) {
          throw new Error(nativePayload?.message || `Courtrack Respondió HTTP ${response.status}.`);
        }

        const table = Array.isArray(nativePayload?.data) ? nativePayload.data[0] : null;
        if (!table) throw new Error("No Se Encontró La Tabla Solicitada.");

        payload = {
          error: false,
          source: "Courtrack · Federación Mendocina De Voleibol",
          fetchedAt: new Date().toISOString(),
          branch,
          category,
          tournamentId: Number(table.id_torneo || ids.tournamentId),
          stageId: Number(table.id_etapa || ids.stageId),
          stage: table.titulo || table.descripcion_etapa || "",
          division: table.division || "",
          positions: Array.isArray(table.posicionesObj) ? table.posicionesObj : [],
        };
      } else {
        const params = new URLSearchParams({ branch, category });
        const response = await fetch(`/api/courtrack-standings?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.error) {
          throw new Error(payload?.message || "No Se Pudo Actualizar La Tabla.");
        }
      }

      setData(payload);
    } catch (error) {
      if (error?.name !== "AbortError") setMessage(error?.message || "No Se Pudo Actualizar La Tabla.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load({ quiet: true }), 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load({ quiet: true });
    };
    const onFocus = () => void load({ quiet: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      abortRef.current?.abort();
    };
  }, [branch, category]);

  const rows = useMemo(() => {
    const positions = Array.isArray(data?.positions) ? data.positions : [];
    const needle = query.trim().toLocaleLowerCase("es-AR");
    if (!needle) return positions;
    return positions.filter((row) => String(row.id_equipo || "").toLocaleLowerCase("es-AR").includes(needle));
  }, [data, query]);

  const leader = data?.positions?.[0] || null;

  return <section className={`standings-page ${compact ? "compact" : ""}`}>
    <div className="standings-hero">
      <div>
        <span className="eyebrow">Federación Mendocina De Voleibol · Nivel 1</span>
        <h1>Tabla De Posiciones</h1>
        <p>Consulta Institucional Con Actualización Automática Desde Courtrack.</p>
      </div>
      <div className="standings-live">
        <span className={refreshing ? "pulse" : ""}>●</span>
        <div><b>{refreshing ? "Actualizando..." : "Actualización Automática"}</b><small>Cada 60 Segundos · Última Consulta {formatTime(data?.fetchedAt)}</small></div>
      </div>
    </div>

    <div className="standings-controls card">
      <label>Rama
        <select value={branch} onChange={(event) => setBranch(event.target.value)}>
          <option value="female">Femenino</option>
          <option value="male">Masculino</option>
        </select>
      </label>
      <label>Categoría
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Buscar Equipo
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej.: GSM A"/>
      </label>
      <button type="button" className="standings-refresh" onClick={() => void load({ quiet: true })} disabled={refreshing}>
        <span className={refreshing ? "spinning" : ""}>↻</span> {refreshing ? "Actualizando..." : "Actualizar Ahora"}
      </button>
    </div>

    {message && <div className="message standings-message">{message}</div>}

    {!loading && data && <div className="standings-summary">
      <div className="card"><span>Rama</span><b>{branchLabel(branch)}</b></div>
      <div className="card"><span>Equipos</span><b>{data.positions?.length || 0}</b></div>
      <div className="card"><span>Líder</span><b>{leader?.id_equipo || "—"}</b></div>
      <div className="card"><span>Puntos Del Líder</span><b>{leader?.puntos ?? "—"}</b></div>
    </div>}

    <div className="standings-card card">
      <div className="standings-card-head">
        <div>
          <h2>{data?.stage || "Posiciones Oficiales"}</h2>
          <p>{data?.division || (loading ? "Consultando Información..." : "Federación Mendocina De Voleibol")}</p>
        </div>
        <label className="standings-advanced"><input type="checkbox" checked={advanced} onChange={(event) => setAdvanced(event.target.checked)}/> Estadísticas Avanzadas</label>
      </div>

      {loading ? <div className="standings-loading">Consultando La Tabla Oficial...</div> :
        <div className="standings-table-wrap">
          <table className="standings-table">
            <thead><tr>
              <th>Pos.</th><th>Equipo</th><th>PTS</th><th>PJ</th><th>PG</th><th>PP</th>
              {advanced && <><th>SG</th><th>SP</th><th>TF</th><th>TC</th></>}
            </tr></thead>
            <tbody>
              {rows.map((row) => <tr key={`${row.posicion}:${row.id_equipo}`} className={row.posicion <= 3 ? `top-${row.posicion}` : ""}>
                <td><span className="standings-position">{row.posicion}</span></td>
                <td><div className="standings-team">{row.logo ? <img src={row.logo} alt="" loading="lazy"/> : <span className="standings-logo-fallback">🏐</span>}<strong>{row.id_equipo}</strong></div></td>
                <td><b>{row.puntos}</b></td><td>{row.jugados}</td><td>{row.ganados}</td><td>{row.perdidos}</td>
                {advanced && <><td>{row.setGanados}</td><td>{row.setPerdidos}</td><td>{row.tantosGanados}</td><td>{row.tantosPerdidos}</td></>}
              </tr>)}
              {!rows.length && <tr><td colSpan={advanced ? 10 : 6} className="standings-empty">No Hay Equipos Que Coincidan Con La Búsqueda.</td></tr>}
            </tbody>
          </table>
        </div>}
      <div className="standings-foot">
        <span>PTS: Puntos · PJ: Jugados · PG: Ganados · PP: Perdidos</span>
        {advanced && <span>SG/SP: Sets Ganados/Perdidos · TF/TC: Tantos A Favor/En Contra</span>}
        <small>Fuente: {data?.source || "Courtrack · Federación Mendocina De Voleibol"}</small>
      </div>
    </div>
  </section>;
}
