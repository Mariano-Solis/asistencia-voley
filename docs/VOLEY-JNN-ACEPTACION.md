# Matriz de aceptación de la demostración JNN

Fecha: 22/11/2026. Criterio estricto: una fila solo se aprueba cuando el recorrido concreto se observó o su prueba automatizada ejercita el comportamiento que se declara. Las pruebas SQL con `request.jwt.claim.sub` simulado no equivalen a solicitudes con JWT Auth real. La compilación tampoco equivale a una prueba del navegador.

| # | Requisito obligatorio | Implementado | Probado | Evidencia y tipo | Riesgo / estado |
|---|---|---|---|---|---|
| 1 | Inicio de sesión del propietario | Sí | No, en la candidata actual | Captura anterior del panel Android; intento actual rechazado por Auth HTTP 400 | Bloqueado hasta recuperar acceso y repetir la prueba |
| 2 | Inicio de sesión del administrador temporal | Sí | Sí | Captura del panel JNN con rol Administrador, 22/11 | Aprobado en Preview anterior |
| 3 | Licencia temporal y vínculo institucional | Sí | Sí | Consulta de solo lectura: activa, una membresía y código canjeado; 22/11 | Aprobado como ensayo; no comercial definitivo |
| 4 | Emisión y recanje único desde sesiones reales | Sí | No | Emisión y primer canje observados; rechazo de segundo canje solo SQL simulado | Pendiente recanje real y concurrencia |
| 5 | Identidad provisional JNN sin escudo erróneo | Sí | Sí | Captura Android de cabecera JNN; consulta de logo sin asignar | Aprobado como identidad provisional |
| 6 | Carga, recorte y persistencia de escudo privado | Sí | No | Tests locales de archivo/paleta y SQL simulado de política; falta subida real | Pendiente JWT Storage y Android |
| 7 | Alta de categoría desde Android | Sí | Sí | Captura con categoría Sub16 Piloto, 22/11 | Aprobado en Preview anterior |
| 8 | Edición de categoría | Sí | No | PGlite local: cambio de nombre y lectura posterior correctos; falta ensayo Auth en Preview | Pendiente interfaz autenticada |
| 9 | Alta de jugador desde Android | Sí | Sí | Captura de Jugador de Prueba JNN, 22/11 | Aprobado en Preview anterior |
| 10 | Edición, búsqueda y baja lógica de jugador | Sí | No | PGlite local: edición, búsqueda y cambio de categoría sin historial; falta búsqueda/filtros/baja en Preview autenticada | Pendiente interfaz autenticada |
| 11 | Registro de asistencia | Sí | Sí | Captura Presente del jugador ficticio, 22/11 | Aprobado en Preview anterior |
| 12 | Historial de asistencia | Sí | Sí | Captura de jornada y total, 22/11 | Aprobado en Preview anterior |
| 13 | Filtros de fecha, categoría y jugador | Sí | No | Test local de selección CSV 11/11; falta navegación autenticada | Pendiente |
| 14 | CSV corregido desde Android y planilla | Sí | No | Descarga Android del CSV previo; traducción Presente/Tarde/Ausente y tildes probadas localmente | Pendiente nueva descarga y apertura |
| 15 | Profesores y permisos | Parcial | No | Alta, suspensión y permisos de rol ensayados con SQL simulado; sin profesor Auth real; asignación por categoría no implementada | Pendiente identidad y alcance por categoría |
| 16 | Cierre, persistencia y recuperación Auth | Sí | No | Formularios implementados; no se observó el ciclo completo reciente | Pendiente |
| 17 | Aislamiento PostgREST con dos JWT institucionales | Sí | No | SQL local y transaccional con claims simulados; no hay dos sesiones reales de clubes | Bloqueante crítico |
| 18 | Aislamiento de Storage con dos JWT | Sí | No | Políticas y rutas SQL simuladas; sin subidas/descargas reales | Bloqueante crítico |
| 19 | Interfaz del panel en Android | Sí | Sí | Capturas físicas enviadas por el titular: navegación y asistencia | Aprobado en Preview anterior; cambios nuevos pendientes |
| 20 | Recorrido completo en computadora | Sí | No | Pantalla anónima y compilación; sin sesión institucional de escritorio | Pendiente |

**Resultado estricto actual: 8/20 = 40 %.** El resultado anterior era 9/20 (45 %); el acceso del propietario dejó de estar demostrado para esta candidata y la fila 1 pasó a pendiente. No se alcanzó la meta del 90 %. La ausencia de los controles 17 y 18 impide declarar la entrega segura aunque aumente el porcentaje. El dato compara requisitos de la demostración, no módulos históricos migrados.

**Iteración C10:** se añadió la migración `010` exclusivamente al proyecto comercial. El catálogo real mostró 2 triggers y 3 políticas restrictivas nuevas, sin alterar la única asistencia ya registrada; una transacción ficticia comprobó los dos rechazos de borrado y terminó en `ROLLBACK`, con 0 clubes residuales. PGlite local comprobó que un profesor no borra asistencias, jornadas ni jugadores; un administrador puede limpiar una jornada ficticia después de retirar su asistencia. Esto mejora la integridad, pero no sustituye las pruebas con JWT reales de las filas 15, 17 y 18. **Puntuación: 8/20 (40 %).**

## Incidencia de acceso del propietario (22/11, noche)

Consulta de solo lectura en `auth.users`, `auth.identities` y `platform_owners` del proyecto comercial, **sin consultar ni registrar el verificador**: un único usuario del correo del propietario; correo confirmado; una identidad `email`; verificador de contraseña presente; UID original conservado; un registro de autorización de propietario vinculado a ese UID. La existencia del verificador no demuestra que una contraseña concreta coincida con él ni cuándo se estableció.

Los registros de Auth del mismo proyecto mostraron `POST /auth/v1/recover` con HTTP 429 y dos `POST /auth/v1/token?grant_type=password` con HTTP 400. Un intento de `/auth/v1/otp` también fue limitado. El formulario actual utiliza `signInWithPassword({ email, password })` y el correo se normaliza sin modificar la contraseña. Vercel Preview declara exclusivamente URL `https://savptjiwzaypisayulwp.supabase.co` y una clave publicable; el build aislado rechaza otra URL y claves secretas. La redirección de recuperación usa el alias estable autorizado; la entrada con contraseña no depende de ese enlace. No se determinaron el motivo interno preciso del rechazo 400 ni la correspondencia de la contraseña que el titular conoce: **acceso actual no recuperado y fila 1 no revalidada**.

Corrección de interfaz: al pasar a sesión iniciada, cerrada o recuperación se limpia el aviso previo; el límite de correos explica que el envío está temporalmente restringido y que el ingreso con contraseña es otra operación. No se cambió Auth, usuario, hash, rol, licencia o límite. Pruebas locales: test del mensaje 429 y conservación del rechazo 400, más compilación aislada. Falta comprobar esa versión en Preview y el ingreso real del titular.

Recuperación segura: esperar a que se reponga la cuota de correos sin reiterar solicitudes. Desde el alias estable protegido, elegir **Recuperar acceso**, introducir únicamente el correo propio y enviar **una** solicitud. Si vuelve 429, esperar y revisar la cuota de Auth antes de otro intento. Abrir el enlace más reciente en el mismo navegador protegido, completar **Elegí una contraseña nueva** personalmente, cerrar sesión y entrar con esa contraseña. Verificar panel propietario y acceso a Club Ficticio B antes de emitir un código de ensayo. Nunca compartir contraseña, enlaces ni códigos en chat; no registrar otra cuenta. Este procedimiento sigue pendiente del titular y de la cuota. Club Ficticio B tiene licencia de ensayo activa, sin código ni membresía aún: su activación y pruebas de dos JWT siguen bloqueadas.

## Pruebas de esta iteración

**Actualización 23/11 (sin intervención del titular):** `npm run test:pilot` 14/14; compilación aislada 82 módulos y general 182 módulos. La integración local PGlite ahora comprueba alta/edición de categorías y jugadores, búsqueda SQL, los tres estados de asistencia, historial filtrado por jugador, permisos de profesor, suspensión y nuevas barreras de integridad. En PostgreSQL real del proyecto comercial, la migración `009_sports_tenant_and_history_guards.sql` instaló seis triggers; un ensayo con `ROLLBACK` comprobó actualización legítima de asistencia y rechazo de cambio de categoría de jugador/jornada con asistencia y cambio de institución; cero registros de ensayo persistidos. Auditoría de catálogo: 10/10 tablas del piloto con RLS, cuatro políticas `pilot_brand_%`, bucket privado de 2 MB, sin permiso `anon` para emitir códigos y sin escritura directa de `platform_owners` ni `institution_licenses` para `authenticated`. Son pruebas SQL y de privilegios, **no dos JWT**.

La Preview `dpl_EDhCPnSaX82W1hT8tbr5rJ5MVgdN` se abrió en navegador de escritorio sin credenciales: pantalla inicial, cuatro formularios, validación de campo obligatorio y consola sin errores de la aplicación (un error de metadatos provino de una extensión del navegador). No se ejecutó un recorrido autenticado ni una prueba física Android en esta iteración. La fila 20 sigue pendiente. El script de dos JWT ahora considera HTTP 500 fallo del ensayo y nunca lo cuenta como denegación; todavía no se ejecutó porque Club Ficticio B carece de membresía.

**Puntuación sin cambios: 8/20 (40 %).** Mejoró la integridad y la preparación de pruebas, pero las filas pendientes exigen el recorrido concreto indicado en la tabla.

La siguiente revisión local amplió el profesor simulado, corrigió la selección de una membresía utilizable entre varias y reemplazó el caso irreal de CSV duplicado por tres jugadores distintos. `test:pilot`: **15/15**, `build:pilot`: 83 módulos, `build`: 183 módulos. No cambió la puntuación porque faltan sesiones reales y ensayo de interfaz.

El panel de aislamiento y su limpieza fueron endurecidos para no marcar un error 500 o una eliminación vacía como éxito. `test:pilot`: **16/16**, `build:pilot`: 84 módulos, `build`: 184 módulos. Las filas 17 y 18 siguen pendientes hasta ejecutarlo con dos JWT reales y confirmar el borrado de los datos ficticios.

La validación del panel exige ahora formato y ruta institucional coherentes para los datos ficticios del otro club. `test:pilot`: **17/17**; ambas compilaciones correctas. Un formato válido no prueba la existencia del objeto remoto: sigue faltando la comprobación real con dos JWT distintos. Puntuación **8/20 (40 %)**.

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
