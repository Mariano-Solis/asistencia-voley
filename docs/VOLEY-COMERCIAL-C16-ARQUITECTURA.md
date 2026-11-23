# C16 · Recuperación funcional sin conectar la base municipal

Fecha de revisión: 23/11/2026. Rama exclusiva: `feature/voley-comercial-junin-piloto`.

## Referencia y límite de la evidencia

La última revisión original recuperable en `origin/main` es `1df4ee7c46cf36cccfc47f01cce2524879691b2e` (04/11/2026, hora Argentina). **No consta cuál fue el commit exacto que vio Junín.** Los componentes históricos `AppNew.jsx`, `ProgramacionHub.jsx`, `PlanningHub.jsx`, `QuickTacticalBoard.jsx` y `PaymentHubStable.jsx` de la rama comercial coinciden con esta referencia; que el código esté presente no significa que la versión comercial lo ejecute. El inventario detallado por módulo y sus pruebas pendientes está en `VOLEY-COMERCIAL-PARIDAD-FUNCIONAL.md`.

## Elección de arquitectura

| Vía | Tiempo relativo | Dependencias y esquema | Riesgo de permisos/datos | Mantenimiento |
|---|---|---|---|---|
| A. Completar la pantalla comercial por separado | Alto: reimplementar cada operación y cálculo | Nuevas tablas y migraciones por módulo | Medio si se prueba todo; riesgo de divergencia funcional | Dos implementaciones |
| B. Copiar y arrancar el monolito municipal | Corto para mostrar pantallas, largo para asegurar persistencia | Importa `src/supabase.js`, endpoints FMV, tablas, funciones y Storage globales | **Crítico**: referencias municipales y autorización global; no apto para Preview comercial | Dos monolitos divergentes |
| C. Compartir lógica/UI pura y añadir adaptadores comerciales | Medio, incremental | Extraer solo piezas sin cliente municipal; adaptar operaciones a `institution_id`, licencia y RLS por módulo | Controlable si cada módulo tiene pruebas positivas y negativas antes de habilitarse | Una fuente de cálculo/interfaz compartida |

**Seleccionada C.** Los componentes originales permanecen intactos mientras se extraen funciones puras y se habilitan operaciones comprobadas. Ninguna pantalla original que importe `src/supabase.js` se conecta automáticamente al piloto. Las funciones privilegiadas, pagos, imágenes y fuentes externas requieren revisión específica. Esta estrategia preserva producción y evita anunciar equivalencia aparente.

## Primer incremento verificado: resumen de jugadores XLSX

Se reutiliza `exportCategoryWorkbook` de `src/xlsxCategoryExport.js` con un editor de metadatos (`publisher`) opcional; su valor por defecto conserva los metadatos municipales para la aplicación original. El adaptador `src/pilot/categoryWorkbook.js` construye la planilla con categorías de la institución y **solo los jugadores ya visibles tras los filtros del panel**, y publica el nombre de ese club como autor. Se ofrece en Jugadores como «Resumen por categoría XLSX». No consulta tablas adicionales, no contiene datos privados ni se habilita el módulo municipal.

Verificación local: dos pruebas nuevas comprueban filas, selección, archivo ZIP/XLSX, metadatos institucionales, ausencia de nombres filtrados o ajenos y el valor municipal por defecto. Suite 36/36 de ese commit y compilaciones correctas. El recorrido Chromium con backend **simulado** pasó en [CI 45222166018](https://github.com/Mariano-Solis/asistencia-voley/actions/runs/45222166018), incluida descarga y firma ZIP. El navegador local no arrancó (`socket() Operation not permitted`). La descarga física Android y su apertura en una planilla siguen pendientes. Sin cambios de esquema ni migraciones C16.

El resumen XLSX es una **operación parcial**: faltan detalle histórico, campos privados bajo autorización, exportación de programación y pagos, y comprobar que cada formato coincide con el original. No cambia el estado de paridad completa de ninguno de los diez bloques históricos.

## Segundo incremento: pizarra original compartida

El editor de trazos, fichas, pelota, rotaciones, modos de cancha y controles se extrajo literalmente de `PlanningHub.jsx` a `TacticalBoardCore.jsx`. `PlanningHub` lo importa y reexporta, y `QuickTacticalBoard` ahora lo consume sin importar el cliente municipal ni la planificación. La pizarra original conserva las claves `mgsm-*`; en el piloto se le pasan dos UUID verificados (club y usuario) y sus guardados/presets usan claves `voley-commercial-board:*` distintas. El componente se desmonta y remonta cuando cambia la sesión de club/usuario.

La pestaña Pizarra está disponible solo en el contexto de una membresía/licencia activa, con una leyenda explícita de que el guardado es **local al dispositivo**. No se afirma sincronización entre dispositivos. La prueba unitaria comprueba separación de claves por club, usuario y versión original; el recorrido de navegador con backend simulado cubre abrir, cerrar y ausencia de escritura municipal. Suite local 37/37 y ambas compilaciones pasan; **el navegador y Android físicos permanecen pendientes**. No se modificó Supabase ni producción municipal.

## Continuación crítica

1. Ejecutar el recorrido Chromium en CI y comprobar descarga XLSX en Android.
2. Habilitar `VITE_PILOT_PLAYER_PARITY=1` solo después de dos JWT Auth institucionales con denegaciones PostgREST/Storage reales; actualmente está apagado en Preview.
3. Recuperar núcleo de asistencia (tipos, invitados, guardado y edición) con modelo por club, permisos y regresión.
4. Completar recorrido Chromium y prueba física de la pizarra compartida; luego planificación y sus archivos privados.
5. Para competencia, documentar y sustituir dependencia FMV específica sin usar el endpoint productivo municipal. Para pagos, diseñar cuenta de destino, comprobantes y autorizaciones propias antes de mostrar interfaz.

**Entrega:** no hay equivalencia integral comprobada con San Martín. La Preview protegida vigente solo demuestra el subconjunto indicado en la matriz de aceptación; no corresponde presentarla como sustituto completo. Tampoco hay un entorno original aislado y autorizado con datos de demostración para ofrecer una demostración alternativa sin tocar producción.
