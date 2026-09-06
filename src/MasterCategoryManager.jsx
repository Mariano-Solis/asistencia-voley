import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

const SEASON_YEAR = 2026;
const MASTER_MIN_AGE = 30;
const MASTER_TEAMS = ["A", "B", "C", "D"];
const OTHER_TEAMS = ["A", "B", "C", "D", "E"];

function seasonAge(birthDate) {
  if (!birthDate) return null;
  const year = Number(String(birthDate).slice(0, 4));
  return Number.isFinite(year) ? SEASON_YEAR - year : null;
}

function categoryLabel(categories, id) {
  return categories.find((c) => c.id === id)?.name || "Sin categoría";
}

export default function MasterCategoryManager() {
  const [host, setHost] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [players, setPlayers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [masterId, setMasterId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [team, setTeam] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;

    const resolveRole = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!alive || !user) {
        if (alive) setIsSuperAdmin(false);
        return;
      }
      const profile = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (alive) setIsSuperAdmin(profile.data?.role === "super_admin");
    };

    resolveRole();
    const { data } = supabase.auth.onAuthStateChange(() => setTimeout(resolveRole, 0));
    return () => {
      alive = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) {
      setHost(null);
      return;
    }

    const sync = () => {
      const sections = Array.from(document.querySelectorAll("main.app .content-inner > section"));
      const playerSection = sections.find((section) => section.querySelector(".page-title h1")?.textContent?.trim() === "Jugador@s");
      if (!playerSection) {
        setHost(null);
        return;
      }

      let node = playerSection.querySelector("[data-master-category-manager-host]");
      if (!node) {
        node = document.createElement("div");
        node.setAttribute("data-master-category-manager-host", "true");
        const toolbar = playerSection.querySelector(".toolbar.card");
        if (toolbar) playerSection.insertBefore(node, toolbar);
        else playerSection.appendChild(node);
      }
      setHost(node);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isSuperAdmin]);

  const load = async () => {
    if (!isSuperAdmin) return;
    setMessage("");
    const [p, c] = await Promise.all([
      supabase
        .from("players")
        .select("id,full_name,birth_date,category_id,team,category_override,active")
        .eq("active", true)
        .eq("sex", "female")
        .order("full_name"),
      supabase
        .from("categories")
        .select("id,name,gender,active")
        .eq("active", true)
        .eq("gender", "female")
        .order("name"),
    ]);

    if (p.error || c.error) {
      setMessage(p.error?.message || c.error?.message || "No se pudo cargar MASTER.");
      return;
    }

    const femaleCategories = c.data || [];
    const master = femaleCategories.find((row) => row.name?.trim().toLowerCase() === "master");
    const masterEligible = (p.data || []).filter((row) => (seasonAge(row.birth_date) ?? -1) >= MASTER_MIN_AGE);

    setCategories(femaleCategories);
    setMasterId(master?.id || "");
    setPlayers(masterEligible);

    const nextSelected = masterEligible.find((row) => row.id === selectedId) || masterEligible[0] || null;
    if (nextSelected) {
      setSelectedId(nextSelected.id);
      setCategoryId(nextSelected.category_id || master?.id || "");
      setTeam(nextSelected.team || "");
    } else {
      setSelectedId("");
      setCategoryId("");
      setTeam("");
    }
  };

  useEffect(() => {
    if (host && isSuperAdmin) load();
  }, [host, isSuperAdmin]);

  const selected = useMemo(
    () => players.find((row) => row.id === selectedId) || null,
    [players, selectedId],
  );

  const teamOptions = categoryId === masterId ? MASTER_TEAMS : OTHER_TEAMS;

  function choosePlayer(id) {
    const player = players.find((row) => row.id === id);
    setSelectedId(id);
    setCategoryId(player?.category_id || masterId || "");
    setTeam(player?.team || "");
    setMessage("");
  }

  async function saveManual() {
    if (!selected || !categoryId || !masterId) return;
    setSaving(true);
    setMessage("");
    try {
      const nextTeam = categoryId === masterId && !MASTER_TEAMS.includes(team) ? null : team || null;
      const update = await supabase
        .from("players")
        .update({
          category_id: categoryId,
          category_override: categoryId !== masterId,
          team: nextTeam,
        })
        .eq("id", selected.id)
        .select("id,category_id,category_override,team")
        .single();

      if (update.error) throw update.error;
      setMessage(categoryId === masterId ? "✓ Jugadora en MASTER automático." : "✓ Excepción guardada por Super Administrador.");
      await load();
      setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error?.message || "No se pudo guardar el cambio.");
    } finally {
      setSaving(false);
    }
  }

  async function restoreAutomatic() {
    if (!selected || !masterId) return;
    setCategoryId(masterId);
    setSaving(true);
    setMessage("");
    try {
      const nextTeam = MASTER_TEAMS.includes(team) ? team : null;
      const update = await supabase
        .from("players")
        .update({ category_id: masterId, category_override: false, team: nextTeam })
        .eq("id", selected.id)
        .select("id")
        .single();
      if (update.error) throw update.error;
      setMessage("✓ Se restauró la asignación automática a MASTER.");
      setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error?.message || "No se pudo restaurar la categoría automática.");
    } finally {
      setSaving(false);
    }
  }

  if (!host || !isSuperAdmin) return null;

  return createPortal(
    <section className="master-manager-card card">
      <div className="master-manager-head">
        <div>
          <span className="eyebrow">Rama Femenina · Regla 30+</span>
          <h2>MASTER</h2>
          <p>
            Toda jugadora que tenga 30 años o más al 31 de diciembre se asigna automáticamente a MASTER. Sólo el Super Administrador puede crear una excepción y pasarla a otra categoría.
          </p>
        </div>
        <div className="master-manager-count">
          <b>{players.length}</b>
          <span>Jugadoras 30+</span>
        </div>
      </div>

      {players.length ? (
        <div className="master-manager-controls">
          <label>
            Jugadora
            <select value={selectedId} onChange={(e) => choosePlayer(e.target.value)}>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.full_name} · {seasonAge(player.birth_date)} años
                </option>
              ))}
            </select>
          </label>

          <label>
            Categoría
            <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setMessage(""); }}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>

          <label>
            Equipo
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">Sin asignar</option>
              {teamOptions.map((value) => <option key={value} value={value}>Equipo {value}</option>)}
            </select>
          </label>

          <div className="master-manager-actions">
            <button type="button" className="primary" disabled={saving} onClick={saveManual}>
              {saving ? "Guardando..." : categoryId === masterId ? "Guardar MASTER" : "Guardar excepción"}
            </button>
            {selected?.category_override && (
              <button type="button" className="master-auto-button" disabled={saving} onClick={restoreAutomatic}>
                ↺ Volver a MASTER automático
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="empty">Todavía no hay jugadoras de 30 años o más.</div>
      )}

      {selected && (
        <div className="master-current-state">
          <span>Estado actual</span>
          <b>{categoryLabel(categories, selected.category_id)}{selected.team ? ` · Equipo ${selected.team}` : ""}</b>
          <em>{selected.category_override ? "Excepción manual" : "Asignación automática"}</em>
        </div>
      )}

      <div className="master-rule-note">
        <b>Masculino:</b> la única categoría activa es Primera. MASTER existe exclusivamente en Femenino y admite equipos A, B, C y D.
      </div>

      {message && <div className="message master-message">{message}</div>}
    </section>,
    host,
  );
}
