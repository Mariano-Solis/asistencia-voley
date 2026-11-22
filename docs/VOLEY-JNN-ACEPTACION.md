# Matriz de aceptación de la demostración JNN

Fecha: 22/11/2026. Criterio estricto: una fila solo se aprueba cuando el recorrido concreto se observó o su prueba automatizada ejercita el comportamiento que se declara. Las pruebas SQL con `request.jwt.claim.sub` simulado no equivalen a solicitudes con JWT Auth real. La compilación tampoco equivale a una prueba del navegador.

| # | Requisito obligatorio | Implementado | Probado | Evidencia y tipo | Riesgo / estado |
|---|---|---|---|---|---|
| 1 | Inicio de sesión del propietario | Sí | Sí | Captura del panel autenticado en Android del titular, 22/11 | Aprobado en Preview anterior |
| 2 | Inicio de sesión del administrador temporal | Sí | Sí | Captura del panel JNN con rol Administrador, 22/11 | Aprobado en Preview anterior |
| 3 | Licencia temporal y vínculo institucional | Sí | Sí | Consulta de solo lectura: activa, una membresía y código canjeado; 22/11 | Aprobado como ensayo; no comercial definitivo |
| 4 | Emisión y recanje único desde sesiones reales | Sí | No | Emisión y primer canje observados; rechazo de segundo canje solo SQL simulado | Pendiente recanje real y concurrencia |
| 5 | Identidad provisional JNN sin escudo erróneo | Sí | Sí | Captura Android de cabecera JNN; consulta de logo sin asignar | Aprobado como identidad provisional |
| 6 | Carga, recorte y persistencia de escudo privado | Sí | No | Tests locales de archivo/paleta y SQL simulado de política; falta subida real | Pendiente JWT Storage y Android |
| 7 | Alta de categoría desde Android | Sí | Sí | Captura con categoría Sub16 Piloto, 22/11 | Aprobado en Preview anterior |
| 8 | Edición de categoría | Sí | No | Código y compilación local 22/11; sin ensayo autenticado | Pendiente |
| 9 | Alta de jugador desde Android | Sí | Sí | Captura de Jugador de Prueba JNN, 22/11 | Aprobado en Preview anterior |
| 10 | Edición, búsqueda y baja lógica de jugador | Sí | No | Código y compilación local; sin ensayo Auth posterior | Pendiente |
| 11 | Registro de asistencia | Sí | Sí | Captura Presente del jugador ficticio, 22/11 | Aprobado en Preview anterior |
| 12 | Historial de asistencia | Sí | Sí | Captura de jornada y total, 22/11 | Aprobado en Preview anterior |
| 13 | Filtros de fecha, categoría y jugador | Sí | No | Test local de selección CSV 11/11; falta navegación autenticada | Pendiente |
| 14 | CSV corregido desde Android y planilla | Sí | No | Descarga Android del CSV previo; traducción Presente/Tarde/Ausente y tildes probadas localmente | Pendiente nueva descarga y apertura |
| 15 | Profesores y permisos | Sí | No | RPC y RLS ensayadas con SQL simulado; sin profesor Auth real | Pendiente |
| 16 | Cierre, persistencia y recuperación Auth | Sí | No | Formularios implementados; no se observó el ciclo completo reciente | Pendiente |
| 17 | Aislamiento PostgREST con dos JWT institucionales | Sí | No | SQL local y transaccional con claims simulados; no hay dos sesiones reales de clubes | Bloqueante crítico |
| 18 | Aislamiento de Storage con dos JWT | Sí | No | Políticas y rutas SQL simuladas; sin subidas/descargas reales | Bloqueante crítico |
| 19 | Interfaz del panel en Android | Sí | Sí | Capturas físicas enviadas por el titular: navegación y asistencia | Aprobado en Preview anterior; cambios nuevos pendientes |
| 20 | Recorrido completo en computadora | Sí | No | Pantalla anónima y compilación; sin sesión institucional de escritorio | Pendiente |

**Resultado estricto: 9/20 = 45 %.** No se alcanzó la meta del 90 %. La ausencia de los controles 17 y 18 impide declarar la entrega segura aunque aumente el porcentaje. El dato compara requisitos de la demostración, no módulos históricos migrados.

## Pruebas de esta iteración

- `npm run test:pilot`: 11/11 (PGlite local, parseo de script SQL, exportación, paleta, Court Track y validación de imagen). No usa dos JWT Auth reales.
- `npm run build:pilot`: 80 módulos, con URL comercial y clave pública ficticia **solo local para compilar**. No es prueba del despliegue.
- `npm run build`: 180 módulos, correcto. Incluye la aplicación histórica, sin desplegarla en San Martín.

## Siguiente puerta verificable

La segunda identidad autorizada confirmó el enlace normal y Supabase Authentication mostró `Confirmed` y `Last signed in` el 22/11. Se creó Club Ficticio B (`club-ficticio-b-20261122`) en el proyecto comercial con licencia de ensayo activa hasta el 24/11/2026 23:59:59 (Argentina); la comprobación posterior mostró cero membresías y cero códigos. El propietario aún debe emitir el código personal desde su panel y el destinatario canjearlo. Esto **no** aprueba todavía las filas 4, 17 o 18.

Una vez que ambas membresías estén activas, ejecutar `scripts/pilot-jwt-isolation.mjs` con dos JWT Auth vigentes y distintos, proporcionados solo al entorno local del proceso; el script rechaza claves secretas, crea sus propios registros ficticios y comprueba solicitudes directas sobre PostgREST y Storage. No colocar JWT, correo ni código en comandos compartidos, chat, capturas, logs o Git. El script se limita al host comercial y requiere la clave publicable. Registrar solo sus etiquetas PASS y comprobar que se limpiaron los objetos y filas de ensayo. El archivo está preparado, **no ejecutado con JWT reales**.

La Preview añade además un panel de ensayo solo para un superadministrador autenticado al abrir el **alias estable** con `?qa=1`. Cada administrador prepara una categoría, un jugador, una jornada y un archivo PNG ficticios con su JWT actual; copia al otro únicamente los cinco identificadores mostrados. Cada uno ejecuta las denegaciones cruzadas y descarga el informe JSON sin credenciales. El panel debe indicar PASS en ambos sentidos y limpiar sus propios datos **después** de que ambos completaron el ensayo. Si un control falla, conservar evidencia y no habilitar usuarios reales. El panel está implementado y compilado, **no probado aún con dos sesiones institucionales reales**.

## Análisis de los 11 requisitos pendientes

| Fila | Comprobación exacta pendiente | Automatizable y dependencia |
|---|---|---|
| 4 | Segundo canje real del código ya consumido y emisión/canje con sesiones de propietario y destinatario | Sí, con sesiones Auth y un código de ensayo; concurrencia requiere dos solicitudes controladas |
| 6 | Subida, recorte, guardado y lectura de escudo tras recarga/cambio de dispositivo; rechazo Storage cruzado | Parcialmente: API automatizable con dos JWT; recorte Android físico manual |
| 8 | Renombrar categoría desde sesión institucional, recargar y verificar valor | Sí en navegador autenticado; Android físico manual |
| 10 | Editar jugador, buscar, filtrar, desactivar y verificar persistencia | Sí en navegador autenticado; Android físico manual |
| 13 | Filtrar historial por fecha, categoría y jugador y comprobar conteos/filas | Sí en navegador autenticado |
| 14 | Descargar CSV nuevo en Android y abrirlo en planilla, comparar tildes, estados y filas | Generador automatizado; descarga y apertura físicas manuales |
| 15 | Profesor Auth propio: lectura permitida, administración/roles/licencias rechazados y suspensión | Sí, pero requiere tercer usuario verificado distinto de ambos administradores |
| 16 | Cerrar, volver a entrar, persistencia y recuperación de contraseña | Navegador parcialmente automatizable; enlace de correo requiere titular |
| 17 | Solicitudes cruzadas GET/POST/PATCH/DELETE y cambio de `institution_id` con dos JWT | Sí, tras canje B; `scripts/pilot-jwt-isolation.mjs` preparado |
| 18 | Subida/descarga/firma y modificación de rutas ajenas con dos JWT | Sí, tras canje B; script preparado, contenido y limpieza deben verificarse |
| 20 | Recorrido completo de escritorio con sesión JNN, categoría, jugador, asistencia, historial, CSV y salida | Sí con sesión autorizada en navegador de escritorio |

La prueba anónima real del 22/11 obtuvo HTTP 401 al leer `players` e `institutions`; la lista del bucket privado respondió HTTP 200 con **cero objetos visibles**. Es una comprobación adicional de denegación anónima, no una prueba de aislamiento entre dos usuarios.

## Otras funciones

La búsqueda Court Track consulta un índice acotado FMV y exige selección explícita del propietario; no es catálogo universal y no se asignó escudo. La configuración manual permite operar sin proveedor. Planificación, estadísticas, pizarra, programación, posiciones y pagos no forman parte de esta candidata. El rol de profesor conserva las restricciones de servidor, pero falta prueba con su propio JWT.
