# Auditoría acotada de seguridad e integridad — 23/11/2026

Proyecto único: Supabase comercial `savptjiwzaypisayulwp`. Rama exclusiva `feature/voley-comercial-junin-piloto`. No se consultó ni modificó San Martín. Esta auditoría separa controles de catálogo SQL, pruebas locales con identidad simulada y solicitudes con JWT Auth real.

| Control | Resultado observado | Alcance |
|---|---|---|
| RLS | 10/10 tablas del piloto con `relrowsecurity=true` | Consulta de catálogo en PostgreSQL comercial; no prueba un JWT |
| Propietario y licencias | `anon` sin EXECUTE de `pilot_issue_code`; `authenticated` sin INSERT directo en `platform_owners` ni UPDATE directo en `institution_licenses` | Privilegios SQL reales; las funciones privilegiadas exigen `pilot_is_owner()` |
| Storage | Bucket `pilot-branding` privado, límite 2 MB, cuatro políticas específicas para leer, insertar, editar y borrar | Catálogo comercial; falta ensayo cruzado con dos JWT |
| Datos deportivos | Membresía activa, institución activa y licencia vigente en `pilot_member`; RLS por `institution_id` | Código inspeccionado y PGlite local; falta PostgREST con dos JWT |
| Activación | Código de 24 bytes aleatorios, hash SHA-256, correo confirmado, destinatario exacto, fila bloqueada para canje único y emisión serializada por institución | SQL y test local; falta recanje concurrente con sesiones reales |
| Historial | Seis triggers nuevos impiden cambiar `institution_id` en categoría, jugador, jornada y asistencia, y cambiar categoría de jugador/jornada si ya hay asistencia | Migración 009 aplicada al comercial, prueba PostgreSQL con `ROLLBACK` aprobada |
| Claves | Build aislado fija el proyecto comercial y rechaza clave `sb_secret_` o JWT `service_role` | Verificado por código/build; no se imprimieron claves privadas |
| Court Track | Consulta acotada a tablas FMV y host de imagen permitido; selección humana explícita | No equivale a validar nombre oficial, escudo o licencia de uso; JNN conserva identidad provisional |

## Migración 009 y recuperación

Archivo: `supabase/pilot/009_sports_tenant_and_history_guards.sql`. Antes de aplicarla: cero asistencias con categoría de jugador distinta de jornada, cero guardias, ocho tablas principales con RLS. Después: seis guardias, ocho tablas principales con RLS, cero inconsistencias. El ensayo reproducible `supabase/pilot/009_sports_guard_smoke.sql` devolvió `PASS` tras `ROLLBACK`; una consulta independiente confirmó cero instituciones `guard-smoke-20261123` residuales. Las actualizaciones normales de nombre, categoría sin asistencia y estado Presente/Tarde/Ausente pasaron en PGlite; el cambio normal de estado también pasó en PostgreSQL comercial.

Para revertir **solo si una regresión comprobada lo exige**, en el comercial y tras revisar dependencias: `DROP TRIGGER pilot_categories_tenant_guard ON public.categories`, `pilot_players_tenant_guard ON public.players`, `pilot_sessions_tenant_guard ON public.training_sessions`, `pilot_attendance_tenant_guard ON public.attendance`, `pilot_player_history_guard ON public.players`, `pilot_session_history_guard ON public.training_sessions`; después `DROP FUNCTION public.pilot_guard_sports_tenant()` y `public.pilot_guard_recorded_category()`, y opcionalmente `DROP INDEX public.pilot_attendance_player_lookup`. No ejecutar esta reversión para facilitar cambios indebidos de institución.

## Pendientes críticos

- La cuenta del propietario sigue sin acceso comprobado: `POST /token` HTTP 400; recuperación de correo limitada HTTP 429. No se tocó cuenta, UID, rol ni contraseña. No se enviaron correos ni se reintentó ingreso durante esta iteración.
- Club Ficticio B mantiene licencia temporal, sin código ni membresía. Su usuario confirmó correo, pero no posee aún acceso institucional. No se emitió código mediante SQL administrativo.
- `scripts/pilot-jwt-isolation.mjs` requiere los dos JWT de administradores **autenticados y vigentes**. No se ejecutó con `service_role`. El panel `?qa=1` también está preparado, sin ensayo cruzado ejecutado. Por tanto PostgREST/Storage entre instituciones no están aprobados.
- Falta profesor con identidad Auth propia, ensayo físico Android de escudo/CSV, recuperación de sesión y recorrido de escritorio autenticado. No presentar la candidata como apta para usuarios reales.

## Pruebas independientes posteriores

La integración local amplió el rol `professor`: lee su club, crea/edita jugador, registra asistencia, no lee el club ajeno, no administra categorías, profesores, identidad, licencias, códigos, instituciones o roles; su suspensión niega lecturas y escrituras. Es evidencia con `auth.uid()` simulado dentro de PGlite, no una sesión Auth de profesor. El selector de acceso de la interfaz ahora prioriza una membresía activa con licencia válida cuando una cuenta tiene varias, sin modificar la autorización RLS. Un test unitario cubre una membresía suspendida y otra vencida antes de una activa. La asignación de profesor a categorías individuales sigue sin implementarse.

La prueba de CSV usa tres jugadores ficticios diferentes para Presente, Tarde y Ausente, preserva acentos y separa columnas con punto y coma; su versión anterior duplicaba una combinación jugador/jornada imposible por clave primaria. La descarga física Android y apertura en planilla continúan pendientes.

El acceso por enlace ahora establece `shouldCreateUser:false`: solo una cuenta ya registrada puede usar esa vía. Las altas nuevas siguen en **Crear cuenta** con contraseña y confirmación normal. Esto reduce altas involuntarias y la confusión entre acceso y registro; no aumenta la cuota de correos ni demuestra que el rechazo de contraseña del propietario esté resuelto. No se solicitó ningún correo para probar el cambio.

El panel de aislamiento en Preview ya no interpreta un error HTTP 500 o una falla de red como una denegación RLS. Muestra el estado HTTP junto con PASS/FAIL y verifica la eliminación efectiva de sus filas ficticias por identificador y la ausencia del escudo tras borrarlo. La regresión unitaria cubre 500, error de red, lectura ajena visible, lectura RLS vacía, 403 y 404. **El panel sigue sin ejecutarse con las dos sesiones reales**, y un PASS de sus tests unitarios no acredita aislamiento de clubes.

La entrada de identificadores ajenos ahora exige UUID completos, clubes distintos y un nombre de archivo PNG bajo el identificador institucional correspondiente. Esto evita falsos PASS por entradas evidentemente inválidas. El panel **no puede demostrar por sí solo que el archivo ajeno existe**: la prueba definitiva seguirá siendo el script que lee primero los objetos propios con los dos JWT y luego intenta el acceso cruzado. `test:pilot` terminó en 17/17 y ambas compilaciones pasaron; la matriz continúa 8/20.
