# Piloto comercial JNN · registro técnico (21/11/2026)

## Estado y protección

- Base de referencia: `feature/voley-comercial-junin-piloto` en `3ad58c9`.
- La aplicación existente sigue sirviendo `index.html`; `pilot.html` es una entrada React independiente. No importa `src/supabase.js`, que redirige hosts Vercel al dominio de San Martín y sustituye métodos de Auth.
- **No se ejecutó SQL ni se modificaron datos en la base productiva**. Inventario de solo lectura de la base existente: 16 tablas `public` con RLS, 49 políticas, 54 funciones `public`, 5 buckets, y 75 filas en `system_backup_runs`. Esas filas no demuestran restaurabilidad: falta respaldo y restauración ensayados en entorno separado.
- El esquema del piloto está en `supabase/pilot/001_isolated_pilot.sql`, fuera de `supabase/migrations` para impedir que una automatización histórica lo aplique a producción. Aborta si existen tablas `public.profiles`, `public.players` o `public.institutions`.
- **La base aislada todavía no existe; la migración y sus pruebas RLS aún no se han ejecutado. El piloto no está desplegado ni habilitado para usuarios reales.**

## Inventario de la base existente

`profiles`, `training_sessions`, `attendance`, `players`, `categories`, `admin_category_permissions`, `professor_registration_codes`, `monthly_payments`, `system_backup_runs`, `app_ui_settings`, `user_ui_preferences`, `training_library_items`, `match_stat_sessions`, `match_stat_events`, `planning_items`, `planning_item_files`.

Hay cinco buckets, pero sus nombres y reglas de acceso requieren revisión antes de migrar archivos. Las funciones Edge existentes son `auth-email` (referenciada por el cliente), `create-professor`, `update-player-account`, `review-payment-receipt`, `validate-payment-receipt` (las cuatro últimas están en el árbol del repositorio). Los módulos de San Martín incluyen asistencia, jugadores, categorías, profesores, programación, posiciones, partidos, estadísticas, pagos, planificación, pizarra y exportación XLSX; estos últimos siete **no están adaptados en el piloto**.

## Arquitectura mínima aplicada al código

Una base Supabase dedicada contiene `platform_owners`, `institutions`, `institution_memberships`, `institution_licenses`, `activation_codes`, `license_events`, `categories`, `players`, `training_sessions` y `attendance`. Los datos deportivos llevan `institution_id`, RLS por membresía activa y licencia vigente, y claves foráneas compuestas para rechazar referencias a otro club. La condición de propietario se obtiene de una tabla administrada por servidor, nunca de los metadatos de registro. El código se genera con aleatoriedad criptográfica en el servidor; la tabla guarda solamente SHA-256 y registra emisión/canje sin registrar el valor. El canje comprueba el correo confirmado de `auth.users` y bloquea la fila para uso único. La suspensión revoca códigos pendientes.

La pantalla independiente permite crear cuenta, entrar, canjear código, gestionar profesores registrados, categorías, jugadores, jornadas y asistencia; el propietario puede activar/suspender licencias y emitir códigos. Las funciones server-side validan esos permisos. Branding básico (nombre y color) es editable por el administrador. Escudo, pagos, estadísticas, planificación, pizarra, programación, posiciones y exportaciones quedan pendientes de adaptación y prueba.

## Instalación aislada y activación (pendiente de autorización externa)

1. Crear proyecto Supabase nuevo **en la organización elegida por Mariano**, únicamente si el costo informado es $0 o está autorizado. No usar el proyecto que contiene las tablas y los datos de San Martín.
2. Confirmar que el proyecto está vacío y aplicar `supabase/pilot/001_isolated_pilot.sql` en ese proyecto. Guardar el ID del proyecto y el ID de migración en este registro; nunca pegar claves secretas aquí.
3. Configurar en un proyecto Vercel **nuevo**, separado de `asistencia-voley`, las variables `VITE_PILOT_SUPABASE_URL` y `VITE_PILOT_SUPABASE_ANON_KEY` correspondientes solo al proyecto piloto. Comando de build: `npm run build:pilot`; salida: `dist`. Este comando exige las variables y genera solo la entrada piloto como `index.html`, sin importar ni empaquetar San Martín. La URL de entrega será la raíz del nuevo proyecto; configurar esa URL raíz en las redirecciones de Auth. Revisar Auth Site URL y los controles de acceso del despliegue.
4. El propietario crea cuenta con su correo y contraseña propios, confirma correo y un administrador de la base inserta su UUID confirmado en `public.platform_owners` mediante SQL editor: `insert into public.platform_owners(user_id) values ('UUID-VERIFICADO');`. No asignar este rol a Juan Pablo.
5. El propietario activa la licencia JNN con vigencia futura y emite un código destinado a `juampy9977@gmail.com`. Entrega el código a Juan Pablo por canal privado. Juan Pablo crea cuenta con **su propia contraseña**, confirma correo e ingresa el código en `/pilot.html`. No crear ni enviar una contraseña por terceros.
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
- `node --test tests/*.test.js`: 4 pruebas existentes pasan. Esas pruebas cubren cálculo de FMV, **no** RLS ni el flujo piloto.
- Pendientes: aplicación SQL, tests de RLS con dos clubes y cuentas reales de prueba, respaldo/restauración, despliegue separado y prueba de extremo a extremo. No hay URL pública válida todavía.
