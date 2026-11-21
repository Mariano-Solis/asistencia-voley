# Piloto comercial JNN · registro técnico (21/11/2026)

## Estado y protección

- Base de referencia: `feature/voley-comercial-junin-piloto` en `3ad58c9`.
- La aplicación existente sigue sirviendo `index.html`; `pilot.html` es una entrada React independiente. No importa `src/supabase.js`, que redirige hosts Vercel al dominio de San Martín y sustituye métodos de Auth.
- **No se ejecutó SQL ni se modificaron datos en la base productiva**. Inventario de solo lectura de la base existente: 16 tablas `public` con RLS, 49 políticas, 54 funciones `public`, 5 buckets, y 75 filas en `system_backup_runs`. Esas filas no demuestran restaurabilidad: falta respaldo y restauración ensayados en entorno separado.
- El esquema del piloto está en `supabase/pilot/001_isolated_pilot.sql`, fuera de `supabase/migrations` para impedir que una automatización histórica lo aplique a producción. Aborta si existen tablas `public.profiles`, `public.players` o `public.institutions`.
- El 21/11/2026 se verificó el proyecto nuevo `savptjiwzaypisayulwp`, organización `Voley Comercial` (plan Free), región `sa-east-1`, estado **Healthy**. Antes de aplicar el esquema no tenía tablas `public`, usuarios Auth ni migraciones. El conector Supabase seguía asociado a la cuenta anterior; se operó solo sobre el panel autenticado del nuevo proyecto. No se modificaron los proyectos de San Martín ni Mi Día.
- Se ejecutó `supabase/pilot/001_isolated_pilot.sql` **solo** en `savptjiwzaypisayulwp` mediante SQL Editor. Verificación posterior: 10 tablas `public`, 11 políticas, ninguna de esas tablas sin RLS; JNN y su licencia siguen en estado `pending`. La ejecución en SQL Editor no crea una entrada en el historial de migraciones de Supabase: el archivo del repositorio es la fuente reproducible. **El piloto no está desplegado ni habilitado para usuarios reales.**

## Inventario de la base existente

`profiles`, `training_sessions`, `attendance`, `players`, `categories`, `admin_category_permissions`, `professor_registration_codes`, `monthly_payments`, `system_backup_runs`, `app_ui_settings`, `user_ui_preferences`, `training_library_items`, `match_stat_sessions`, `match_stat_events`, `planning_items`, `planning_item_files`.

Hay cinco buckets, pero sus nombres y reglas de acceso requieren revisión antes de migrar archivos. Las funciones Edge existentes son `auth-email` (referenciada por el cliente), `create-professor`, `update-player-account`, `review-payment-receipt`, `validate-payment-receipt` (las cuatro últimas están en el árbol del repositorio). Los módulos de San Martín incluyen asistencia, jugadores, categorías, profesores, programación, posiciones, partidos, estadísticas, pagos, planificación, pizarra y exportación XLSX; estos últimos siete **no están adaptados en el piloto**.

## Arquitectura mínima aplicada al código

Una base Supabase dedicada contiene `platform_owners`, `institutions`, `institution_memberships`, `institution_licenses`, `activation_codes`, `license_events`, `categories`, `players`, `training_sessions` y `attendance`. Los datos deportivos llevan `institution_id`, RLS por membresía activa y licencia vigente, y claves foráneas compuestas para rechazar referencias a otro club. La condición de propietario se obtiene de una tabla administrada por servidor, nunca de los metadatos de registro. El código se genera con aleatoriedad criptográfica en el servidor; la tabla guarda solamente SHA-256 y registra emisión/canje sin registrar el valor. El canje comprueba el correo confirmado de `auth.users` y bloquea la fila para uso único. La suspensión revoca códigos pendientes.

La pantalla independiente permite crear cuenta, entrar, canjear código, agregar/suspender/reactivar profesores registrados, gestionar categorías y altas/desactivaciones/reactivaciones de jugadores, jornadas y asistencia; el propietario puede activar/suspender licencias y emitir códigos. Las funciones server-side validan esos permisos. Branding básico (nombre y color) es editable por el administrador. Escudo, pagos, estadísticas, planificación, pizarra, programación, posiciones y exportaciones quedan pendientes de adaptación y prueba.

## Instalación aislada y activación (pendiente de autorización externa)

1. Proyecto Supabase nuevo `savptjiwzaypisayulwp` creado y verificado sin datos productivos; conservarlo separado de San Martín.
2. Esquema `supabase/pilot/001_isolated_pilot.sql` aplicado y verificado en ese proyecto. Las futuras modificaciones deben ser scripts versionados adicionales, con pruebas y un registro de su ejecución; nunca pegues claves secretas aquí.
3. Configurar en un proyecto Vercel **nuevo**, separado de `asistencia-voley`, las variables de `pilot.env.example`. Obtener la clave **publicable** del proyecto nuevo, nunca una clave secreta o `service_role`. Comando de build: `npm run build:pilot`; salida: `dist`. Este comando acepta solo la URL de `savptjiwzaypisayulwp` y genera únicamente la entrada piloto como `index.html`, sin empaquetar San Martín. La URL de entrega será la raíz del nuevo proyecto; configurar esa URL raíz en las redirecciones de Auth. Revisar Auth Site URL y los controles de acceso del despliegue.
4. El propietario crea cuenta con su correo y contraseña propios, confirma correo y un administrador de la base inserta su UUID confirmado en `public.platform_owners` mediante SQL editor: `insert into public.platform_owners(user_id) values ('UUID-VERIFICADO');`. No asignar este rol a Juan Pablo.
5. Tras completar el ensayo Auth de extremo a extremo y recibir autorización posterior, el propietario activa la licencia JNN con vigencia futura y emite un código destinado a `juampy9977@gmail.com`. Entrega el código a Juan Pablo por canal privado. Juan Pablo crea cuenta con **su propia contraseña**, confirma correo e ingresa el código en la raíz del proyecto web independiente (`/`). No crear ni enviar una contraseña por terceros.
6. Antes de invitar a usuarios reales, completar el protocolo de aislamiento de abajo. No activar a Juan Pablo ni publicar el enlace como utilizable antes de esa verificación.

## Protocolo obligatorio de pruebas de seguridad

Usar solo cuentas ficticias A (administrador JNN), B (administrador de un segundo club ficticio), P (profesor JNN), X (sin membresía) en el proyecto nuevo. Crear institución ficticia y licencia mediante SQL del proyecto piloto; **nunca** crear usuarios ficticios en la base histórica.

| Caso | Resultado exigido |
| --- | --- |
| A lee/escribe categorías, jugadores, sesiones y asistencia JNN | Permitido |
| B y X consultan tablas deportivas JNN por filtro y por ID conocido | Cero filas |
| B y X intentan insertar, editar y borrar filas JNN | RLS deniega |
| A inserta jugador JNN con categoría B, o asistencia JNN con sesión/jugador B | FK deniega |
| A registra asistencia JNN de jugador en otra categoría JNN | Trigger deniega |
| P intenta crear categoría o administrar profesores/licencia | Denegado |
| A intenta emitir o suspender licencia | Denegado |
| A canjea código destinado a otro correo; código vencido o usado | Denegado |
| Propietario suspende licencia JNN; A vuelve a consultar y escribir | Denegado |
| Propietario renueva licencia; A recupera acceso sin pérdida de datos | Permitido |
| Sesión cerrada y token no autenticado | Sin acceso |

Probar además recarga de página, cierre/entrada de sesión, persistencia de asistencia, y que el dominio actual de San Martín y sus datos permanecen iguales. Registrar salidas reales por caso, sin declarar éxito por inspección de código.

## Evidencia local

- `npm ci --no-audit --no-fund`: correcto.
- `npm run build`: correcto; generó `dist/index.html` y `dist/pilot.html`.
- `npm run build:pilot` con URL y clave ficticias: correcto; genera únicamente la entrada piloto y sus dependencias, sin recursos públicos de San Martín. La validación de URL rechazó un host ficticio con guion y acepta las referencias Supabase de formato estándar; falta repetir con el proyecto aislado real.
- `node --test tests/*.test.js`: 4 pruebas existentes pasan. Esas pruebas cubren cálculo de FMV, **no** RLS ni el flujo piloto.
- `npm run test:pilot`: pasa en PostgreSQL WASM local. Ejecuta el SQL del piloto con sustitutos **solo en el entorno de prueba** para Supabase Auth y pgcrypto, que no vienen con PGlite; simula propietario, administradores de dos clubes, profesor y usuario sin acceso. Verifica canje único, correo del destinatario, control de licencia, filtros RLS, escrituras cruzadas, claves foráneas, categoría de asistencia y suspensión/reactivación de profesor y licencia. La criptografía y Auth reales no quedan validadas por estos sustitutos.
- `supabase/pilot/002_live_isolation_smoke.sql`: **PASS en PostgreSQL real del proyecto piloto**. Usa cinco identidades ficticias dentro de `BEGIN`/`ROLLBACK`, sin contraseñas ni correos reales; ejercita `auth.uid()` por contexto SQL, pgcrypto real, emisión/canje de códigos, RLS cruzado de categorías/jugadores/jornadas/asistencia, escrituras y borrado rechazados, clave foránea, rol de profesor y suspensión/renovación de licencia. Verificación posterior al rollback: 0 usuarios Auth, 1 institución JNN pendiente, 0 categorías, 0 jugadores, 0 asistencias y 0 códigos.
- `npm run test:pilot`: ahora incluye el ensayo del propio script de prueba en PostgreSQL WASM, además de la prueba local previa. **Las pruebas SQL no ejecutan el registro desde el navegador ni la confirmación de correo de Supabase Auth.**
- Pendientes: Auth/correo reales, verificación completa de la interfaz con cuentas ficticias, respaldo/restauración, despliegue separado y prueba de extremo a extremo. No hay URL pública válida todavía. **No activar a Juan Pablo ni publicar hasta cerrar esos puntos.**

## Continuación verificada el 21/11/2026 (posterior a `a27d0e8`)

- `supabase/pilot/003_account_status_and_audit.sql` se aplicó **exclusivamente** en `savptjiwzaypisayulwp` mediante el SQL Editor autenticado. La función `pilot_account_status()` devuelve solamente la membresía, estado institucional y vigencia del usuario autenticado, aun si está suspendido; `pilot_owner_events()` expone el historial de licencias/códigos únicamente al propietario. Ambas requieren rol `authenticated`. El SQL Editor no registra esta ejecución en `supabase_migrations`.
- Se comprobó la existencia de las funciones, que Auth tenía 0 usuarios y que Storage tenía 0 buckets. No se abrió almacenamiento de escudos: el aislamiento de archivos no es comprobable mientras no haya bucket ni política diseñada.
- Se volvió a ejecutar `002_live_isolation_smoke.sql` en PostgreSQL real del proyecto comercial, con resultado **PASS**. El script transaccional usa `ROLLBACK`: ejercita el estado de cuenta activo/suspendido, lectura de historial por propietario, denegación de historial a otro club, intento de escalar roles, modificación directa de licencia, traslado de `institution_id`, escrituras cruzadas y suspensión. Las identidades Auth se simulan dentro de SQL; no demuestra el comportamiento de un JWT real vía PostgREST.
- La interfaz implementa registro, ingreso, salida, solicitud de recuperación, actualización de contraseña desde el enlace, comprobación de usuario con `getUser`, estados de membresía/licencia, panel de licencia e historial para el propietario, historial de asistencia y CSV. **La compilación y las pruebas SQL no prueban estos flujos desde el navegador.** El correo de recuperación y el enlace de confirmación requieren una URL de Preview separada y permitida en Auth.
- `vite.config.js` rechaza claves Supabase `sb_secret_` o JWT de `service_role` antes de generar un bundle; `build:pilot` sigue exigiendo la URL exacta del proyecto comercial. Ningún archivo de configuración del piloto incorpora una credencial de San Martín.
- `npm run test:pilot`: dos pruebas locales aprobadas con el esquema 001+003 y el script 002 actualizado. `npm run build` y `npm run build:pilot` con URL real del proyecto y **clave pública ficticia**: correctos. Los cuatro tests existentes de FMV también aprobaron. El build ficticio sirve para validar empaquetado; no sirve para ingresar ni desplegar. Intento de Chromium local: el ejecutable abortó al crear un socket (`Operation not permitted`); la navegación visual quedó sin ensayar.
- Vercel muestra el proyecto existente `asistencia-voley`; no se modificó. Todavía no hay proyecto ni Preview independiente. La publicación permanece pendiente hasta conseguir clave publicable del nuevo proyecto, URL protegida sin costo, Auth probado con un correo ficticio verificable y navegación real. No se usó la cuenta ni el correo de Juan Pablo para pruebas.

### Recuperación y continuidad

El esquema 003 es aditivo. Si se necesita revertirlo **solo en el proyecto comercial**, después de confirmar que ningún cliente lo usa: `drop function public.pilot_owner_events(uuid,int); drop function public.pilot_account_status();`. Esto elimina únicamente esas funciones, no borra registros. Antes de seguir con Auth real, registrar una URL separada de Preview en la lista de redirecciones de Supabase Auth, emplear una clave **publicable**, crear identidades ficticias con buzones verificables y probar denegaciones con sus JWT desde PostgREST además de la interfaz. Mantener JNN en estado `pending` y sin cuenta real hasta superar esos controles.
