import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

export default function AdminDualTopbarAction() {
  const [host, setHost] = useState(null);
  const [canSwitch, setCanSwitch] = useState(false);
  const hostRef = useRef(null);

  useEffect(() => {
    const normalizeBranding = () => {
      document.querySelectorAll(".brand span").forEach((span) => {
        if ((span.textContent || "").trim() === "#VamosElPoli") {
          span.textContent = "#VamosElPoli";
        }
      });

      document.querySelectorAll("main.app > footer span").forEach((span) => {
        const text = span.textContent || "";
        if (text.includes("#VamosElPoli")) {
          span.textContent = text.replaceAll("#VamosElPoli", "#VamosElPoli");
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
      if (!mounted) return;

      if (!session?.user) {
        setCanSwitch(false);
        return;
      }

      const [profileResult, playerResult] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle(),
        supabase.from("players").select("id").eq("user_id", session.user.id).eq("active", true).maybeSingle(),
      ]);

      if (!mounted) return;

      // A transient read failure must not make a valid control disappear.
      // Keep the previous state and let the next auth/DOM cycle retry.
      if (profileResult.error || playerResult.error) return;

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
      hostRef.current = null;
      setHost(null);
      return;
    }

    let cancelled = false;
    let scheduled = 0;

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

    const syncHost = () => {
      scheduled = 0;
      if (cancelled) return;

      hideLegacySwitch();
      const currentHost = document.querySelector("main.app .topbar .top-user");

      if (currentHost !== hostRef.current) {
        hostRef.current = currentHost || null;
        setHost(currentHost || null);
      }
    };

    const scheduleSync = () => {
      if (scheduled) return;
      scheduled = requestAnimationFrame(syncHost);
    };

    syncHost();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer.disconnect();
      if (scheduled) cancelAnimationFrame(scheduled);
      hostRef.current = null;
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
