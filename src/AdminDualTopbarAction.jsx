import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

export default function AdminDualTopbarAction() {
  const [host, setHost] = useState(null);
  const [canSwitch, setCanSwitch] = useState(false);

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
    const sync = () => {
      const topUser = document.querySelector("main.app .topbar .top-user");

      document.querySelectorAll("button").forEach((button) => {
        if ((button.textContent || "").trim().includes("Ir a mi perfil de Jugador@") && button.style.position === "fixed") {
          button.style.display = "none";
        }
      });

      if (!topUser || !canSwitch) {
        setHost(null);
        return;
      }

      let node = topUser.querySelector("[data-admin-player-switch-host]");
      if (!node) {
        node = document.createElement("span");
        node.setAttribute("data-admin-player-switch-host", "true");
        topUser.prepend(node);
      }
      setHost(node);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [canSwitch]);

  function switchToPlayer() {
    localStorage.setItem("voley_access_mode", "player");
    window.location.reload();
  }

  if (!host || !canSwitch) return null;

  return createPortal(
    <button type="button" className="admin-player-switch-topbar" onClick={switchToPlayer}>
      🏐 Ir a mi perfil de Jugador@
    </button>,
    host,
  );
}
