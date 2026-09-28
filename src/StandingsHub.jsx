import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor, CapacitorHttp } from "@capacitor/core";

const TABLE_CATALOG = [
  { key: "female:level1:sub12", branch: "female", competition: "level1", category: "sub12", apiCategory: "sub12", label: "Sub 12", tournamentId: 897, stageId: 3640 },
  { key: "female:level1:sub14", branch: "female", competition: "level1", category: "sub14", apiCategory: "sub14", label: "Sub 14", tournamentId: 898, stageId: 3641 },
  { key: "female:level1:sub16", branch: "female", competition: "level1", category: "sub16", apiCategory: "sub16", label: "Sub 16", tournamentId: 899, stageId: 3642 },
  { key: "female:level1:sub18", branch: "female", competition: "level1", category: "sub18", apiCategory: "sub18", label: "Sub 18", tournamentId: 900, stageId: 3643 },
  { key: "female:level1:mayores", branch: "female", competition: "level1", category: "mayores", apiCategory: "mayores", label: "Primera", tournamentId: 901, stageId: 3644 },

  { key: "male:level1:sub14", branch: "male", competition: "level1", category: "sub14", apiCategory: "sub14", label: "Sub 14", tournamentId: 896, stageId: 3639 },
  { key: "male:level1:sub16", branch: "male", competition: "level1", category: "sub16", apiCategory: "sub16", label: "Sub 16", tournamentId: 895, stageId: 3638 },
  { key: "male:level1:sub18", branch: "male", competition: "level1", category: "sub18", apiCategory: "sub18", label: "Sub 18", tournamentId: 894, stageId: 3637 },
  { key: "male:level1:mayores", branch: "male", competition: "level1", category: "mayores", apiCategory: "mayores", label: "Primera", tournamentId: 893, stageId: 3636 },

  { key: "female:level3:sub12", branch: "female", competition: "level3", category: "sub12", apiCategory: "n3_sub12", label: "Sub 12", tournamentId: 915, stageId: 3694 },
  { key: "female:level3:sub14a", branch: "female", competition: "level3", category: "sub14a", apiCategory: "n3_sub14_a", label: "Sub 14 · Zona A", tournamentId: 913, stageId: 3691 },
  { key: "female:level3:sub14b", branch: "female", competition: "level3", category: "sub14b", apiCategory: "n3_sub14_b", label: "Sub 14 · Zona B", tournamentId: 913, stageId: 3692 },
  { key: "female:level3:sub16", branch: "female", competition: "level3", category: "sub16", apiCategory: "n3_sub16", label: "Sub 16", tournamentId: 914, stageId: 3693 },
  { key: "female:level3:sub18", branch: "female", competition: "level3", category: "sub18", apiCategory: "n3_sub18", label: "Sub 18", tournamentId: 912, stageId: 3690 },
  { key: "female:level3:mayores", branch: "female", competition: "level3", category: "mayores", apiCategory: "n3_mayores", label: "Primera", tournamentId: 906, stageId: 3679 },

  { key: "female:master:master_a", branch: "female", competition: "master", category: "master_a", apiCategory: "master_a", label: "Master A", tournamentId: 886, stageId: 3626 },
  { key: "female:master:master_c", branch: "female", competition: "master", category: "master_c", apiCategory: "master_c", label: "Master C", tournamentId: 888, stageId: 3628 },
];

const DEFAULT_SELECTED = {
  "female:level1": ["female:level1:sub14", "female:level1:sub16", "female:level1:sub18", "female:level1:mayores"],
  "male:level1": ["male:level1:sub14", "male:level1:sub16", "male:level1:sub18", "male:level1:mayores"],
  "female:level3": [],
  "female:master": [],
};

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function branchLabel(value) {
  return value === "female" ? "Femenino" : "Masculino";
}

function competitionLabel(value) {
  if (value === "level3") return "Nivel 3";
  if (value === "master") return "Master";
  return "Nivel 1";
}

function institutionTeamKey(value) {
  const team = String(value || "").trim().toUpperCase();
  return team === "MSM" || team === "MSM B" ? "MSM" : String(value || "").trim();
}

function permissionKeysForCategory(category) {
  const name = normalizeName(category?.name);
  const compact = name.replace(/[^A-Z0-9]/g, "");
  const rawGender = String(category?.gender || "").toLowerCase();
  const branch = ["female", "femenino", "femenina", "mujer", "f"].includes(rawGender) ? "female" : "male";

  if (branch === "female" && compact === "MASTERA") return ["female:master:master_a"];
  if (branch === "female" && compact === "MASTERC") return ["female:master:master_c"];

  const isLevel3Team = branch === "female" && /B$/.test(compact);
  let ageKey = null;
  if (compact.includes("SUB12")) ageKey = "sub12";
  else if (compact.includes("SUB14")) ageKey = "sub14";
  else if (compact.includes("SUB16")) ageKey = "sub16";
  else if (compact.includes("SUB18")) ageKey = "sub18";
  else if (compact.includes("PRIMERA") || compact.includes("MAYORES") || compact.includes("MAYOR")) ageKey = "mayores";

  if (!ageKey) return [];

  if (isLevel3Team) {
    if (ageKey === "sub14") {
      return ["female:level3:sub14a", "female:level3:sub14b"];
    }
    const key = `female:level3:${ageKey}`;
    return TABLE_CATALOG.some((item) => item.key === key) ? [key] : [];
  }

  const key = `${branch}:level1:${ageKey}`;
  return TABLE_CATALOG.some((item) => item.key === key) ? [key] : [];
}

function buildAllowedKeys(allowedCategories, unrestricted) {
  if (unrestricted) return new Set(TABLE_CATALOG.map((item) => item.key));
  const result = new Set();
  for (const category of Array.isArray(allowedCategories) ? allowedCategories : []) {
    for (const key of permissionKeysForCategory(category)) result.add(key);
  }
  return result;
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
      const team = institutionTeamKey(row.id_equipo);
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
        tableKey: table.tableKey,
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

async function loadNativeTable(entry) {
  const response = await CapacitorHttp.get({
    url: "https://api.courtrack.com/api/torneo/getPosiciones",
    params: {
      id_torneos: String(entry.tournamentId),
      id_etapas: String(entry.stageId),
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
    branch: entry.branch,
    competition: entry.competition,
    category: entry.apiCategory,
    tableKey: entry.key,
    categoryLabel: entry.label,
    fetchedAt: new Date().toISOString(),
    tournamentId: Number(table.id_torneo || entry.tournamentId),
    stageId: Number(table.id_etapa || entry.stageId),
    stage: table.titulo || table.descripcion_etapa || "",
    division: table.division || "",
    positions: Array.isArray(table.posicionesObj) ? table.posicionesObj : [],
  };
}

async function loadWebTable(entry, signal) {
  const params = new URLSearchParams({ branch: entry.branch, category: entry.apiCategory });
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
    tableKey: entry.key,
    competition: entry.competition,
    categoryLabel: entry.label,
  };
}

export default function StandingsHub({ compact = false, allowedCategories = null, unrestricted = false }) {
  const allowedKeys = useMemo(
    () => buildAllowedKeys(allowedCategories, unrestricted),
    [allowedCategories, unrestricted]
  );
  const accessSignature = useMemo(
    () => [...allowedKeys].sort().join("|"),
    [allowedKeys]
  );
  const availableEntries = useMemo(
    () => TABLE_CATALOG.filter((item) => allowedKeys.has(item.key)),
    [accessSignature]
  );
  const availableCompetitions = useMemo(
    () => ["level1", "level3", "master"].filter((value) => availableEntries.some((item) => item.competition === value)),
    [accessSignature]
  );

  const [competition, setCompetition] = useState("level1");
  const [branch, setBranch] = useState("female");
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState("MSM");
  const [advanced, setAdvanced] = useState(false);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const abortRef = useRef(null);

  const availableBranches = useMemo(
    () => ["female", "male"].filter((value) =>
      availableEntries.some((item) => item.competition === competition && item.branch === value)
    ),
    [competition, accessSignature]
  );

  const options = useMemo(
    () => availableEntries.filter((item) => item.competition === competition && item.branch === branch),
    [competition, branch, accessSignature]
  );

  useEffect(() => {
    if (!availableCompetitions.length) {
      setSelectedKeys([]);
      setTables([]);
      setLoading(false);
      return;
    }
    if (!availableCompetitions.includes(competition)) {
      setCompetition(availableCompetitions[0]);
    }
  }, [accessSignature, competition]);

  useEffect(() => {
    if (!availableBranches.length) {
      setSelectedKeys([]);
      return;
    }
    if (!availableBranches.includes(branch)) {
      setBranch(availableBranches[0]);
      return;
    }

    const permitted = options.map((item) => item.key);
    const defaultKey = `${branch}:${competition}`;
    const configuredDefaults = DEFAULT_SELECTED[defaultKey] || [];
    const defaults = unrestricted && configuredDefaults.length
      ? configuredDefaults.filter((key) => permitted.includes(key))
      : permitted;

    setSelectedKeys(defaults.length ? defaults : permitted.slice(0, 1));
    setSelectedTeam("MSM");
  }, [competition, branch, accessSignature, unrestricted]);

  function toggleCategory(key) {
    setSelectedKeys((current) => {
      if (current.includes(key)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== key);
      }
      const order = options.map((item) => item.key);
      return [...current, key].sort((a, b) => order.indexOf(a) - order.indexOf(b));
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
      const selectedEntries = options.filter((item) => selectedKeys.includes(item.key));
      const loader = Capacitor.isNativePlatform()
        ? (entry) => loadNativeTable(entry)
        : (entry) => loadWebTable(entry, controller.signal);

      const results = await Promise.allSettled(selectedEntries.map(loader));
      let ok = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
      const failed = results.filter((result) => result.status === "rejected");

      if (!unrestricted && competition === "level3") {
        const sub14Tables = ok.filter((table) => ["female:level3:sub14a", "female:level3:sub14b"].includes(table.tableKey));
        if (sub14Tables.length > 1) {
          const institutionalZones = sub14Tables.filter((table) =>
            (table.positions || []).some((row) => institutionTeamKey(row.id_equipo) === "MSM")
          );
          if (institutionalZones.length) {
            ok = ok.filter((table) =>
              !["female:level3:sub14a", "female:level3:sub14b"].includes(table.tableKey) ||
              institutionalZones.some((zone) => zone.tableKey === table.tableKey)
            );
          }
        }
      }

      if (!ok.length) {
        throw new Error(failed[0]?.reason?.message || "No Se Pudieron Consultar Las Posiciones.");
      }

      setTables(ok);
      setLastUpdated(new Date().toISOString());
      if (failed.length) {
        setMessage(`Se Actualizaron ${ok.length} De ${selectedEntries.length} Tablas. Reintentá Para Completar Las Restantes.`);
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
    if (!selectedKeys.length || !availableBranches.includes(branch)) {
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
  }, [competition, branch, selectedKeys.join("|")]);

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
  const selectedLabels = options.filter((item) => selectedKeys.includes(item.key)).map((item) => item.label);

  if (!availableEntries.length) {
    return <section className={`standings-page ${compact ? "compact" : ""}`}>
      <div className="standings-hero">
        <div>
          <span className="eyebrow">Federación Mendocina De Voleibol</span>
          <h1>Posiciones y Comparativo Institucional</h1>
          <p>Las Tablas Se Muestran Según Las Categorías Autorizadas Para Tu Perfil.</p>
        </div>
      </div>
      <div className="card standings-no-access">
        <b>Sin Categorías Habilitadas Para Posiciones</b>
        <span>Cuando El Super Administrador Te Asigne Permisos Sobre Una Categoría Compatible, Su Tabla Aparecerá Automáticamente Acá.</span>
      </div>
    </section>;
  }

  return <section className={`standings-page ${compact ? "compact" : ""}`}>
    <div className="standings-hero">
      <div>
        <span className="eyebrow">Federación Mendocina De Voleibol · {competitionLabel(competition)}</span>
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
      <label>Competencia
        <select value={competition} onChange={(event) => setCompetition(event.target.value)}>
          {availableCompetitions.map((value) => <option key={value} value={value}>{competitionLabel(value)}</option>)}
        </select>
      </label>

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
          {options.map((item) => <button
            type="button"
            key={item.key}
            className={selectedKeys.includes(item.key) ? "active" : ""}
            onClick={() => toggleCategory(item.key)}
          >{item.label}</button>)}
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
          <tbody>{selectedAggregate.details.map((row) => <tr key={row.tableKey}>
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
              ? `Promedio combinado de ${selectedLabels.join(", ")}. No reemplaza las tablas oficiales por categoría.`
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
      {tables.map((table) => <div className="standings-card card" key={table.tableKey}>
        <div className="standings-card-head">
          <div>
            <h2>{table.categoryLabel} · Tabla Oficial</h2>
            <p>{table.stage || table.division || branchLabel(branch)}</p>
          </div>
        </div>
        <div className="standings-table-wrap">
          <table className="standings-table">
            <thead><tr><th>Pos.</th><th>Equipo</th><th>PTS</th><th>PJ</th><th>PG</th><th>PP</th></tr></thead>
            <tbody>{table.positions.map((row) => <tr key={`${table.tableKey}:${row.id_equipo}`} className={institutionTeamKey(row.id_equipo) === "MSM" ? "is-msm" : ""}>
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
