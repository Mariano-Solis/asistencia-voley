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

Conseguir una segunda identidad de ensayo controlada y confirmada por el flujo normal de correo, sin utilizar la cuenta del propietario como club B. Preparar dos clubes ficticios y licencias de ensayo reversibles. Registrar JWT de cada sesión solo en memoria, nunca en logs ni repositorio; ejecutar POST/GET/PATCH/DELETE sobre PostgREST y upload/download sobre Storage con cada identidad, capturar códigos de estado y resultados sin datos privados, y limpiar solo las filas inequívocamente ficticias. Si no existe una segunda casilla bajo control del titular, esta puerta queda pendiente; no confirmarla artificialmente.

## Otras funciones

La búsqueda Court Track consulta un índice acotado FMV y exige selección explícita del propietario; no es catálogo universal y no se asignó escudo. La configuración manual permite operar sin proveedor. Planificación, estadísticas, pizarra, programación, posiciones y pagos no forman parte de esta candidata. El rol de profesor conserva las restricciones de servidor, pero falta prueba con su propio JWT.
