const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
export const isAuthSession = value => record(value) && record(value.user) && text(value.user.id) && text(value.access_token);
export const isLegacySession = value => record(value) && value.legacy === true && text(value.id) && text(value.name) && text(value.code);
export function removeStoredPlayer(storage) { try { storage.removeItem('voley_player'); } catch { /* Storage may be disabled. */ } }
export function readStoredPlayer() {
  let result = null;
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      const storage = window[name], raw = storage.getItem('voley_player');
      if (raw === null) continue;
      let value;
      try { value = JSON.parse(raw); } catch { removeStoredPlayer(storage); continue; }
      // This application stores only legacy credentials here. Auth is owned by Supabase.
      if (!isLegacySession(value)) { removeStoredPlayer(storage); continue; }
      if (name === 'localStorage') result = {legacy:true,id:value.id,name:value.name,code:value.code,category_id:typeof value.category_id==='string'?value.category_id:null,category_name:typeof value.category_name==='string'?value.category_name:null};
    } catch { /* A denied storage API must not prevent login. */ }
  }
  return result;
}
export function storeLegacyPlayer(value) { if (isLegacySession(value)) { try { localStorage.setItem('voley_player', JSON.stringify(value)); } catch {} } }
