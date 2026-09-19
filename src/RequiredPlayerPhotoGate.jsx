import { useEffect } from "react";
import { supabase } from "./supabase";
import { isAuthSession } from "./sessionSafety";
import { clearPendingPlayerPhoto, playerPhotoPath, preparePlayerPhoto, readPendingPlayerPhoto } from "./playerPhoto";

export default function RequiredPlayerPhotoGate() {
  useEffect(() => {
    let mounted = true;
    let busy = false;

    async function syncPendingPhoto(session) {
      if (!mounted || busy || !isAuthSession(session)) return;
      busy = true;
      try {
        const uid = session.user.id;
        const profileResult = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .maybeSingle();

        if (!mounted || profileResult.error || profileResult.data?.role !== "player") return;

        let playerResult = await supabase
          .from("players")
          .select("id,user_id,selfie_path")
          .eq("user_id", uid)
          .maybeSingle();

        if (!playerResult.data && !playerResult.error) {
          try { await supabase.rpc("ensure_player_profile"); } catch (_) {}
          playerResult = await supabase
            .from("players")
            .select("id,user_id,selfie_path")
            .eq("user_id", uid)
            .maybeSingle();
        }

        if (!mounted || playerResult.error || !playerResult.data) return;

        if (playerResult.data.selfie_path) {
          await clearPendingPlayerPhoto(session.user.email).catch(() => {});
          return;
        }

        const pending = await readPendingPlayerPhoto(session.user.email).catch(() => null);
        if (!pending) return;

        const prepared = await preparePlayerPhoto(pending);
        const path = playerPhotoPath(uid, prepared);
        const upload = await supabase.storage
          .from("player-selfies")
          .upload(path, prepared, { upsert:false, contentType:prepared.type || "image/jpeg" });

        if (upload.error) return;

        const linked = await supabase
          .from("players")
          .update({ selfie_path:path })
          .eq("id", playerResult.data.id)
          .eq("user_id", uid)
          .select("selfie_path")
          .single();

        if (linked.error || linked.data?.selfie_path !== path) {
          await supabase.storage.from("player-selfies").remove([path]).catch(() => {});
          return;
        }

        await clearPendingPlayerPhoto(session.user.email).catch(() => {});
      } finally {
        busy = false;
      }
    }

    supabase.auth.getSession().then(({data}) => syncPendingPhoto(data?.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!["SIGNED_IN","USER_UPDATED"].includes(event)) return;
      setTimeout(() => syncPendingPhoto(session), 0);
    });

    return () => {
      mounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  return null;
}
