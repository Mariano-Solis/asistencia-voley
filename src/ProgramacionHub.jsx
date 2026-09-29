import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { exportProgrammingWorkbook } from "./xlsxCategoryExport";

const API_PATH = "/api/fmv-programacion";
const NATIVE_API = "https://www.voleysanmartin.com.ar/api/fmv-programacion";

function normalizeName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function categoryPermissionKeys(category) {
  const name = normalizeName(category?.name);
  const gender = String(category?.gender || "").toLowerCase();
  const branch = ["female","femenino","femenina","mujer","f"].includes(gender) ? "female" : "male";

  if (branch === "female" && name === "MASTERA") return ["female:master:master_a"];
  if (branch === "female" && name === "MASTERC") return ["female:master:master_c"];

  if (branch === "female" && name === "SUB12B") return ["female:level3:sub12"];
  if (branch === "female" && name === "SUB14B") return ["female:level3:sub14b"];

  let key = "";
  if (name.includes("SUB12")) key = "sub12";
  else if (name.includes("SUB14")) key = "sub14";
  else if (name.includes("SUB16")) key = "sub16";
  else if (name.includes("SUB18")) key = "sub18";
  else if (name.includes("PRIMERA") || name.includes("MAYORES") || name.includes("MAYOR")) key = "mayores";

  return key ? [`${branch}:level1:${key}`] : [];
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

function displayTeam(value) {
  const team = String(value || "").trim();
  return team === "MSM B" ? "MSM B" : team;
}

function matchBranch(match) {
  return String(match?.permissionKey || "").startsWith("female:") ? "female" : "male";
}

function branchLabel(branch) {
  return branch === "female" ? "Femenino" : "Masculino";
}

function exportDateText() {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Mendoza",
  }).format(new Date());
}

export default function ProgramacionHub({ allowedCategories = null, unrestricted = false, compact = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [exportRoundIds, setExportRoundIds] = useState([]);
  const [exportBranches, setExportBranches] = useState(["female", "male"]);
  const [exportCategoryKeys, setExportCategoryKeys] = useState([]);
  const [exportMessage, setExportMessage] = useState("");
  const [fixtureBranch, setFixtureBranch] = useState("all");
  const [fixtureCategory, setFixtureCategory] = useState("all");
  const [fixtureOpponent, setFixtureOpponent] = useState("all");
  const abortRef = useRef(null);

  const allowedKeys = useMemo(() => {
    if (unrestricted) return null;
    const set = new Set();
    for (const category of Array.isArray(allowedCategories) ? allowedCategories : []) {
      for (const key of categoryPermissionKeys(category)) set.add(key);
    }
    return set;
  }, [allowedCategories, unrestricted]);

  async function load({ quiet = false } = {}) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    quiet ? setRefreshing(true) : setLoading(true);
    setMessage("");

    try {
      let payload;
      if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.get({
          url: NATIVE_API,
          headers: { Accept: "application/json" },
          connectTimeout: 12000,
          readTimeout: 12000,
        });
        payload = typeof response.data === "string" ? JSON.parse(response.data || "{}") : (response.data || {});
        if (response.status < 200 || response.status >= 300) throw new Error(payload?.message || "No Se Pudo Actualizar La Programación.");
      } else {
        const response = await fetch(API_PATH, { signal: controller.signal, headers: { Accept: "application/json" } });
        payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || "No Se Pudo Actualizar La Programación.");
      }

      if (payload?.error) throw new Error(payload.message || "No Se Pudo Actualizar La Programación.");
      setData(payload);
    } catch (error) {
      const text = String(error?.message || "").toLowerCase();
      if (error?.name !== "AbortError" && !text.includes("abort")) {
        setMessage(error?.message || "No Se Pudo Actualizar La Programación.");
      }
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
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      abortRef.current?.abort();
    };
  }, []);

  const rounds = useMemo(() => {
    const source = Array.isArray(data?.rounds) ? data.rounds : [];
    return source.map((round) => {
      const matches = Array.isArray(round.matches) ? round.matches : [];
      return {
        ...round,
        matches: unrestricted || !allowedKeys
          ? matches
          : matches.filter((match) => allowedKeys.has(match.permissionKey)),
      };
    });
  }, [data, unrestricted, allowedKeys]);

  const latestRound = rounds.length ? Math.max(...rounds.map((round) => Number(round.round || 0))) : null;

  const remainingFixtures = useMemo(() => {
    const source = Array.isArray(data?.remainingFixtures) ? data.remainingFixtures : [];
    return unrestricted || !allowedKeys
      ? source
      : source.filter((match) => allowedKeys.has(match.permissionKey));
  }, [data, unrestricted, allowedKeys]);

  const fixtureCategories = useMemo(() => {
    const map = new Map();
    for (const match of remainingFixtures) {
      if (!match?.permissionKey) continue;
      const branch = matchBranch(match);
      if (fixtureBranch !== "all" && branch !== fixtureBranch) continue;
      if (!map.has(match.permissionKey)) {
        map.set(match.permissionKey, { key: match.permissionKey, label: match.categoryLabel || match.permissionKey, branch });
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [remainingFixtures, fixtureBranch]);

  const fixtureOpponents = useMemo(() => {
    const set = new Set();
    for (const match of remainingFixtures) {
      const branch = matchBranch(match);
      if (fixtureBranch !== "all" && branch !== fixtureBranch) continue;
      if (fixtureCategory !== "all" && match.permissionKey !== fixtureCategory) continue;
      if (match.opponent) set.add(match.opponent);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [remainingFixtures, fixtureBranch, fixtureCategory]);

  const filteredFixtures = useMemo(() => remainingFixtures.filter((match) => {
    const branch = matchBranch(match);
    if (fixtureBranch !== "all" && branch !== fixtureBranch) return false;
    if (fixtureCategory !== "all" && match.permissionKey !== fixtureCategory) return false;
    if (fixtureOpponent !== "all" && match.opponent !== fixtureOpponent) return false;
    return true;
  }), [remainingFixtures, fixtureBranch, fixtureCategory, fixtureOpponent]);

  const fixtureStatusCounts = useMemo(() => ({
    reprogramming: filteredFixtures.filter((match) => match.scheduleState === "reprogramming").length,
    scheduled: filteredFixtures.filter((match) => match.scheduleState === "scheduled").length,
    unscheduled: filteredFixtures.filter((match) => match.scheduleState === "unscheduled").length,
  }), [filteredFixtures]);

  useEffect(() => {
    if (fixtureCategory !== "all" && !fixtureCategories.some((item) => item.key === fixtureCategory)) {
      setFixtureCategory("all");
    }
  }, [fixtureBranch, fixtureCategories, fixtureCategory]);

  useEffect(() => {
    if (fixtureOpponent !== "all" && !fixtureOpponents.includes(fixtureOpponent)) {
      setFixtureOpponent("all");
    }
  }, [fixtureCategory, fixtureBranch, fixtureOpponents, fixtureOpponent]);

  const exportCategories = useMemo(() => {
    const byKey = new Map();
    rounds.forEach((round) => {
      round.matches.forEach((match) => {
        if (!match?.permissionKey) return;
        byKey.set(match.permissionKey, {
          key: match.permissionKey,
          label: match.categoryLabel || match.permissionKey,
          branch: matchBranch(match),
        });
      });
    });
    return [...byKey.values()].sort((a, b) => {
      if (a.branch !== b.branch) return a.branch === "female" ? -1 : 1;
      return a.label.localeCompare(b.label, "es");
    });
  }, [rounds]);

  const exportPreview = useMemo(() => {
    const selectedRounds = new Set(exportRoundIds.map(Number));
    const selectedBranches = new Set(exportBranches);
    const selectedCategories = new Set(exportCategoryKeys);
    return rounds
      .filter((round) => selectedRounds.has(Number(round.round)))
      .map((round) => ({
        ...round,
        matches: round.matches.filter((match) =>
          selectedBranches.has(matchBranch(match)) &&
          selectedCategories.has(match.permissionKey)
        ),
      }))
      .filter((round) => round.matches.length > 0);
  }, [rounds, exportRoundIds, exportBranches, exportCategoryKeys]);

  const exportMatchCount = exportPreview.reduce((sum, round) => sum + round.matches.length, 0);

  function openExportPanel() {
    setExportRoundIds(rounds.map((round) => Number(round.round)));
    setExportBranches(["female", "male"]);
    setExportCategoryKeys(exportCategories.map((category) => category.key));
    setExportMessage("");
    setShowExport(true);
  }

  function toggleExportRound(round) {
    const value = Number(round);
    setExportRoundIds((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort((a, b) => a - b)
    );
  }

  function toggleExportBranch(branch) {
    setExportBranches((current) =>
      current.includes(branch) ? current.filter((item) => item !== branch) : [...current, branch]
    );
  }

  const exportRoundMode = exportRoundIds.length === rounds.length
    ? "all"
    : exportRoundIds.length === 1 ? String(exportRoundIds[0]) : "custom";

  const exportBranchMode = exportBranches.length === 2
    ? "all"
    : exportBranches.length === 1 ? exportBranches[0] : "none";

  const selectedCategoryCount = exportCategories.filter((category) =>
    exportCategoryKeys.includes(category.key) && exportBranches.includes(category.branch)
  ).length;

  const categorySummary = selectedCategoryCount === 0
    ? "Elegir Categorías"
    : selectedCategoryCount === exportCategories.filter((category) => exportBranches.includes(category.branch)).length
      ? "Todas Las Categorías"
      : selectedCategoryCount === 1
        ? exportCategories.find((category) => exportCategoryKeys.includes(category.key) && exportBranches.includes(category.branch))?.label || "1 Categoría"
        : `${selectedCategoryCount} Categorías Seleccionadas`;

  function changeRoundMode(value) {
    setExportMessage("");
    if (value === "all") {
      setExportRoundIds(rounds.map((round) => Number(round.round)));
      return;
    }
    const round = Number(value);
    setExportRoundIds(Number.isFinite(round) ? [round] : []);
  }

  function changeBranchMode(value) {
    setExportMessage("");
    if (value === "all") {
      setExportBranches(["female", "male"]);
      setExportCategoryKeys(exportCategories.map((category) => category.key));
      return;
    }
    if (value === "female" || value === "male") {
      setExportBranches([value]);
      setExportCategoryKeys(exportCategories.filter((category) => category.branch === value).map((category) => category.key));
      return;
    }
    setExportBranches([]);
    setExportCategoryKeys([]);
  }

  function toggleExportCategory(key) {
    setExportMessage("");
    setExportCategoryKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  function exportXlsx() {
    if (!exportMatchCount) {
      setExportMessage("Elegí Al Menos Una Fecha, Rama y Categoría Con Partidos Para Exportar.");
      return;
    }

    const roundText = exportPreview.map((round) => `Fecha ${round.round}`).join(" y ");
    const activeBranches = ["female", "male"].filter((branch) => exportBranches.includes(branch));
    const branchText = activeBranches.length === 2 ? "Ambas Ramas" : activeBranches.map(branchLabel).join(", ");
    const selectedVisibleCategories = exportCategories.filter((category) =>
      exportCategoryKeys.includes(category.key) && exportBranches.includes(category.branch)
    );
    const categoryText = selectedVisibleCategories.length === exportCategories.filter((category) => exportBranches.includes(category.branch)).length
      ? "Todas Las Categorías Seleccionadas"
      : selectedVisibleCategories.map((category) => category.label).join(", ");

    const selectionText = `${roundText} · ${branchText} · ${categoryText}`;
    const filenameRounds = exportPreview.map((round) => round.round).join("-");
    exportProgrammingWorkbook({
      appName: "Municipalidad De San Martín - VOLEY",
      title: "Programación Institucional · #VamosElPoli",
      exportDate: exportDateText(),
      selectionText,
      rounds: exportPreview,
      sourceText: "Fuente: Federación Mendocina De Voleibol · Programación Oficial Del Torneo Clausura. Los Registros Tentativos Pueden Modificarse Hasta Su Confirmación.",
      filename: `programacion-msm-fechas-${filenameRounds}.xlsx`,
    });
    setExportMessage(`Excel Generado Con ${exportMatchCount} Partido${exportMatchCount === 1 ? "" : "s"}.`);
  }

  return <section className={`programacion-page ${compact ? "compact" : ""}`}>
    <div className="programacion-hero">
      <div>
        <span className="eyebrow">Federación Mendocina De Voleibol</span>
        <h1>Programación MSM</h1>
        <p>Últimas Dos Fechas Del Torneo Clausura, Filtradas Exclusivamente Para Municipalidad De San Martín.</p>
      </div>
      <div className="programacion-live">
        <span className={refreshing ? "pulse" : ""}>●</span>
        <div>
          <b>{refreshing ? "Actualizando..." : "Actualización Automática"}</b>
          <small>Cada 60 Segundos · Última Consulta {formatTime(data?.fetchedAt)}</small>
        </div>
      </div>
    </div>

    <button type="button" className="programacion-refresh" onClick={() => void load({ quiet: true })} disabled={refreshing}>
      <span className={refreshing ? "spinning" : ""}>↻</span>
      {refreshing ? "Actualizando..." : "Actualizar Programación"}
    </button>

    <button type="button" className="programacion-export-open" onClick={() => showExport ? setShowExport(false) : openExportPanel()} disabled={!rounds.length}>
      <span>📊</span>
      {showExport ? "Cerrar Exportación" : "Exportar Programación A Excel"}
    </button>

    {showExport && <section className="programacion-export-card card">
      <div className="programacion-export-head">
        <div>
          <span className="programacion-kicker">Exportación Institucional</span>
          <h2>Preparar Planilla XLSX</h2>
          <p>Elegí Qué Querés Exportar. Los Selectores Se Mantienen Compactos Para Que La Pantalla Sea Clara y Ordenada.</p>
        </div>
        <span className="programacion-export-count">{exportMatchCount} Partido{exportMatchCount === 1 ? "" : "s"}</span>
      </div>

      <div className="programacion-export-selectors">
        <label>
          <span>Fecha</span>
          <select value={exportRoundMode} onChange={(event) => changeRoundMode(event.target.value)}>
            <option value="all">Ambas Fechas</option>
            {rounds.map((round) => <option key={round.round} value={String(round.round)}>
              Fecha {round.round} · {round.matches.length > 0 && round.matches.every((match) => match.confirmed) ? "Confirmada" : "Tentativa"}
            </option>)}
          </select>
        </label>

        <label>
          <span>Rama</span>
          <select value={exportBranchMode} onChange={(event) => changeBranchMode(event.target.value)}>
            <option value="all">Femenino y Masculino</option>
            <option value="female">Solo Femenino</option>
            <option value="male">Solo Masculino</option>
          </select>
        </label>

        <div className="programacion-export-category-selector">
          <span>Categorías</span>
          <details className="programacion-category-dropdown">
            <summary>
              <strong>{categorySummary}</strong>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="programacion-category-dropdown-menu">
              <div className="programacion-category-dropdown-actions">
                <button type="button" onClick={() => setExportCategoryKeys(exportCategories.filter((category) => exportBranches.includes(category.branch)).map((category) => category.key))}>Todas</button>
                <button type="button" onClick={() => setExportCategoryKeys([])}>Ninguna</button>
              </div>
              <div className="programacion-category-dropdown-list">
                {exportCategories
                  .filter((category) => exportBranches.includes(category.branch))
                  .map((category) => <label key={category.key} className={exportCategoryKeys.includes(category.key) ? "selected" : ""}>
                    <input
                      type="checkbox"
                      checked={exportCategoryKeys.includes(category.key)}
                      onChange={() => toggleExportCategory(category.key)}
                    />
                    <span>{category.label}</span>
                    <small>{branchLabel(category.branch)}</small>
                  </label>)}
              </div>
            </div>
          </details>
        </div>
      </div>

      <div className="programacion-export-summary-line">
        <span>{exportRoundIds.length === rounds.length ? "Ambas Fechas" : exportRoundIds.map((round) => `Fecha ${round}`).join(", ") || "Sin Fecha"}</span>
        <span>{exportBranches.length === 2 ? "Ambas Ramas" : exportBranches.map(branchLabel).join(", ") || "Sin Rama"}</span>
        <span>{selectedCategoryCount} Categoría{selectedCategoryCount === 1 ? "" : "s"}</span>
      </div>

      <div className="programacion-export-actions">
        <div>
          <b>{exportMatchCount ? `Se Exportarán ${exportMatchCount} Partido${exportMatchCount === 1 ? "" : "s"}` : "No Hay Partidos En La Selección"}</b>
          <small>Formato XLSX · Diseño Institucional · Preparado Para Impresión Horizontal</small>
        </div>
        <button type="button" onClick={exportXlsx} disabled={!exportMatchCount}>⬇ Exportar XLSX</button>
      </div>

      {exportMessage && <div className="programacion-export-message">{exportMessage}</div>}
    </section>}

    {message && <div className="programacion-message">{message}</div>}

    {loading && !data ? <div className="card programacion-loading">Consultando La Programación Oficial...</div> : null}

    {!loading && rounds.map((round) => {
      const isLatest = Number(round.round) === latestRound;
      const visibleConfirmed = round.matches.length > 0 && round.matches.every((match) => match.confirmed);
      const status = visibleConfirmed ? "Confirmada" : "Tentativa";

      return <article key={round.round} className={`programacion-round card ${visibleConfirmed ? "confirmed" : "tentative"}`}>
        <div className="programacion-round-head">
          <div>
            <span className="programacion-kicker">{isLatest ? "Próxima Fecha" : "Programación"}</span>
            <h2>Fecha {round.round}</h2>
          </div>
          <span className={`programacion-status ${visibleConfirmed ? "confirmed" : "tentative"}`}>{status}</span>
        </div>

        {round.matches.length ? <div className="programacion-match-list">
          {round.matches.map((match, index) => <div key={`${round.round}:${match.permissionKey}:${match.date}:${match.time}:${index}`} className={`programacion-match ${match.confirmed ? "confirmed" : "tentative"}`}>
            <div className="programacion-match-top">
              <strong>{match.categoryLabel}</strong>
              <span>{match.confirmed ? "Confirmado" : "Tentativo"}</span>
            </div>
            <div className="programacion-versus">
              <b>{displayTeam(match.local)}</b>
              <span>vs.</span>
              <b>{displayTeam(match.visitor)}</b>
            </div>
            <div className="programacion-details">
              <span>📆 {match.date}</span>
              <span>🕐 {match.time}</span>
              <span>📍 {match.place || "Lugar A Confirmar"}</span>
            </div>
          </div>)}
        </div> : <div className="programacion-empty">No Hay Partidos De Tus Categorías En Esta Fecha.</div>}

        {!visibleConfirmed && round.matches.length > 0 ? <p className="programacion-note">Esta Fecha Es Tentativa. La Aplicación Volverá A Consultar Automáticamente La Fuente Oficial y Se Actualizará Cuando La FMV La Confirme.</p> : null}
      </article>;
    })}

    {!loading && remainingFixtures.length > 0 ? <section className="programacion-fixture-general card">
      <div className="programacion-fixture-head">
        <div>
          <span className="programacion-kicker">Fixture General</span>
          <h2>Lo Que Queda Por Jugar</h2>
          <p>Partidos Que Courtrack Mantiene Con Estado Pendiente De Juego. Así No Se Pierden Encuentros Postergados, Reprogramados o Todavía Sin Fecha.</p>
        </div>
        <span className="programacion-fixture-count">{filteredFixtures.length} Partido{filteredFixtures.length === 1 ? "" : "s"}</span>
      </div>

      <div className="programacion-fixture-filters">
        <label>Rama
          <select value={fixtureBranch} onChange={(event) => setFixtureBranch(event.target.value)}>
            <option value="all">Todas Las Ramas</option>
            <option value="female">Femenino</option>
            <option value="male">Masculino</option>
          </select>
        </label>

        <label>Equipo / Categoría
          <select value={fixtureCategory} onChange={(event) => setFixtureCategory(event.target.value)}>
            <option value="all">Todas Las Categorías</option>
            {fixtureCategories.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>

        <label>Rival
          <select value={fixtureOpponent} onChange={(event) => setFixtureOpponent(event.target.value)}>
            <option value="all">Todos Los Rivales</option>
            {fixtureOpponents.map((opponent) => <option key={opponent} value={opponent}>{opponent}</option>)}
          </select>
        </label>
      </div>

      <div className="programacion-fixture-status-summary">
        <span><b>{fixtureStatusCounts.reprogramming}</b> Reprogramación Pendiente</span>
        <span><b>{fixtureStatusCounts.scheduled}</b> Con Fecha Cargada</span>
        <span><b>{fixtureStatusCounts.unscheduled}</b> Sin Fecha</span>
      </div>

      {filteredFixtures.length ? <div className="programacion-fixture-list">
        {filteredFixtures.map((match) => <article key={match.id} className="programacion-fixture-match">
          <div className="programacion-fixture-match-top">
            <strong>{match.categoryLabel}</strong>
            <span className={match.scheduleState === "reprogramming" ? "reprogramming" : match.scheduled ? "scheduled" : "pending"}>
              {match.scheduleState === "reprogramming" ? "Pendiente De Reprogramación" : match.scheduled ? "Tentativo" : "Fixture General"}
            </span>
          </div>
          <div className="programacion-versus">
            <b>{displayTeam(match.local)}</b>
            <span>vs.</span>
            <b>{displayTeam(match.visitor)}</b>
          </div>
          <div className="programacion-details">
            <span>📆 {match.date}{match.scheduleState === "reprogramming" ? " · Fecha Original" : ""}</span>
            <span>🕐 {match.time}</span>
            <span>📍 {match.place}</span>
          </div>
          {match.scheduleState === "reprogramming" ? <div className="programacion-reprogramming-note">Courtrack Todavía Lo Marca Como No Jugado. La Fecha Mostrada Ya Pasó y Debe Considerarse Pendiente De Reprogramación.</div> : null}
          <div className="programacion-fixture-opponent">Rival De MSM: <b>{match.opponent}</b></div>
        </article>)}
      </div> : <div className="programacion-empty">No Hay Partidos Restantes Que Coincidan Con Estos Filtros.</div>}
    </section> : null}

    <div className="programacion-source">Fuente: Federación Mendocina De Voleibol para la programación publicada · Courtrack para determinar qué partidos continúan pendientes de juego.</div>
  </section>;
}
