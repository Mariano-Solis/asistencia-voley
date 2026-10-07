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

function generalInstitutionKey(value) {
  return String(value || "").trim().replace(/\s+[A-C]$/i, "").trim();
}

function generalPositionPoints(position) {
  const value = Number(position);
  if (!Number.isInteger(value) || value < 1 || value > 12) return 0;
  return 13 - value;
}

function buildRemainingFixtureCounts(fixtures, selectedKeys) {
  const selected = new Set(selectedKeys);
  const counts = new Map();
  const seen = new Set();

  for (const fixture of Array.isArray(fixtures) ? fixtures : []) {
    if (!selected.has(fixture?.permissionKey)) continue;
    const id = String(fixture?.id || "").trim();
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);

    const institutions = new Set([
      generalInstitutionKey(fixture?.local),
      generalInstitutionKey(fixture?.visitor),
    ].filter(Boolean));

    for (const institution of institutions) {
      counts.set(institution, (counts.get(institution) || 0) + 1);
    }
  }

  return counts;
}

function buildGeneralPositionRanking(tables, selectedKeys, fixtures = null) {
  const selected = tables.filter((table) => selectedKeys.includes(table.tableKey));
  const byInstitution = new Map();
  const remainingCounts = Array.isArray(fixtures)
    ? buildRemainingFixtureCounts(fixtures, selectedKeys)
    : null;

  for (const table of selected) {
    const bestByInstitution = new Map();
    for (const row of table.positions || []) {
      const institution = generalInstitutionKey(row.id_equipo);
      const position = Number(row.posicion);
      if (!institution || !Number.isFinite(position) || position < 1) continue;

      const candidate = {
        position,
        logo: row.logo || "",
        originalTeam: String(row.id_equipo || "").trim(),
        played: Number(row.jugados || 0),
        setsWon: Number(row.setGanados || 0),
        setsLost: Number(row.setPerdidos || 0),
        pointsWon: Number(row.tantosGanados || 0),
        pointsLost: Number(row.tantosPerdidos || 0),
      };

      const existing = bestByInstitution.get(institution);
      if (!existing || position < existing.position) bestByInstitution.set(institution, candidate);
    }

    for (const [institution, placement] of bestByInstitution.entries()) {
      const current = byInstitution.get(institution) || {
        team: institution,
        logo: placement.logo || "",
        totalPoints: 0,
        played: 0,
        setsWon: 0,
        setsLost: 0,
        pointsWon: 0,
        pointsLost: 0,
        details: [],
      };

      const points = generalPositionPoints(placement.position);
      current.totalPoints += points;
      current.played += placement.played;
      current.setsWon += placement.setsWon;
      current.setsLost += placement.setsLost;
      current.pointsWon += placement.pointsWon;
      current.pointsLost += placement.pointsLost;
      current.logo = current.logo || placement.logo || "";
      current.details.push({
        tableKey: table.tableKey,
        categoryLabel: table.categoryLabel,
        position: placement.position,
        points,
        played: placement.played,
        setsWon: placement.setsWon,
        setsLost: placement.setsLost,
        pointsWon: placement.pointsWon,
        pointsLost: placement.pointsLost,
      });
      byInstitution.set(institution, current);
    }
  }

  return [...byInstitution.values()]
    .map((row) => ({
      ...row,
      remaining: remainingCounts ? (remainingCounts.get(row.team) || 0) : null,
      setDifference: row.setsWon - row.setsLost,
      pointDifference: row.pointsWon - row.pointsLost,
    }))
    .sort((a, b) =>
      b.totalPoints - a.totalPoints ||
      b.setDifference - a.setDifference ||
      b.pointDifference - a.pointDifference ||
      a.team.localeCompare(b.team, "es")
    )
    .map((row, index) => ({ ...row, computedRank: index + 1 }));
}

async function loadGeneralRemainingFixtures(signal) {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url: "https://www.voleysanmartin.com.ar/api/fmv-programacion",
      headers: { Accept: "application/json" },
      connectTimeout: 15000,
      readTimeout: 15000,
    });
    const payload = typeof response.data === "string"
      ? JSON.parse(response.data || "{}")
      : (response.data || {});
    if (response.status < 200 || response.status >= 300 || payload?.error) {
      throw new Error(payload?.message || "No Se Pudieron Consultar Los Partidos Faltantes.");
    }
    return Array.isArray(payload?.leagueFixtures) ? payload.leagueFixtures : [];
  }

  const response = await fetch("/api/fmv-programacion", {
    signal,
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(payload?.message || "No Se Pudieron Consultar Los Partidos Faltantes.");
  }
  return Array.isArray(payload?.leagueFixtures) ? payload.leagueFixtures : [];
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

export default function StandingsHub({ compact = false, allowedCategories = null, unrestricted = false, playerMode = false, staffMode = false, allowComparison = false }) {
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
  const [staffTables, setStaffTables] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffMessage, setStaffMessage] = useState("");
  const [generalSelectedKeys, setGeneralSelectedKeys] = useState([]);
  const [generalTables, setGeneralTables] = useState([]);
  const [generalFixtures, setGeneralFixtures] = useState(null);
  const [generalOpen, setGeneralOpen] = useState(false);
  const [generalLoading, setGeneralLoading] = useState(false);
  const [generalMessage, setGeneralMessage] = useState("");
  const [generalLastUpdated, setGeneralLastUpdated] = useState(null);
  const abortRef = useRef(null);
  const generalAbortRef = useRef(null);

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
    const keys = options.map((item) => item.key);
    setGeneralSelectedKeys(keys);
    setGeneralTables([]);
    setGeneralFixtures(null);
    setGeneralOpen(false);
    setGeneralMessage("");
    generalAbortRef.current?.abort();
  }, [competition, branch, options.map((item) => item.key).join("|")]);

  function toggleGeneralCategory(key) {
    setGeneralSelectedKeys((current) => {
      const next = current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key].sort((a, b) => options.findIndex((item) => item.key === a) - options.findIndex((item) => item.key === b));
      return next;
    });
    setGeneralOpen(false);
    setGeneralMessage("");
  }

  function selectAllGeneralCategories() {
    setGeneralSelectedKeys(options.map((item) => item.key));
    setGeneralOpen(false);
    setGeneralMessage("");
  }

  async function loadGeneralPositions() {
    if (!generalSelectedKeys.length) {
      setGeneralMessage("Seleccioná Al Menos Una Categoría Para Generar La Tabla.");
      setGeneralOpen(false);
      return;
    }

    generalAbortRef.current?.abort();
    const controller = new AbortController();
    generalAbortRef.current = controller;
    setGeneralLoading(true);
    setGeneralMessage("");

    try {
      const selectedEntries = options.filter((item) => generalSelectedKeys.includes(item.key));
      const cached = new Map(tables.map((table) => [table.tableKey, table]));
      const missingEntries = selectedEntries.filter((entry) => !cached.has(entry.key));

      if (missingEntries.length) {
        const loader = Capacitor.isNativePlatform()
          ? (entry) => loadNativeTable(entry)
          : (entry) => loadWebTable(entry, controller.signal);
        const results = await Promise.allSettled(missingEntries.map(loader));
        results.forEach((result, index) => {
          if (result.status === "fulfilled") cached.set(missingEntries[index].key, result.value);
        });
        const failed = results.filter((result) => result.status === "rejected");
        if (failed.length) {
          setGeneralMessage(`Se Cargaron ${selectedEntries.length - failed.length} De ${selectedEntries.length} Categorías. Podés Reintentar Para Completar Las Restantes.`);
        }
      }

      const loaded = selectedEntries.map((entry) => cached.get(entry.key)).filter(Boolean);
      if (!loaded.length) throw new Error("No Se Pudieron Consultar Las Categorías Seleccionadas.");

      let fixtures = null;
      try {
        fixtures = await loadGeneralRemainingFixtures(controller.signal);
      } catch (fixtureError) {
        if (fixtureError?.name === "AbortError") throw fixtureError;
        setGeneralMessage((current) => current || "La Tabla Se Generó, Pero No Se Pudieron Consultar Los Partidos Faltantes. PF Se Mostrará Como —.");
      }

      setGeneralTables(loaded);
      setGeneralFixtures(fixtures);
      setGeneralLastUpdated(new Date().toISOString());
      setGeneralOpen(true);
    } catch (error) {
      if (error?.name !== "AbortError") {
        setGeneralMessage(error?.message || "No Se Pudo Generar La Tabla De Posiciones Generales.");
        setGeneralOpen(false);
      }
    } finally {
      if (!controller.signal.aborted) setGeneralLoading(false);
    }
  }

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

    setSelectedKeys((current) => {
      const stillValid = current.filter((key) => permitted.includes(key));
      if (stillValid.length) return stillValid;
      return defaults.length ? defaults : permitted.slice(0, 1);
    });
  }, [competition, branch, accessSignature, unrestricted]);

  function changeCompetition(nextCompetition) {
    setCompetition(nextCompetition);
    const branches = ["female", "male"].filter((value) =>
      availableEntries.some((item) => item.competition === nextCompetition && item.branch === value)
    );
    if (branches.length && !branches.includes(branch)) setBranch(branches[0]);
  }

  function changeBranch(nextBranch) {
    setBranch(nextBranch);
  }

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
      if (!selectedEntries.length) {
        if (!quiet) setLoading(false);
        setRefreshing(false);
        return;
      }

      const loader = Capacitor.isNativePlatform()
        ? (entry) => loadNativeTable(entry)
        : (entry) => loadWebTable(entry, controller.signal);

      const results = await Promise.allSettled(selectedEntries.map(loader));
      let ok = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
      const failed = results.filter((result) => result.status === "rejected");
      const meaningfulFailures = failed.filter((result) => {
        const reason = result?.reason;
        const message = String(reason?.message || reason || "").toLowerCase();
        return reason?.name !== "AbortError" && !message.includes("aborted") && !message.includes("abort");
      });

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
        if (failed.length && !meaningfulFailures.length) return;
        throw new Error(meaningfulFailures[0]?.reason?.message || "No Se Pudieron Consultar Las Posiciones.");
      }

      setTables(ok);
      setLastUpdated(new Date().toISOString());
      if (meaningfulFailures.length) {
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

  useEffect(() => {
    if (!staffMode) return undefined;
    const controller = new AbortController();
    let stopped = false;

    async function loadStaffTables() {
      setStaffLoading(true);
      setStaffMessage("");
      try {
        const loader = Capacitor.isNativePlatform()
          ? (entry) => loadNativeTable(entry)
          : (entry) => loadWebTable(entry, controller.signal);

        const results = await Promise.allSettled(availableEntries.map(loader));
        let ok = results.filter((result) => result.status === "fulfilled").map((result) => result.value);

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

        if (!stopped) {
          setStaffTables(ok);
          setLastUpdated(new Date().toISOString());
          const failed = results.filter((result) => result.status === "rejected");
          if (failed.length && ok.length) setStaffMessage("Algunas Tablas No Pudieron Actualizarse. Reintentá En Unos Instantes.");
          if (!ok.length && availableEntries.length) setStaffMessage("No Se Pudieron Consultar Las Tablas De Tus Categorías.");
        }
      } catch (error) {
        if (!stopped && error?.name !== "AbortError") setStaffMessage(error?.message || "No Se Pudieron Consultar Las Posiciones.");
      } finally {
        if (!stopped) setStaffLoading(false);
      }
    }

    void loadStaffTables();
    const interval = window.setInterval(() => void loadStaffTables(), 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadStaffTables();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [staffMode, accessSignature]);

  const aggregate = useMemo(() => buildAggregate(tables), [tables]);
  const teams = useMemo(() => aggregate.map((row) => row.team), [aggregate]);
  const generalRanking = useMemo(
    () => buildGeneralPositionRanking(generalTables, generalSelectedKeys, generalFixtures),
    [generalTables, generalSelectedKeys.join("|"), generalFixtures]
  );
  const generalOptions = options.filter((item) => generalSelectedKeys.includes(item.key));
  const generalLoadedOptions = generalOptions.filter((item) => generalTables.some((table) => table.tableKey === item.key));

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
    return <section className={`standings-page ${compact ? "compact" : ""} ${playerMode ? "player-standings-mode" : ""}`}>
      <div className="standings-hero">
        <div>
          <span className="eyebrow">Federación Mendocina De Voleibol</span>
          <h1>{playerMode ? "Mi Tabla De Posiciones" : "Posiciones y Comparativo Institucional"}</h1>
          <p>{playerMode ? "Tu Categoría Todavía No Tiene Una Tabla De Posiciones Vinculada." : "Las Tablas Se Muestran Según Las Categorías Autorizadas Para Tu Perfil."}</p>
        </div>
      </div>
      <div className="card standings-no-access">
        <b>{playerMode ? "Tabla No Disponible Para Tu Categoría" : "Sin Categorías Habilitadas Para Posiciones"}</b>
        <span>{playerMode ? "Cuando La Categoría Tenga Una Tabla Oficial Compatible, Aparecerá Automáticamente Acá." : "Cuando El Super Administrador Te Asigne Permisos Sobre Una Categoría Compatible, Su Tabla Aparecerá Automáticamente Acá."}</span>
      </div>
    </section>;
  }

  if (staffMode) {
    return <section className={`standings-page ${compact ? "compact" : ""} staff-standings-mode`}>
      <div className="standings-hero">
        <div>
          <span className="eyebrow">Federación Mendocina De Voleibol</span>
          <h1>Posiciones De Mis Categorías</h1>
          <p>Tablas Oficiales Correspondientes Exclusivamente A Las Categorías Que Tenés Asignadas.</p>
        </div>
        <div className="standings-live">
          <span className={staffLoading ? "pulse" : ""}>●</span>
          <div>
            <b>{staffLoading ? "Actualizando..." : "Actualización Automática"}</b>
            <small>Cada 60 Segundos · Última Consulta {formatTime(lastUpdated)}</small>
          </div>
        </div>
      </div>

      {staffMessage && <div className="message standings-message">{staffMessage}</div>}
      {staffLoading && !staffTables.length ? <div className="standings-loading card">Consultando Las Tablas De Tus Categorías...</div> : null}

      {!staffLoading && !staffTables.length ? <div className="card standings-no-access">
        <b>Sin Tablas Disponibles</b>
        <span>No Hay Una Tabla Oficial Vinculada A Tus Categorías Actuales.</span>
      </div> : null}

      {allowComparison ? <section className="staff-comparison-section">
        <div className="standings-controls card staff-comparison-controls">
          <label>Competencia
            <select value={competition} onChange={(event) => changeCompetition(event.target.value)}>
              {availableCompetitions.map((value) => <option key={value} value={value}>{competitionLabel(value)}</option>)}
            </select>
          </label>

          <label>Rama
            <select value={branch} onChange={(event) => changeBranch(event.target.value)}>
              {availableBranches.map((value) => <option key={value} value={value}>{branchLabel(value)}</option>)}
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

          <button type="button" className="standings-refresh staff-comparison-refresh" onClick={() => void load({ quiet: true })} disabled={refreshing}>
            <span className={refreshing ? "spinning" : ""}>↻</span> {refreshing ? "Actualizando..." : "Actualizar Comparativo"}
          </button>
        </div>

        <div className="standings-card card staff-comparison-card">
          <div className="standings-card-head">
            <div>
              <h2>Comparativo General De Instituciones</h2>
              <p>{competitionLabel(competition)} · {branchLabel(branch)} · Promedio Calculado Sólo Sobre Las Categorías Seleccionadas De Este Nivel.</p>
            </div>
            <label className="standings-advanced">
              <input type="checkbox" checked={advanced} onChange={(event) => setAdvanced(event.target.checked)}/>
              Estadísticas Avanzadas
            </label>
          </div>

          {loading && !aggregate.length ? <div className="standings-loading">Consultando Las Tablas Seleccionadas...</div> :
          aggregate.length ? <div className="standings-table-wrap staff-comparison-table-wrap">
            <table className={`standings-table comparison-standings-table ${advanced ? "is-advanced" : ""}`}>
              <thead><tr>
                <th>#</th>
                <th>Equipo</th>
                <th>Cat.</th>
                <th>Pos. Prom.</th>
                <th>PTS Prom.</th>
                <th>%V</th>
                {advanced && <><th>PJ</th><th>PG</th><th>PP</th><th>SG</th><th>SP</th></>}
              </tr></thead>
              <tbody>
                {aggregate.map((row) => <tr key={row.team} className={row.team === "MSM" ? "is-msm" : ""}>
                  <td><span className="standings-position">{row.computedRank}</span></td>
                  <td><div className="standings-team">{row.logo ? <img src={row.logo} alt="" loading="lazy"/> : null}<strong>{row.team}</strong></div></td>
                  <td>{row.appearances}</td>
                  <td><b>{row.avgPosition}</b></td>
                  <td>{row.avgPoints}</td>
                  <td>{row.winPct}%</td>
                  {advanced && <><td>{row.played}</td><td>{row.won}</td><td>{row.lost}</td><td>{row.setsWon}</td><td>{row.setsLost}</td></>}
                </tr>)}
              </tbody>
            </table>
          </div> : <div className="standings-loading">No Hay Datos Para Las Categorías Seleccionadas.</div>}

          <div className="standings-foot">
            <span><b>Pos. Prom.</b>: promedio aritmético de la posición del equipo únicamente dentro del nivel y categorías seleccionados.</span>
            <span><b>PTS Prom.</b>: promedio de puntos oficiales entre las categorías seleccionadas donde participa.</span>
            <span><b>%V</b>: victorias totales ÷ partidos jugados totales.</span>
            <small>No Se Mezclan Nivel 1, Nivel 3 y Master En Un Mismo Comparativo. Fuente De Datos: Courtrack · Federación Mendocina De Voleibol.</small>
          </div>
        </div>
      </section> : null}

      <div className="staff-standings-list">
        {staffTables.map((table) => {
          const entry = availableEntries.find((item) => item.key === table.tableKey);
          const title = table.categoryLabel || entry?.label || "Categoría";
          return <div key={table.tableKey} className="standings-card card player-standings-table-card">
            <div className="standings-card-head">
              <div>
                <h2>{title} · Tabla Oficial</h2>
                <p>{table.stage || table.division || (entry ? `${branchLabel(entry.branch)} · ${competitionLabel(entry.competition)}` : "")}</p>
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
          </div>;
        })}
      </div>
    </section>;
  }

    if (playerMode) {
    const table = tables[0] || null;
    const entry = table
      ? availableEntries.find((item) => item.key === table.tableKey) || availableEntries[0]
      : availableEntries[0];
    const title = table?.categoryLabel || entry?.label || "Mi Categoría";
    const branchText = entry ? branchLabel(entry.branch) : "";
    const competitionText = entry ? competitionLabel(entry.competition) : "";

    return <section className={`standings-page ${compact ? "compact" : ""} player-standings-mode`}>
      <div className="standings-hero player-standings-hero">
        <div>
          <span className="eyebrow">Federación Mendocina De Voleibol · {competitionText}</span>
          <h1>Mi Tabla De Posiciones</h1>
          <p>{title}{branchText ? ` · ${branchText}` : ""}. Datos Oficiales Actualizados Desde Courtrack.</p>
        </div>
        <div className="standings-live">
          <span className={refreshing ? "pulse" : ""}>●</span>
          <div>
            <b>{refreshing ? "Actualizando..." : "Actualización Automática"}</b>
            <small>Cada 60 Segundos · Última Consulta {formatTime(lastUpdated)}</small>
          </div>
        </div>
      </div>

      <button type="button" className="standings-refresh player-standings-refresh" onClick={() => void load({ quiet: true })} disabled={refreshing}>
        <span className={refreshing ? "spinning" : ""}>↻</span> {refreshing ? "Actualizando..." : "Actualizar Posiciones"}
      </button>

      {message && <div className="message standings-message">{message}</div>}

      {loading ? <div className="standings-loading card">Consultando La Tabla Oficial...</div> : null}

      {!loading && table ? <div className="standings-card card player-standings-table-card">
        <div className="standings-card-head">
          <div>
            <h2>{title} · Tabla Oficial</h2>
            <p>{table.stage || table.division || branchText}</p>
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
        <div className="standings-foot">
          <span><b>PTS</b>: Puntos · <b>PJ</b>: Jugados · <b>PG</b>: Ganados · <b>PP</b>: Perdidos</span>
          <small>Fuente De Datos: Courtrack · Federación Mendocina De Voleibol.</small>
        </div>
      </div> : null}
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
        <select value={competition} onChange={(event) => changeCompetition(event.target.value)}>
          {availableCompetitions.map((value) => <option key={value} value={value}>{competitionLabel(value)}</option>)}
        </select>
      </label>

      <label>Rama
        <select value={branch} onChange={(event) => changeBranch(event.target.value)}>
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
          <table className={`standings-table ${selectedTeam === "__ALL__" ? "comparison-standings-table " : ""}${advanced ? "is-advanced" : ""}`}>
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

    <section className="standings-card card general-positions-card">
      <div className="standings-card-head general-positions-head">
        <div>
          <span className="eyebrow">Ranking Institucional Por Posición</span>
          <h2>Posiciones Generales</h2>
          <p>1.º = 12 Puntos · 2.º = 11 · … · 12.º = 1. Se Suman Sólo Los Puntos Por Posición De Las Categorías Que Elijas.</p>
        </div>
        {generalLastUpdated && <small>Última Generación {formatTime(generalLastUpdated)}</small>}
      </div>

      <div className="general-positions-controls">
        <div>
          <span>Categorías Del Ranking</span>
          <div className="general-positions-chips">
            <button
              type="button"
              className={generalSelectedKeys.length === options.length && options.length ? "active" : ""}
              onClick={selectAllGeneralCategories}
            >Todas</button>
            {options.map((item) => <button
              type="button"
              key={item.key}
              className={generalSelectedKeys.includes(item.key) ? "active" : ""}
              onClick={() => toggleGeneralCategory(item.key)}
            >{item.label}</button>)}
          </div>
        </div>

        <button type="button" className="general-positions-generate" onClick={() => void loadGeneralPositions()} disabled={generalLoading || !generalSelectedKeys.length}>
          <span className={generalLoading ? "spinning" : ""}>↻</span>
          {generalLoading ? "Generando..." : generalOpen ? "Recalcular Posiciones Generales" : "Generar Posiciones Generales"}
        </button>
      </div>

      {generalMessage && <div className="message standings-message">{generalMessage}</div>}

      {generalOpen && generalRanking.length ? <div className="standings-table-wrap general-positions-table-wrap">
        <table className="standings-table general-positions-table">
          <thead><tr>
            <th>#</th>
            <th>Institución</th>
            <th>Total</th>
            {generalLoadedOptions.map((item) => <th key={item.key}>{item.label}</th>)}
            <th>PJ</th>
            <th>PF</th>
            <th>Dif. Sets</th>
            <th>Dif. Tantos</th>
          </tr></thead>
          <tbody>{generalRanking.map((row) => {
            const detailByKey = new Map(row.details.map((detail) => [detail.tableKey, detail]));
            return <tr key={row.team} className={row.team === "MSM" ? "is-msm" : ""}>
              <td><span className="standings-position">{row.computedRank}</span></td>
              <td><div className="standings-team">{row.logo ? <img src={row.logo} alt="" loading="lazy"/> : null}<strong>{row.team}</strong></div></td>
              <td className="general-position-total"><b>{row.totalPoints}</b></td>
              {generalLoadedOptions.map((item) => {
                const detail = detailByKey.get(item.key);
                return <td key={item.key} className="general-position-score">
                  {detail ? <><b>{detail.points}</b><small>{detail.position}.º</small></> : <><b>0</b><small>—</small></>}
                </td>;
              })}
              <td className="general-position-count"><b>{row.played}</b></td>
              <td className="general-position-count"><b>{row.remaining === null ? "—" : row.remaining}</b></td>
              <td className="general-position-tiebreak"><b>{row.setDifference > 0 ? `+${row.setDifference}` : row.setDifference}</b><small>{row.setsWon}-{row.setsLost}</small></td>
              <td className="general-position-tiebreak"><b>{row.pointDifference > 0 ? `+${row.pointDifference}` : row.pointDifference}</b><small>{row.pointsWon}-{row.pointsLost}</small></td>
            </tr>;
          })}</tbody>
        </table>
      </div> : generalOpen ? <div className="standings-loading">No Hay Datos Para Las Categorías Seleccionadas.</div> : null}

      <div className="standings-foot general-positions-foot">
        <span><b>Criterio:</b> 1.º suma 12 puntos; 2.º, 11; 3.º, 10; …; 12.º, 1. Si una institución no figura en una categoría, suma 0 en esa categoría.</span>
        <span><b>PJ</b>: suma de partidos jugados en las categorías seleccionadas. <b>PF</b>: partidos con estado pendiente/upcoming que todavía le quedan a la institución en esas mismas categorías. Son informativos y no modifican el puntaje del ranking.</span>
        <span><b>No intervienen en el puntaje</b> partidos jugados, partidos faltantes, victorias, derrotas, sets ni puntos oficiales del torneo.</span>
        <small>Desempate: 1.º mayor diferencia de sets (sets ganados − sets perdidos); 2.º mayor diferencia de tantos (tantos a favor − tantos en contra). Si ambas diferencias también son iguales, se ordena alfabéticamente sólo como último criterio técnico.</small>
      </div>
    </section>
  </section>;
}
