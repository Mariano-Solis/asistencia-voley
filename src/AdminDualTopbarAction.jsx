import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

export default function AdminDualTopbarAction() {
  const [host, setHost] = useState(null);
  const [canSwitch, setCanSwitch] = useState(false);

  useEffect(() => {
    const normalizeBranding = () => {
      document.querySelectorAll(".brand span").forEach((span) => {
        if ((span.textContent || "").trim() === "#VamosElPoli") {
          span.textContent = "#vamoselpoli";
        }
      });

      document.querySelectorAll("main.app > footer span").forEach((span) => {
        const text = span.textContent || "";
        if (text.includes("#VamosElPoli")) {
          span.textContent = text.replaceAll("#VamosElPoli", "#vamoselpoli");
        }
      });
    };

    normalizeBranding();
    const observer = new MutationObserver(normalizeBranding);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    const evaluate = async (session) => {
      if (!mounted || !session?.user) {
        setCanSwitch(false);
        return;
      }

      const [profileResult, playerResult] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle(),
        supabase.from("players").select("id").eq("user_id", session.user.id).eq("active", true).maybeSingle(),
      ]);

      if (!mounted) return;
      const isProfessor = ["admin", "super_admin"].includes(profileResult.data?.role);
      setCanSwitch(isProfessor && !!playerResult.data?.id);
    };

    supabase.auth.getSession().then(({ data }) => evaluate(data?.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => evaluate(session), 0);
    });

    return () => {
      mounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!canSwitch) {
      setHost(null);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timer = 0;
    let observer = null;

    const hideLegacySwitch = () => {
      document.querySelectorAll("button").forEach((button) => {
        const text = (button.textContent || "").trim();
        if (text.includes("Ir a mi perfil") && !button.classList.contains("admin-player-switch-topbar")) {
          button.style.setProperty("display", "none", "important");
          button.setAttribute("aria-hidden", "true");
          button.setAttribute("tabindex", "-1");
        }
      });
    };

    const findHeader = () => {
      if (cancelled) return;
      attempts += 1;
      hideLegacySwitch();

      const topUser = document.querySelector("main.app .topbar .top-user");
      if (topUser) {
        setHost(topUser);
        return;
      }

      if (attempts < 40) {
        timer = window.setTimeout(findHeader, 200);
      }
    };

    hideLegacySwitch();
    observer = new MutationObserver(hideLegacySwitch);
    observer.observe(document.body, { childList: true, subtree: true });
    findHeader();

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [canSwitch]);

  function switchToPlayer() {
    localStorage.setItem("voley_access_mode", "player");
    window.location.reload();
  }

  if (!host || !canSwitch) return null;

  return createPortal(
    <button type="button" className="admin-player-switch-topbar" onClick={switchToPlayer}>
      <span className="admin-player-switch-icon">🏐</span>
      <span className="admin-player-switch-label">
        <span>Ir a mi perfil</span>
        <span>de Jugador@</span>
      </span>
    </button>,
    host,
  );
}
