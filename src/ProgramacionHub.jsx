import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { exportProgramacionWorkbook } from "./xlsxCategoryExport";

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

export default function ProgramacionHub({ allowedCategories = null, unrestricted = false, compact = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRoundIds, setExportRoundIds] = useState([]);
  const [exportBranches, setExportBranches] = useState(["female", "male"]);
  const [exportCategoryKeys, setExportCategoryKeys] = useState([]);
  const [exportMessage, setExportMessage] = useState("");
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

  const exportCategories = useMemo(() => {
    const map = new Map();
    for (const round of rounds) {
      for (const match of round.matches || []) {
        const key = String(match.permissionKey || "").trim();
        if (!key) continue;
        const branch = key.startsWith("female:") ? "female" : "male";
        if (!map.has(key)) map.set(key, { key, label: match.categoryLabel || key, branch });
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.branch !== b.branch) return a.branch === "female" ? -1 : 1;
      return a.label.localeCompare(b.label, "es");
    });
  }, [rounds]);

  function openExportPanel() {
    setExportRoundIds(rounds.map((round) => String(round.round)));
    setExportBranches(["female", "male"]);
    setExportCategoryKeys(exportCategories.map((category) => category.key));
    setExportMessage("");
    setExportOpen(true);
  }

  function toggleValue(value, list, setter) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  const exportVisibleCategories = useMemo(() => {
    const selectedRounds = new Set(exportRoundIds);
    const selectedBranches = new Set(exportBranches);
    const keys = new Set();
    for (const round of rounds) {
      if (!selectedRounds.has(String(round.round))) continue;
      for (const match of round.matches || []) {
        const key = String(match.permissionKey || "");
        const branch = key.startsWith("female:") ? "female" : "male";
        if (selectedBranches.has(branch)) keys.add(key);
      }
    }
    return exportCategories.filter((category) => keys.has(category.key));
  }, [rounds, exportRoundIds, exportBranches, exportCategories]);

  function selectAllExportCategories() {
    setExportCategoryKeys(exportVisibleCategories.map((category) => category.key));
  }

  function exportProgramming() {
    setExportMessage("");
    if (!exportRoundIds.length) {
      setExportMessage("Elegí Al Menos Una Fecha.");
      return;
    }
    if (!exportBranches.length) {
      setExportMessage("Elegí Al Menos Una Rama.");
      return;
    }
    if (!exportCategoryKeys.length) {
      setExportMessage("Elegí Al Menos Una Categoría.");
      return;
    }

    const selectedRounds = new Set(exportRoundIds);
    const selectedBranches = new Set(exportBranches);
    const selectedCategories = new Set(exportCategoryKeys);
    const exportRounds = rounds
      .filter((round) => selectedRounds.has(String(round.round)))
      .map((round) => ({
        round: round.round,
        confirmed: round.matches.length > 0 && round.matches.every((match) => match.confirmed),
        matches: (round.matches || []).filter((match) => {
          const key = String(match.permissionKey || "");
          const branch = key.startsWith("female:") ? "female" : "male";
          return selectedBranches.has(branch) && selectedCategories.has(key);
        }),
      }))
      .filter((round) => round.matches.length > 0);

    if (!exportRounds.length) {
      setExportMessage("No Hay Partidos Que Coincidan Con La Selección.");
      return;
    }

    const roundLabel = exportRounds.map((round) => `Fecha ${round.round}`).join(" y ");
    const branchLabel = exportBranches.length === 2
      ? "Ramas Femenina y Masculina"
      : exportBranches[0] === "female" ? "Rama Femenina" : "Rama Masculina";
    const categoryCount = new Set(exportRounds.flatMap((round) => round.matches.map((match) => match.permissionKey))).size;
    const selectionText = `${roundLabel} · ${branchLabel} · ${categoryCount} ${categoryCount === 1 ? "Categoría" : "Categorías"}`;
    const exportDate = new Intl.DateTimeFormat("es-AR", {
      dateStyle: "long",
      timeZone: "America/Argentina/Mendoza",
    }).format(new Date());

    exportProgramacionWorkbook({
      exportDate,
      selectionText,
      rounds: exportRounds,
      filename: `programacion-msm-fechas-${exportRounds.map((round) => round.round).join("-")}.xlsx`,
    });
    setExportMessage("Excel Generado Correctamente.");
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

    <div className="programacion-actions">
      <button type="button" className="programacion-refresh" onClick={() => void load({ quiet: true })} disabled={refreshing}>
        <span className={refreshing ? "spinning" : ""}>↻</span>
        {refreshing ? "Actualizando..." : "Actualizar Programación"}
      </button>
      <button type="button" className="programacion-export-button" onClick={openExportPanel} disabled={!rounds.length}>
        <span aria-hidden="true">📊</span>
        Exportar XLSX
      </button>
    </div>

    {exportOpen ? <div className="programacion-export card">
      <div className="programacion-export-head">
        <div>
          <span className="eyebrow">Planilla Para Imprimir</span>
          <h2>Exportar Programación</h2>
          <p>Elegí Fechas, Rama y Una o Varias Categorías. Solo Se Exporta La Programación Que Tu Perfil Puede Ver.</p>
        </div>
        <button type="button" className="programacion-export-close" onClick={() => setExportOpen(false)} aria-label="Cerrar">×</button>
      </div>

      <div className="programacion-export-grid">
        <fieldset>
          <legend>Fechas</legend>
          <div className="programacion-export-options">
            {rounds.map((round) => <label key={round.round}>
              <input
                type="checkbox"
                checked={exportRoundIds.includes(String(round.round))}
                onChange={() => toggleValue(String(round.round), exportRoundIds, setExportRoundIds)}
              />
              <span>Fecha {round.round}</span>
              <small>{round.matches.length > 0 && round.matches.every((match) => match.confirmed) ? "Confirmada" : "Tentativa"}</small>
            </label>)}
          </div>
        </fieldset>

        <fieldset>
          <legend>Rama</legend>
          <div className="programacion-export-options compact-options">
            <label>
              <input type="checkbox" checked={exportBranches.includes("female")} onChange={() => toggleValue("female", exportBranches, setExportBranches)} />
              <span>Femenina</span>
            </label>
            <label>
              <input type="checkbox" checked={exportBranches.includes("male")} onChange={() => toggleValue("male", exportBranches, setExportBranches)} />
              <span>Masculina</span>
            </label>
          </div>
        </fieldset>
      </div>

      <fieldset className="programacion-export-categories">
        <div className="programacion-export-legend-row">
          <legend>Categorías</legend>
          <div>
            <button type="button" onClick={selectAllExportCategories}>Todas</button>
            <button type="button" onClick={() => setExportCategoryKeys([])}>Ninguna</button>
          </div>
        </div>
        <div className="programacion-category-checks">
          {exportVisibleCategories.map((category) => <label key={category.key}>
            <input
              type="checkbox"
              checked={exportCategoryKeys.includes(category.key)}
              onChange={() => toggleValue(category.key, exportCategoryKeys, setExportCategoryKeys)}
            />
            <span>{category.label}</span>
          </label>)}
        </div>
      </fieldset>

      <div className="programacion-export-summary">
        <span>{exportRoundIds.length} {exportRoundIds.length === 1 ? "Fecha" : "Fechas"}</span>
        <span>{exportBranches.length} {exportBranches.length === 1 ? "Rama" : "Ramas"}</span>
        <span>{exportCategoryKeys.filter((key) => exportVisibleCategories.some((category) => category.key === key)).length} Categorías</span>
      </div>

      {exportMessage ? <div className="programacion-export-message">{exportMessage}</div> : null}

      <button type="button" className="programacion-export-confirm" onClick={exportProgramming}>
        Exportar Excel Para Imprimir
      </button>
    </div> : null}

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

    <div className="programacion-source">Fuente: Federación Mendocina De Voleibol · Programación Oficial Del Torneo Clausura.</div>
  </section>;
}
