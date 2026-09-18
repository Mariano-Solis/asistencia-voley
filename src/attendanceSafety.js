export const CONFLICT_MESSAGE = 'La Asistencia Fue Modificada Por Otro Profesor. Revisá Los Cambios Antes De Continuar.';
export const OFFLINE_MESSAGE = 'Sin Conexión. Tus Cambios Todavía No Se Guardaron. Volvé A Intentarlo Cuando Recuperes Conexión.';
export function attendanceWriteError(error) {
  const message = String(error?.message || '');
  if (navigator.onLine === false || /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(message)) return OFFLINE_MESSAGE;
  return message || 'No Se Pudo Guardar La Asistencia. Volvé A Intentarlo.';
}
export function attendanceFingerprint(session, rows) {
  const fields = ['opponent','event_location','event_start_date','event_end_date','tournament_location','tournament_start_date','tournament_end_date'];
  return JSON.stringify([
    fields.map(field=>session?.[field] || null),
    [...(session?.tournament_dates || [])].sort(),
    rows.map(row=>[row.player_id,row.status]).sort((a,b)=>a[0].localeCompare(b[0]))
  ]);
}
export async function readAttendance(client, date, category, type) {
  const session = await client.from('training_sessions').select('*').eq('session_date',date).eq('category_id',category).eq('activity_type',type).maybeSingle();
  if (session.error) throw session.error;
  const rows = session.data ? await client.from('attendance').select('player_id,status').eq('session_id',session.data.id) : {data:[]};
  if (rows.error) throw rows.error;
  return {session:session.data, rows:rows.data, fingerprint:attendanceFingerprint(session.data,rows.data), loadedAt:new Date().toISOString()};
}
