import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const EMPTY_COUNTS = { total: 0, female: 0, male: 0 };

function findPlayersToolbar() {
  return Array.from(document.querySelectorAll("main.app .toolbar")).find((toolbar) => {
    const input = toolbar.querySelector('input[placeholder="Buscar por nombre"]');
    const select = toolbar.querySelector("select");
    return input && Array.from(select?.options || []).some((option) => option.textContent?.trim() === "Todas las categorías");
  }) || null;
}

function countVisiblePlayers(grid) {
  if (!grid) return EMPTY_COUNTS;
  const cards = Array.from(grid.querySelectorAll(":scope > .player-card"));
  let female = 0;
  let male = 0;

  cards.forEach((card) => {
    const categoryText = card.querySelector(".player-card-top p")?.textContent?.trim().toLowerCase() || "";
    if (categoryText.startsWith("femenino")) female += 1;
    else if (categoryText.startsWith("masculino")) male += 1;
  });

  return { total: cards.length, female, male };
}

export default function PlayerDynamicCounter() {
  const [host, setHost] = useState(null);
  const [counts, setCounts] = useState(EMPTY_COUNTS);

  useEffect(() => {
    let currentToolbar = null;
    let currentGrid = null;
    let gridObserver = null;

    const disconnectGrid = () => {
      gridObserver?.disconnect();
      gridObserver = null;
      currentGrid = null;
    };

    const refresh = () => {
      const toolbar = findPlayersToolbar();
      if (!toolbar) {
        if (currentToolbar) {
          disconnectGrid();
          currentToolbar = null;
          setHost(null);
          setCounts(EMPTY_COUNTS);
        }
        return;
      }

      if (toolbar !== currentToolbar) {
        disconnectGrid();
        currentToolbar = toolbar;

        let counterHost = toolbar.parentElement?.querySelector(":scope > .player-dynamic-counter-host");
        if (!counterHost) {
          counterHost = document.createElement("div");
          counterHost.className = "player-dynamic-counter-host";
          toolbar.insertAdjacentElement("afterend", counterHost);
        }
        setHost(counterHost);
      }

      const grid = toolbar.parentElement?.querySelector(":scope > .player-grid") || null;
      if (grid !== currentGrid) {
        disconnectGrid();
        currentGrid = grid;
        if (grid) {
          gridObserver = new MutationObserver(() => setCounts(countVisiblePlayers(grid)));
          gridObserver.observe(grid, { childList: true, subtree: true, characterData: true });
        }
      }

      setCounts(countVisiblePlayers(grid));
    };

    refresh();
    const timer = window.setInterval(refresh, 350);
    return () => {
      window.clearInterval(timer);
      disconnectGrid();
      if (currentToolbar) {
        const counterHost = currentToolbar.parentElement?.querySelector(":scope > .player-dynamic-counter-host");
        counterHost?.remove();
      }
    };
  }, []);

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
