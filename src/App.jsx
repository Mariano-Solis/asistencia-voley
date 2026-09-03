import { useEffect } from "react";
import AppNew from "./AppNew";
import ProfessorSelfSignup from "./ProfessorSelfSignup";
import { supabase } from "./supabase";

function AccountRepair() {
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    const ensure = async (session) => {
      if (!mounted || !session?.user) return;
      try { await supabase.rpc("ensure_player_profile"); } catch (_) {}
    };
    supabase.auth.getSession().then(({ data }) => ensure(data?.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => ensure(session));
    return () => { mounted = false; data?.subscription?.unsubscribe(); };
  }, []);
  return null;
}

export default function App() {
  return (
    <>
      <AccountRepair />
      <AppNew />
      <ProfessorSelfSignup />
    </>
  );
}
