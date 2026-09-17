import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

const EMPTY_COUNTS = { total: 0, female: 0, male: 0 };

function findPlayersToolbar() {
  return Array.from(document.querySelectorAll("main.app .toolbar")).find((toolbar) => {
    const input = toolbar.querySelector('input[placeholder="Buscar por nombre"]');
    const select = toolbar.querySelector("select");
    return input && Array.from(select?.options || []).some((option) => option.textContent?.trim() === "Todas las categorías");
  }) || null;
}

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("es");
}

export default function PlayerDynamicCounter() {
  const [host, setHost] = useState(null);
  const [players, setPlayers] = useState([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id,full_name,sex,category_id,active")
        .eq("active", true);
      if (!alive || error) return;
      setPlayers(data || []);
    };
    load();
    const timer = window.setInterval(load, 4000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let currentToolbar = null;

    const refresh = () => {
      const toolbar = findPlayersToolbar();
      if (!toolbar) {
        currentToolbar = null;
        setHost(null);
        setCounts(EMPTY_COUNTS);
        return;
      }

      if (toolbar !== currentToolbar) {
        currentToolbar = toolbar;
        let counterHost = toolbar.parentElement?.querySelector(":scope > .player-dynamic-counter-host");
        if (!counterHost) {
          counterHost = document.createElement("div");
          counterHost.className = "player-dynamic-counter-host";
          toolbar.insertAdjacentElement("afterend", counterHost);
        }
        setHost(counterHost);
      }

      const search = normalize(toolbar.querySelector('input[placeholder="Buscar por nombre"]')?.value);
      const categoryId = toolbar.querySelector("select")?.value || "all";
      const visible = players.filter((player) =>
        (categoryId === "all" || player.category_id === categoryId) &&
        (!search || normalize(player.full_name).includes(search))
      );
      const female = visible.filter((player) => normalize(player.sex) === "female").length;
      const male = visible.filter((player) => normalize(player.sex) === "male").length;
      setCounts({ total: visible.length, female, male });
    };

    refresh();
    const timer = window.setInterval(refresh, 250);
    return () => {
      window.clearInterval(timer);
      if (currentToolbar) currentToolbar.parentElement?.querySelector(":scope > .player-dynamic-counter-host")?.remove();
    };
  }, [players]);

  if (!host) return null;

  return createPortal(
    <section className="player-dynamic-counter card" aria-label="Resumen de Jugador@s visibles" aria-live="polite">
      <div className="player-counter-title">Resumen de Jugador@s</div>
      <div className="player-counter-grid">
        <div className="player-counter-stat total"><span>Total</span><strong>{counts.total}</strong></div>
        <div className="player-counter-stat female"><span>Femenino</span><strong>{counts.female}</strong></div>
        <div className="player-counter-stat male"><span>Masculino</span><strong>{counts.male}</strong></div>
      </div>
    </section>,
    host
  );
}
