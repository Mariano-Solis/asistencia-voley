# Piloto comercial Junín JNN — objetivo 2026-11-23

## Protección
- Rama aislada: feature/voley-comercial-junin-piloto.
- Prohibido modificar producción de San Martín, su dominio, base de datos, credenciales y despliegue.
- Ninguna migración sobre datos reales antes de respaldo probado y verificación de RLS.
- No activar clientes sin autorización expresa del propietario.

## Evidencia inicial (main)
- React 19, Vite 7, Supabase JS y Capacitor 8 (package.json).
- src/supabase.js redirige *.vercel.app a voleysanmartin.com.ar; no reutilizar sin desacoplar.
- src/AppNew.jsx contiene APP_NAME, TAGLINE, LOGO, PUBLIC_APP_URL fijos.
- src/main.jsx importa numerosas capas de componentes y CSS; revisar superposiciones y dependencia real.
- supabase/schema.sql define perfiles y asistencia sin tenant_id; no representa necesariamente el esquema desplegado.
- supabase/functions/create-professor/index.ts autoriza por role=super_admin sin restricción institucional explícita.
- supabase/migrations/20260917_superadmin_professor_management.sql consulta y modifica profesores globalmente, sin filtro de institución.
- supabase/migrations/20261010_match_statistics_rls_hardening.sql requiere revisión de helpers de autorización.

## Modelo objetivo
- platform_owners: propietario global de plataforma.
- institutions: catálogo, branding, estado.
- institution_memberships: user_id, institution_id, role, estado; no confiar en role del cliente.
- licenses: institution_id, plan, estado, vigencia, restricciones.
- activation_codes: hash del código, institución, vencimiento, uso único, intentos, auditoría.
- Datos deportivos con institution_id y RLS por membresía efectiva.
- Alta de superadministrador mediante código de un solo uso, transacción atómica, aprobación del propietario y correo/contraseña propios.
- La licencia pertenece a la institución, no a una persona.

## Siete puertas de cierre
1. Auditoría y respaldo: inventario de módulos, migraciones, tablas, funciones, almacenamiento, permisos y entorno; respaldo/restauración comprobados.
2. Núcleo multiinstitucional: migraciones aisladas y pruebas de denegación cruzada.
3. Licencias: emisión, canje único, renovación, suspensión y auditoría server-side.
4. Registro/branding: pantalla neutral, selección de institución, aprobación y persistencia.
5. Módulos: asistencia, profesores, jugadores, categorías, pagos, estadísticas, planificación, pizarra, exportación y programación; pruebas por club.
6. Piloto Junín: compra simulada, alta autorizada, login, uso completo y recuperación.
7. Publicación: dominio separado, CI, respaldo, monitoreo, soporte y habilitación real.

## Alcance mínimo del lunes
- Instancia de prueba aislada; nunca producción de San Martín.
- Activación controlada por propietario y sesión de superadministrador institucional.
- Identidad Junín configurable sin escudo/colores inventados.
- Alta de profesores/jugadores y asistencia con aislamiento probado.
- Demás módulos solo si pasan pruebas; etiquetar claramente los pendientes.
- Sin prometer entrega pública hasta validar seguridad y flujo extremo a extremo.

## Estado del piloto aislado (21/11/2026)
- El proyecto `savptjiwzaypisayulwp` está separado: esquema 001 aplicado, 10 tablas y 11 políticas con RLS. La ampliación aditiva 003 de estados y auditoría también está aplicada. JNN conserva estado `pending`, Auth tiene 0 usuarios y Storage 0 buckets.
- La ampliación 004 permite crear futuras instituciones únicamente al propietario, en estado pendiente; fue aplicada y ensayada allí con una institución ficticia revertida. JNN permanece sin activar.
- `supabase/pilot/002_live_isolation_smoke.sql` aprobó en PostgreSQL real de ese proyecto con dos instituciones ficticias, identidad simulada por contexto SQL y `ROLLBACK`. Las pruebas locales del esquema y la compilación del piloto también aprobaron. Evidencia y límites detallados en `docs/VOLEY-JUNIN-IMPLEMENTACION.md`.
- La interfaz del piloto contiene registro, login, recuperación, propietario, categorías, jugadores, profesores y asistencia. Una Preview independiente y protegida muestra las pantallas públicas y rechazó un login ficticio inexistente. El flujo de confirmación por correo, JWT real/PostgREST y la navegación de los paneles **no están comprobados**. Juan Pablo sigue sin activar.

## Bloqueantes técnicos detectados
- El super_admin actual es global en funciones inspeccionadas; no habilitar multicliente con esa autorización.
- No se ensayaron Auth/correo reales ni permisos con JWT real desde PostgREST, ni la interfaz de extremo a extremo.
- Faltan una cuenta ficticia con correo verificable y pruebas autenticadas de interfaz y JWT/PostgREST. La Preview protegida no constituye todavía una entrega para uso real. No tocar el proyecto Vercel existente `asistencia-voley`.
- Administrador designado: Juan Pablo Solis (Junín Vóley JNN). Su correo definitivo se conserva fuera del repositorio. Cuenta aún no creada ni activada; falta confirmar datos institucionales y realizar pruebas de aislamiento.

## Criterio de ejecución
Implementar por dependencias, no fusionar con main ni desplegar producción sin autorización y pruebas. Cada cierre requiere evidencia, resultado reproducible y rollback.

## Punto de retorno C11 (23/11/2026, hora de Argentina)

El apartado «Estado del piloto aislado (21/11/2026)» conserva una fotografía histórica; sus afirmaciones sobre cero usuarios Auth y JNN pendiente ya no describen el estado actual. La cuenta temporal de JNN está confirmada y tiene acceso institucional de ensayo; el propietario conserva su autorización vinculada al UID original, pero su ingreso con contraseña aún no se revalidó. Club Ficticio B tiene licencia temporal de ensayo y una cuenta Auth confirmada, pero **no** tiene código canjeado ni membresía. Juan Pablo no está activado.

- Rama publicada: `feature/voley-comercial-junin-piloto`, commit `b025375`. Preview protegida `dpl_6zBCD3Bd9xaAimGWGTru8Z82sgEL`, estado `READY`: https://voley-comercial-junin-piloto-5kro7kz77-miga-mia.vercel.app/ . El proyecto comercial conserva SSO de Vercel para todos los despliegues y sus variables Preview solo nombran el Supabase comercial y la clave pública.
- C11: confirmaciones visibles tras guardar jugadores y asistencia; prevención de jornada sin fecha. Suite `test:pilot:browser` preparada con datos simulados, pero no ejecutada exitosamente: el Chromium de este entorno no pudo iniciar por denegación de sockets. La Preview `READY` tampoco prueba navegación autenticada.
- Verificaciones de esta revisión: 17/17 tests locales; compilación piloto de 84 módulos; compilación general de 184 módulos; `node --check` del simulador. No se solicitaron correos ni se usaron credenciales del propietario. No se modificó San Martín, `main` ni el proyecto Supabase.
- Matriz estricta: **8/20 (40 %)**. Permanecen bloqueantes las filas 17 y 18 de aislamiento PostgREST y Storage con dos JWT institucionales reales. Para habilitar Club B, el propietario debe recuperar acceso legítimo y emitir el código desde su panel, seguido del canje por su destinatario. Después se ejecuta `scripts/pilot-jwt-isolation.mjs` o el panel `?qa=1` en ambos sentidos. No sustituir ese recorrido con service_role ni con claims SQL simulados.

## Continuación C12 (23/11/2026)

El flujo deportivo distingue un guardado completado de una lectura posterior fallida; se evita la recarga redundante al cerrar sesión o tocar Actualizar. La integración local amplió duplicados, claves foráneas, reintentos de asistencia y mensajes ante error de red. `test:pilot` aprobó **21/21**, compilación piloto **85 módulos** y general **185 módulos**. Se preparó un ensayo SQL transaccional con `ROLLBACK`, validado en PGlite; no se ejecutó en Supabase comercial porque el conector devolvió denegación de permisos incluso para una consulta de solo lectura. No se aplicó migración nueva. La aceptación sigue 8/20 (40 %); los ensayos reales JWT, E2E y Android continúan pendientes. Consultar [seguridad](VOLEY-JNN-SEGURIDAD-20261123.md), [ruta E2E](VOLEY-JNN-E2E.md) y [alta comercial](VOLEY-JNN-ALTA-COMERCIAL.md).

Continuación: la actualización de una marca de asistencia pasó a consultar solamente asistencia, con el resto del panel intacto. `test:pilot:http` verificó el HTML y script del piloto servidos por Vite local, y pruebas nuevas ejercitaron recorte y tamaño de escudo; la suite local pasó **23/23**. Esta verificación no sustituye navegación E2E ni Storage real. La matriz continúa **8/20**.

## Punto de retorno C12 (23/11/2026)

- Última Preview protegida observada: `dpl_8UhcKzf8a97j4oJfFaXUfD8raFoz`, `READY`, commit de aplicación `d9fec72`, URL `https://voley-comercial-junin-piloto-mw6vrqr23-miga-mia.vercel.app/`. Se abrió la pantalla anónima en navegador de escritorio; no se inició sesión institucional ni se ensayó Android físico. El aviso de consola observado perteneció a la extensión del navegador.
- La prueba `011_integrity_transaction_smoke.sql` pasó **en PostgreSQL comercial real** desde la sesión autorizada del panel SQL, con `ROLLBACK` y cero clubes ficticios residuales. La denegación del conector Supabase fue específica de ese canal; no se aplicó migración nueva. La evidencia acredita integridad secuencial, no dos JWT ni concurrencia.
- Correcciones: las escrituras deportivas, del propietario y de identidad distinguen fallo de actualización posterior de fallo de escritura, evitando reintentos peligrosos; un escudo ya referenciado por la institución no se borra si falla la recarga. La prueba de dos JWT exige ahora contenido privado propio idéntico y nombres editados exactos. `test:pilot` **23/23**, `test:pilot:http` PASS, compilación piloto **85 módulos** y general **185 módulos**. La suite JWT sigue preparada, sin ejecución con usuarios reales.
- Próximo paso bloqueante: recuperar el ingreso legítimo del propietario **sin repetir intentos durante el límite de correos**; desde su propio panel emitir el código personal para Club Ficticio B y permitir el canje por la segunda cuenta autorizada. Solo entonces ejecutar `scripts/pilot-jwt-isolation.mjs` con dos sesiones Auth distintas y verificar PostgREST y Storage en ambos sentidos. No copiar JWT o códigos a GitHub, chat o capturas. Mantener a Juan Pablo sin activar.
- Matriz estricta [VOLEY-JNN-ACEPTACION.md](VOLEY-JNN-ACEPTACION.md): **8/20 (40 %)**. La Preview es demostración controlada, no entrega segura a usuarios reales.

Actualización de candidata: el commit de aplicación `da01e69` se publicó y la Preview `dpl_38E27qC6aoVFvbt4SjYwBRPpoo6C` llegó a `READY`, con SSO de Vercel vigente. URL exacta: `https://voley-comercial-junin-piloto-an9ouoqkl-miga-mia.vercel.app/`. Se abrió y capturó la pantalla inicial anónima en navegador de escritorio; esto no prueba ingreso ni navegación de los módulos. El commit posterior de pruebas `0d8ba40` ya forma parte de esa candidata. Los cambios posteriores al despliegue son documentales solamente.

# Punto de retorno C13 · 23/11/2026

Rama comercial publicada hasta el código `cb06b98` y documentación posterior. Preview `dpl_58hv2dMNn96qj3sub8nUALyU82Bf` en estado READY, protegida por SSO, URL `https://voley-comercial-junin-piloto-abqzopmrd-miga-mia.vercel.app/`. GitHub Actions `45113648424` aprobó el recorrido de navegador **con Supabase simulado** en móvil 390×844, escritorio 1280×800 y navegación de profesor simulado. Pruebas locales C13: 25/25, compilación aislada y general correctas. Se eliminaron el contexto institucional obsoleto al perder membresía visible y el formulario de edición de identidad para profesor; el panel de Storage compara los bytes del escudo propio. Ninguna migración nueva ni identidad real fue alterada.

La matriz sigue **8/20 (40 %)**: no hubo recorrido autenticado JNN en esta Preview ni dos JWT institucionales con PostgREST/Storage real. Club Ficticio B necesita emisión por el propietario y canje normal, sin alta manual de membresía. El acceso del propietario sigue sin resolución comprobada; no reiterar contraseñas ni recuperación mientras esté limitada la cuota de correo. Juan Pablo no fue activado. Esta candidata es para demostración controlada, no entrega productiva.

**Continuación C13, 23/11:** código publicado `f73669a`; Preview protegida `dpl_CrogRah3MezsVNqrcHbeiEQPc5Mg`, `READY`, URL `https://voley-comercial-junin-piloto-lf3mvrlj4-miga-mia.vercel.app/`. La consola de la pantalla inicial anónima no mostró errores propios; el proyecto Vercel sigue con SSO en todos los despliegues. GitHub Actions [45114643430](https://github.com/Mariano-Solis/asistencia-voley/actions/runs/45114643430) pasó cuatro recorridos de Chromium, incluido el aviso de lectura fallida después de guardar un jugador y la recuperación sin duplicar. **Supabase estuvo interceptado en esos recorridos.** Las 26 pruebas locales, ambas compilaciones y la prueba HTTP aislada pasaron. Una ejecución HTTP simultánea con otras compilaciones falló por colisión en `dist`, luego pasó en ejecución secuencial. No se accedió a Supabase comercial ni se emitió código nuevo. Aceptación: **8/20 (40 %)**. Próxima puerta: ingreso legítimo del propietario, emisión y canje normal para Club B, después dos JWT reales con PostgREST y Storage; Android físico queda aparte. No activar a Juan Pablo todavía.

Se publicó después `79e57cc`, con guía comercial y ensayo de suspensión/vencimiento de licencia en interfaz simulada. [Actions 45115307904](https://github.com/Mariano-Solis/asistencia-voley/actions/runs/45115307904) aprobó cinco recorridos; solo cambió documentación y prueba, por lo que la Preview anterior sigue representando el mismo código de aplicación. Supabase `get_project` mediante conector continúa devolviendo `INVALID_ARGUMENT`; no se ejecutaron consultas ni mutaciones en la base comercial en esta continuación. Puntuación **8/20 (40 %)**.

**Auditoría de continuidad, 23/11:** al fallar el conector, el panel autorizado de Supabase comercial permitió dos consultas de solo lectura. Mostró proyecto Healthy, tres usuarios Auth confirmados, un propietario verificado, RLS en diez tablas, JNN con una membresía y Club Ficticio B con cero; ambas licencias de ensayo activas y sin códigos pendientes, vigencia hasta el 24/11 23:59:59 hora Argentina. En Auth → URL Configuration, el alias estable de la rama está autorizado, mientras la URL única de la última Preview no aparece. La interfaz generaba `redirectTo` desde `location.origin`, por lo que un correo solicitado desde una Preview única no apuntaba explícitamente a una URL permitida. El piloto ahora usa el alias estable protegido para los enlaces de correo; el ingreso con contraseña conserva el flujo anterior. Las 27 pruebas locales, compilaciones piloto/general y HTTP local aprobaron. **No se envió correo, no se intentó contraseña y no se alteró la base.** La aceptación permanece **8/20 (40 %)** hasta ejecutar Auth y aislamiento reales.

**Versión candidata posterior:** commit de aplicación `2f1c876`; [Actions 45174794187](https://github.com/Mariano-Solis/asistencia-voley/actions/runs/45174794187) `success`, con enlace y recuperación de correo totalmente simulados y cinco recorridos de Chromium. Preview `dpl_FJ4PXd63gaP2pY1yJnJtCJwfAQ4P`, `READY`, URL `https://voley-comercial-junin-piloto-kjsx36ozm-miga-mia.vercel.app/`, target Preview y SSO habilitado para todos los despliegues. Se observó la pantalla inicial sin error de aplicación. **No prueba entrega de correo, sesión real o aislamiento.** Punto de retorno: propietario recupera acceso personalmente mediante el flujo oficial cuando la cuota lo permita; emite desde su panel código de ensayo para Club Ficticio B; Juan Pérez lo canjea con su cuenta confirmada; recién entonces ejecutar ambos sentidos de `scripts/pilot-jwt-isolation.mjs` y Storage con JWT Auth. Juan Pablo sigue sin activar.
