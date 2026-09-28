const COURTRACK_BASE = "https://api.courtrack.com/api/torneo";
const CLIENT_ID = 23;

const FALLBACK = {
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

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function json(res, status, body, cache = false) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache ? "public, s-maxage=20, stale-while-revalidate=100" : "no-store");
  return res.end(JSON.stringify(body));
}

async function courtrack(path) {
  const response = await fetch(`${COURTRACK_BASE}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Courtrack respondió HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.error) throw new Error(payload.message || "Courtrack devolvió un error.");
  return payload;
}

function categoryAge(category) {
  if (category === "mayores") return 0;
  const match = String(category).match(/^sub(\d+)$/);
  return match ? Number(match[1]) : null;
}

function resolveFromLeagues(leagues, branch, category) {
  const female = branch === "female";
  const branchId = female ? 1 : 2;
  const age = categoryAge(category);
  if (age === null) return null;

  const candidateLeagues = (Array.isArray(leagues) ? leagues : []).filter((league) => {
    const name = normalize(league?.nombre);
    if (category === "mayores") return name.includes("MAYORES");
    if (!name.includes("INFERIORES") || !name.includes("NIVEL 1")) return false;
    return female ? name.includes("FEM") : name.includes("MASC");
  }).sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0));

  for (const league of candidateLeagues) {
    const tournaments = Array.isArray(league?.torneos) ? league.torneos : [];
    const tournament = tournaments
      .filter((item) => Number(item?.id_rama) === branchId && Number(item?.edad_limite || 0) === age)
      .filter((item) => category !== "mayores" || /NIVEL\s*1\b/i.test(String(item?.descripcion || "")))
      .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0];

    if (!tournament) continue;
    const stages = Array.isArray(league?.torneos_etapas?.[String(tournament.id)])
      ? league.torneos_etapas[String(tournament.id)]
      : [];
    const stage = stages
      .filter((item) => item?.sistema === "posiciones")
      .sort((a, b) => Number(b?.orden || 0) - Number(a?.orden || 0) || Number(b?.id || 0) - Number(a?.id || 0))[0];

    if (stage) return {
      tournamentId: Number(tournament.id),
      stageId: Number(stage.id),
      tournament: tournament.descripcion || "",
      stage: stage.titulo || stage.descripcion || "",
      leagueId: Number(league.id),
      league: league.nombre || "",
    };
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: true, message: "Método No Permitido." });

  const branch = String(req.query.branch || "female").toLowerCase();
  const category = String(req.query.category || "mayores").toLowerCase();
  const key = `${branch}:${category}`;

  if (!["female", "male"].includes(branch) || !FALLBACK[key]) {
    return json(res, 400, { error: true, message: "Rama O Categoría No Válida." });
  }

  try {
    let resolved = null;
    try {
      const leagues = await courtrack(`/getLigas?id_cliente=${CLIENT_ID}`);
      resolved = resolveFromLeagues(leagues, branch, category);
    } catch {
      resolved = null;
    }

    const ids = resolved || FALLBACK[key];
    const payload = await courtrack(`/getPosiciones?id_torneos=${ids.tournamentId}&id_etapas=${ids.stageId}`);
    const table = Array.isArray(payload?.data) ? payload.data[0] : null;
    if (!table) throw new Error("No Se Encontró La Tabla Solicitada.");

    const positions = Array.isArray(table.posicionesObj) ? table.posicionesObj : [];
    return json(res, 200, {
      error: false,
      source: "Courtrack · Federación Mendocina De Voleibol",
      fetchedAt: new Date().toISOString(),
      branch,
      category,
      tournamentId: Number(table.id_torneo || ids.tournamentId),
      stageId: Number(table.id_etapa || ids.stageId),
      tournament: resolved?.tournament || "",
      stage: table.titulo || table.descripcion_etapa || resolved?.stage || "",
      division: table.division || "",
      positions,
    }, true);
  } catch (error) {
    return json(res, 502, {
      error: true,
      message: error?.message || "No Se Pudo Consultar La Tabla De Posiciones.",
    });
  }
}
