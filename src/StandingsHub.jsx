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
    ["sub12", "Sub 12"],
    ["sub14", "Sub 14"],
    ["sub16", "Sub 16"],
    ["sub18", "Sub 18"],
    ["mayores", "Primera"],
  ],
  male: [
    ["sub14", "Sub 14"],
    ["sub16", "Sub 16"],
    ["sub18", "Sub 18"],
    ["mayores", "Primera"],
  ],
};

const DEFAULT_SELECTED = {
  female: ["sub14", "sub16", "sub18", "mayores"],
  male: ["sub14", "sub16", "sub18", "mayores"],
};

function localCategoryToStanding(category) {
  const rawName = String(category?.name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const compactName = rawName.replace(/[^A-Z0-9]/g, "");
  const rawGender = String(category?.gender || "").toLowerCase();
  const branch = ["female", "femenino", "femenina", "mujer", "f"].includes(rawGender)
    ? "female"
    : "male";

  let categoryKey = null;
  if (compactName.includes("SUB12")) categoryKey = "sub12";
  else if (compactName.includes("SUB14")) categoryKey = "sub14";
  else if (compactName.includes("SUB16")) categoryKey = "sub16";
  else if (compactName.includes("SUB18")) categoryKey = "sub18";
  else if (compactName.includes("PRIMERA") || compactName.includes("MAYORES") || compactName.includes("MAYOR")) categoryKey = "mayores";

  if (!categoryKey) return null;
  if (!CATEGORY_OPTIONS[branch]?.some(([value]) => value === categoryKey)) return null;
  return { branch, category: categoryKey };
}

function buildStandingsRestriction(allowedCategories, unrestricted) {
  const result = { female: new Set(), male: new Set() };

  if (unrestricted) {
    for (const branch of ["female", "male"]) {
      for (const [value] of CATEGORY_OPTIONS[branch]) result[branch].add(value);
    }
    return result;
  }

  for (const category of Array.isArray(allowedCategories) ? allowedCategories : []) {
    const mapped = localCategoryToStanding(category);
    if (mapped) result[mapped.branch].add(mapped.category);
  }

  return result;
}

function branchLabel(value) {
  return value === "female" ? "Femenino" : "Masculino";
}

function categoryLabel(branch, value) {
  return CATEGORY_OPTIONS[branch].find(([key]) => key === value)?.[1] || value;
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

function round1(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function buildAggregate(tables) {
  const byTeam = new Map();

  for (const table of tables) {
    for (const row of table.positions || []) {
      const team = String(row.id_equipo || "").trim();
      if (!team) continue;
      const current = byTeam.get(team) || {
        team,
        logo: row.logo || "",
        appearances: 0,
        positionSum: 0,
        pointsSum: 0,
        played: 0,
        won: 0,
        lost: 0,
        setsWon: 0,
        setsLost: 0,
        details: [],
      };
      current.appearances += 1;
      current.positionSum += Number(row.posicion || 0);
      current.pointsSum += Number(row.puntos || 0);
      current.played += Number(row.jugados || 0);
      current.won += Number(row.ganados || 0);
      current.lost += Number(row.perdidos || 0);
      current.setsWon += Number(row.setGanados || 0);
      current.setsLost += Number(row.setPerdidos || 0);
      current.logo = current.logo || row.logo || "";
      current.details.push({
        category: table.category,
        categoryLabel: table.categoryLabel,
        posicion: Number(row.posicion || 0),
        puntos: Number(row.puntos || 0),
        jugados: Number(row.jugados || 0),
        ganados: Number(row.ganados || 0),
        perdidos: Number(row.perdidos || 0),
        setGanados: Number(row.setGanados || 0),
        setPerdidos: Number(row.setPerdidos || 0),
      });
      byTeam.set(team, current);
    }
  }

  return [...byTeam.values()].map((row) => ({
    ...row,
    avgPosition: round1(row.positionSum / Math.max(1, row.appearances)),
    avgPoints: round1(row.pointsSum / Math.max(1, row.appearances)),
    winPct: row.played ? round1((row.won / row.played) * 100) : 0,
  })).sort((a, b) =>
    a.avgPosition - b.avgPosition ||
    b.winPct - a.winPct ||
    b.avgPoints - a.avgPoints ||
    a.team.localeCompare(b.team)
  ).map((row, index) => ({ ...row, computedRank: index + 1 }));
}

async function loadNativeTable(branch, category) {
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

  const payload = typeof response.data === "string"
    ? JSON.parse(response.data || "{}")
    : (response.data || {});

  if (response.status < 200 || response.status >= 300 || payload?.error) {
    throw new Error(payload?.message || `Courtrack Respondió HTTP ${response.status}.`);
  }

  const table = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (!table) throw new Error("No Se Encontró La Tabla Solicitada.");

  return {
    branch,
    category,
    categoryLabel: categoryLabel(branch, category),
    fetchedAt: new Date().toISOString(),
    tournamentId: Number(table.id_torneo || ids.tournamentId),
    stageId: Number(table.id_etapa || ids.stageId),
    stage: table.titulo || table.descripcion_etapa || "",
    division: table.division || "",
    positions: Array.isArray(table.posicionesObj) ? table.posicionesObj : [],
  };
}

async function loadWebTable(branch, category, signal) {
  const params = new URLSearchParams({ branch, category });
  const response = await fetch(`/api/courtrack-standings?${params.toString()}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(payload?.message || "No Se Pudo Actualizar La Tabla.");
  }
  return {
    ...payload,
    categoryLabel: categoryLabel(branch, category),
  };
}

export default function StandingsHub({ compact = false, allowedCategories = null, unrestricted = false }) {
  const [branch, setBranch] = useState("female");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState("MSM");
  const [advanced, setAdvanced] = useState(false);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const abortRef = useRef(null);

  const restriction = useMemo(
    () => buildStandingsRestriction(allowedCategories, unrestricted),
    [allowedCategories, unrestricted]
  );
  const accessSignature = useMemo(
    () => ["female", "male"].map((key) => `${key}:${[...restriction[key]].sort().join(",")}`).join("|"),
    [restriction]
  );
  const availableBranches = useMemo(
    () => ["female", "male"].filter((key) => restriction[key].size > 0),
    [accessSignature]
  );
  const options = useMemo(
    () => CATEGORY_OPTIONS[branch].filter(([value]) => restriction[branch]?.has(value)),
    [branch, accessSignature]
  );

  useEffect(() => {
    if (!availableBranches.length) {
      setSelectedCategories([]);
      setTables([]);
      setSelectedTeam("MSM");
      setLoading(false);
      return;
    }

    if (!availableBranches.includes(branch)) {
      setBranch(availableBranches[0]);
      return;
    }

    const permitted = options.map(([value]) => value);
    const defaults = unrestricted
      ? DEFAULT_SELECTED[branch].filter((value) => permitted.includes(value))
      : permitted;

    setSelectedCategories(defaults.length ? defaults : permitted.slice(0, 1));
    setSelectedTeam("MSM");
  }, [branch, accessSignature, unrestricted]);

  function toggleCategory(category) {
    setSelectedCategories((current) => {
      if (current.includes(category)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== category);
      }
      return [...current, category].sort((a, b) => {
        const order = options.map(([value]) => value);
        return order.indexOf(a) - order.indexOf(b);
      });
    });
  }

  async function load({ quiet = false } = {}) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setMessage("");

    try {
      const loader = Capacitor.isNativePlatform()
        ? (category) => loadNativeTable(branch, category)
        : (category) => loadWebTable(branch, category, controller.signal);

      const results = await Promise.allSettled(selectedCategories.map(loader));
      const ok = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
      const failed = results.filter((result) => result.status === "rejected");

      if (!ok.length) {
        throw new Error(failed[0]?.reason?.message || "No Se Pudieron Consultar Las Posiciones.");
      }

      setTables(ok);
      setLastUpdated(new Date().toISOString());
      if (failed.length) {
        setMessage(`Se Actualizaron ${ok.length} De ${selectedCategories.length} Categorías. Reintentá Para Completar Las Restantes.`);
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        setMessage(error?.message || "No Se Pudieron Actualizar Las Posiciones.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    if (!selectedCategories.length || !availableBranches.includes(branch)) {
      setTables([]);
      setLoading(false);
      setRefreshing(false);
      return undefined;
    }

    void load();
    const interval = window.setInterval(() => void load({ quiet: true }), 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load({ quiet: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      abortRef.current?.abort();
    };
  }, [branch, selectedCategories.join("|")]);

  const aggregate = useMemo(() => buildAggregate(tables), [tables]);
  const teams = useMemo(() => aggregate.map((row) => row.team), [aggregate]);

  useEffect(() => {
    if (selectedTeam !== "__ALL__" && !teams.includes(selectedTeam)) {
      setSelectedTeam(teams.includes("MSM") ? "MSM" : "__ALL__");
    }
  }, [teams.join("|")]);

  const selectedAggregate = useMemo(
    () => aggregate.find((row) => row.team === selectedTeam) || null,
    [aggregate, selectedTeam]
  );

  const comparisonRows = selectedTeam === "__ALL__" ? aggregate : selectedAggregate ? [selectedAggregate] : [];

  if (!availableBranches.length) {
    return <section className={`standings-page ${compact ? "compact" : ""}`}>
      <div className="standings-hero">
        <div>
          <span className="eyebrow">Federación Mendocina De Voleibol · Nivel 1</span>
          <h1>Posiciones y Comparativo Institucional</h1>
          <p>Las Tablas Se Muestran Según Las Categorías Autorizadas Para Tu Perfil.</p>
        </div>
      </div>
      <div className="card standings-no-access">
        <b>Sin Categorías De Nivel 1 Habilitadas Para Posiciones</b>
        <span>Cuando El Super Administrador Te Asigne Permisos Sobre Una Categoría Compatible, Su Tabla Aparecerá Automáticamente Acá.</span>
      </div>
    </section>;
  }

  return <section className={`standings-page ${compact ? "compact" : ""}`}>
    <div className="standings-hero">
      <div>
        <span className="eyebrow">Federación Mendocina De Voleibol · Nivel 1</span>
        <h1>Posiciones y Comparativo Institucional</h1>
        <p>Datos Oficiales Actualizados Y Resumen Comparativo Calculado Para Uso Institucional.</p>
      </div>
      <div className="standings-live">
        <span className={refreshing ? "pulse" : ""}>●</span>
        <div>
          <b>{refreshing ? "Actualizando..." : "Actualización Automática"}</b>
          <small>Cada 60 Segundos · Última Consulta {formatTime(lastUpdated)}</small>
        </div>
      </div>
    </div>

    <div className="standings-controls card">
      <label>Rama
        <select value={branch} onChange={(event) => setBranch(event.target.value)}>
          {availableBranches.map((value) => <option key={value} value={value}>{branchLabel(value)}</option>)}
        </select>
      </label>

      <label>Equipo
        <select value={selectedTeam} onChange={(event) => setSelectedTeam(event.target.value)}>
          <option value="__ALL__">Todos Los Equipos</option>
          {teams.map((team) => <option key={team} value={team}>{team}</option>)}
        </select>
      </label>

      <div className="standings-category-picker">
        <span>Categorías Incluidas</span>
        <div className="standings-category-chips">
          {options.map(([value, label]) => <button
            type="button"
            key={value}
            className={selectedCategories.includes(value) ? "active" : ""}
            onClick={() => toggleCategory(value)}
          >{label}</button>)}
        </div>
      </div>

      <button type="button" className="standings-refresh" onClick={() => void load({ quiet: true })} disabled={refreshing}>
        <span className={refreshing ? "spinning" : ""}>↻</span> {refreshing ? "Actualizando..." : "Actualizar Ahora"}
      </button>
    </div>

    {message && <div className="message standings-message">{message}</div>}

    {!loading && selectedTeam !== "__ALL__" && selectedAggregate && <div className="standings-summary">
      <div className="card standings-msm-card"><span>Equipo</span><b>{selectedAggregate.team}</b></div>
      <div className="card standings-msm-card"><span>Posición Promedio</span><b>{selectedAggregate.avgPosition}</b></div>
      <div className="card"><span>Puntos Promedio</span><b>{selectedAggregate.avgPoints}</b></div>
      <div className="card"><span>% De Victorias</span><b>{selectedAggregate.winPct}%</b></div>
    </div>}

    {!loading && selectedTeam !== "__ALL__" && selectedAggregate && <div className="standings-card card">
      <div className="standings-card-head">
        <div>
          <h2>{selectedAggregate.team} · Rendimiento Por Categoría</h2>
          <p>Promedios calculados solamente sobre las categorías seleccionadas donde participa el equipo.</p>
        </div>
      </div>
      <div className="standings-table-wrap">
        <table className="standings-table">
          <thead><tr><th>Categoría</th><th>Pos.</th><th>PTS</th><th>PJ</th><th>PG</th><th>PP</th><th>%V</th></tr></thead>
          <tbody>{selectedAggregate.details.map((row) => <tr key={row.category}>
            <td><strong>{row.categoryLabel}</strong></td>
            <td>{row.posicion}</td>
            <td>{row.puntos}</td>
            <td>{row.jugados}</td>
            <td>{row.ganados}</td>
            <td>{row.perdidos}</td>
            <td>{row.jugados ? round1((row.ganados / row.jugados) * 100) : 0}%</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}

    <div className="standings-card card">
      <div className="standings-card-head">
        <div>
          <h2>{selectedTeam === "__ALL__" ? "Comparativo General De Instituciones" : "Resumen Comparativo"}</h2>
          <p>
            {selectedTeam === "__ALL__"
              ? `Promedio combinado de ${selectedCategories.map((item) => categoryLabel(branch, item)).join(", ")}. No reemplaza las tablas oficiales por categoría.`
              : `Comparación calculada sobre ${selectedAggregate?.appearances || 0} categorías con participación.`}
          </p>
        </div>
        <label className="standings-advanced">
          <input type="checkbox" checked={advanced} onChange={(event) => setAdvanced(event.target.checked)}/>
          Estadísticas Avanzadas
        </label>
      </div>

      {loading ? <div className="standings-loading">Consultando Las Tablas Oficiales...</div> :
        <div className="standings-table-wrap">
          <table className={`standings-table ${advanced ? "is-advanced" : ""}`}>
            <thead><tr>
              {selectedTeam === "__ALL__" && <th>#</th>}
              <th>Equipo</th>
              <th>Cat.</th>
              <th>Pos. Prom.</th>
              <th>PTS Prom.</th>
              <th>%V</th>
              {advanced && <><th>PJ</th><th>PG</th><th>PP</th><th>SG</th><th>SP</th></>}
            </tr></thead>
            <tbody>
              {comparisonRows.map((row) => <tr key={row.team} className={row.team === "MSM" ? "is-msm" : ""}>
                {selectedTeam === "__ALL__" && <td><span className="standings-position">{row.computedRank}</span></td>}
                <td><div className="standings-team">{row.logo ? <img src={row.logo} alt="" loading="lazy"/> : null}<strong>{row.team}</strong></div></td>
                <td>{row.appearances}</td>
                <td><b>{row.avgPosition}</b></td>
                <td>{row.avgPoints}</td>
                <td>{row.winPct}%</td>
                {advanced && <><td>{row.played}</td><td>{row.won}</td><td>{row.lost}</td><td>{row.setsWon}</td><td>{row.setsLost}</td></>}
              </tr>)}
            </tbody>
          </table>
        </div>}

      <div className="standings-foot">
        <span><b>Pos. Prom.</b>: promedio aritmético de la posición del equipo en cada categoría seleccionada.</span>
        <span><b>PTS Prom.</b>: promedio de puntos oficiales entre las categorías donde participa.</span>
        <span><b>%V</b>: victorias totales ÷ partidos jugados totales.</span>
        <small>Fuente De Datos: Courtrack · Federación Mendocina De Voleibol. El Comparativo General Es Un Cálculo Institucional Propio.</small>
      </div>
    </div>

    <div className="standings-official-grid">
      {tables.map((table) => <div className="standings-card card" key={table.category}>
        <div className="standings-card-head">
          <div>
            <h2>{table.categoryLabel} · Tabla Oficial</h2>
            <p>{table.stage || table.division || branchLabel(branch)}</p>
          </div>
        </div>
        <div className="standings-table-wrap">
          <table className="standings-table">
            <thead><tr><th>Pos.</th><th>Equipo</th><th>PTS</th><th>PJ</th><th>PG</th><th>PP</th></tr></thead>
            <tbody>{table.positions.map((row) => <tr key={`${table.category}:${row.id_equipo}`} className={String(row.id_equipo).toUpperCase() === "MSM" ? "is-msm" : ""}>
              <td><span className="standings-position">{row.posicion}</span></td>
              <td><div className="standings-team">{row.logo ? <img src={row.logo} alt="" loading="lazy"/> : null}<strong>{row.id_equipo}</strong></div></td>
              <td><b>{row.puntos}</b></td><td>{row.jugados}</td><td>{row.ganados}</td><td>{row.perdidos}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>)}
    </div>
  </section>;
}
