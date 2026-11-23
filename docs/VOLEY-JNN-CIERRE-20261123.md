# C18 · Cierre extraordinario de Vóley Comercial JNN

Fecha: 23/11/2026. Referencia técnica original: `main` `1df4ee7` (04/11/2026). **Se desconoce el commit exacto mostrado a Junín.** Ningún cambio de esta misión se hizo sobre `main`, la base ni el dominio municipales.

## Dictamen

**C — ENTREGA NO AUTORIZABLE.** La Preview protegida representa un piloto reducido. No hay equivalencia funcional completa con la aplicación que conoció el comprador, ni evidencia de aislamiento cruzado PostgREST/Storage con dos JWT Auth institucionales reales. No ofrecerla a Junín como sustituto del sistema original ni activar al administrador definitivo.

Tampoco hay una **demostración aislada del original** lista: levantar los componentes municipales existentes conectaría funciones, tablas y servicios de San Martín. Hace falta adaptar el backend y datos ficticios antes de poder elegir B. El estado READY de Vercel y los ensayos con respuestas simuladas no prueban esa alternativa.

## Alcance contrastado con el original

| Bloque histórico | Funcionalidad original de referencia | Estado comercial comprobado y diferencia |
|---|---|---|
| Categorías y jugadores | Rama, altas, edición, desactivación, categoría automática/manual, ficha privada, foto, autoservicio | Altas, búsqueda, filtros, edición básica y asistencia piloto; campos y foto ampliados tras bandera desactivada. Faltan autoservicio, MASTER/B y JWT de las ampliaciones. **Paridad no comprobada.** |
| Asistencia e historial | Entrenamiento/partido/torneo, invitados, jornadas múltiples, edición, resolución de conflictos, analíticas e informes XLSX | La UI vigente permite entrenamiento y marcas individuales; 016 añade guardado atómico y actividades, con interfaz avanzada apagada. C18 recupera porcentajes filtrados, corrige selección de entrenamiento y añade informe XLSX de asistencia por categoría/período, expresamente sin cuotas. Faltan invitados, jornadas múltiples, informes completos y prueba Auth de lo nuevo. **Paridad no comprobada.** |
| Profesores | Alta, aprobación, ficha, categorías y permisos finos, suspensión, pestañas | Alta de cuenta confirmada, suspensión y asignación por categoría preparada. La UI ya respeta `can_edit`/`can_attendance` aun en modo anterior; sin JWT de profesor ni conjunto original de pestañas. **Paridad no comprobada.** |
| Programación y partidos | Fechas, rivales, resultados, filtros y planillas FMV | No hay adaptador comercial completo ni fuente autorizada equivalente. No usar endpoints municipales privados. **Ausente.** |
| Posiciones y comparaciones | Tablas por rama/categoría y escenarios | La lógica histórica permanece en el código y sus 4 pruebas puras pasan, pero no hay fuente ni interfaz comercial institucional. **Ausente.** |
| Estadísticas de partidos | Formación, dorsales, sets, técnica, rotación, corrección, cierre, archivo y resumen | No hay persistencia ni interfaz comercial autorizada. **Ausente.** |
| Planificación y entrenamiento | Ejercicios, imágenes, enlaces, archivos, horarios y permisos por categoría | No hay Storage ni persistencia institucional de estos contenidos. **Ausente.** |
| Pizarra | Fichas, trazos, rotación y presets | Componente original compartido con guardado local separado por club/usuario. El navegador comparte origen y no hay barrera de seguridad del servidor ni sincronización. **Paridad segura no comprobada.** |
| Pagos | Cuotas, períodos, comprobantes, aprobaciones, revocación, informes, cuenta de destino | No adaptado; no copiar destinos municipales ni procesar cobros reales. **Ausente.** |
| Exportaciones y complementos | CSV, XLSX, informes de asistencia, programación y pagos, perfiles de jugador/doble rol | CSV deportivo, XLSX de resumen de jugadores y nuevo informe XLSX parcial de asistencia; faltan planillas de programación/pagos e informes completos y perfil propio del jugador. **Paridad no comprobada.** |

**Paridad completa: 0/10 bloques históricos.** Este porcentaje mide bloques completos con persistencia, permisos e interfaz verificados, no el número de operaciones recuperadas. **Aceptación de demostración: 8/20 (40 %)** según la matriz original, sin redefinir filas.

## Evidencia y límites de C18

- Pruebas comerciales locales: **45/45**. Incluyen archivo XLSX real con estados, tildes y metadatos del club sin nombres ajenos ni referencia municipal; el exportador original conserva su valor por defecto. Un caso nuevo verifica denegación de controles al profesor sin permisos y concesión solo por categoría/acción. Pruebas puras de escenarios históricos FMV: **4/4**. Compilación comercial y general: correctas. Smoke HTTP repetido: sirve HTML y JS con URL del Supabase comercial y sin dominio municipal en el bundle de entrada; no ejecuta sesión Auth.
- La compilación local comercial usó URL comercial y una clave publicable **ficticia de compilación**, nunca una credencial real ni un entorno para usuarios. La Preview usa las dos variables publicables configuradas para el proyecto comercial; sus valores no se documentan.
- La prueba de navegador C17 [45231370703](https://github.com/Mariano-Solis/asistencia-voley/actions/runs/45231370703) pasó alta, edición, filtro y descarga CSV con respuestas de Supabase **simuladas**. El recorrido C18 amplía la descarga XLSX; debe verificarse por separado en CI antes de anotarlo como aprobado. El intento local de `npm run test:pilot:browser` **falló antes de abrir la página**: falta `/usr/lib/chromium/chromium` en el ejecutor. No se registra como prueba de interfaz aprobada.
- En `savptjiwzaypisayulwp`, consulta de solo lectura: 12 tablas públicas con RLS; `pilot-branding` y `pilot-player-photos` privados, 2 MB, políticas autenticadas de acceso y ningún objeto. Migración 016 aplicada: 2 jornadas y 2 marcas conservadas, copias privadas internas, RPC ejecutable solo por autenticados. **No se ejecutó ninguna solicitud cruzada con dos JWT reales** en C18.
- No se practicó ingreso repetido con contraseña, no se enviaron correos, no se crearon cuentas, no se alteraron registros de Club Ficticio B, no se activó Juan Pablo y no se probó un Motorola físicamente durante C18.

## Preview y acceso

La [Preview técnica C18 final](https://voley-comercial-junin-piloto-1kahwqmzx-miga-mia.vercel.app/) está READY, despliegue `dpl_CTPEzCfgjLevwuWfrAexWMAGeruU`, código `fb5a414`. La [Preview C18 anterior](https://voley-comercial-junin-piloto-e5kj4xe5z-miga-mia.vercel.app/) (`dpl_4NVMZR76xTKtZjNFDdpSWZ7YihZV`) y la [Preview C17](https://voley-comercial-junin-piloto-urf9duq2r-miga-mia.vercel.app/) (`dpl_B7hyg8yGZFC7Xe1Hpaz6zn6hpaa6`) permanecen READY como puntos de retorno. Vercel conserva SSO habilitado para todos los despliegues; solo figuran `VITE_PILOT_SUPABASE_URL` y `VITE_PILOT_SUPABASE_ANON_KEY` como variables Preview. El acceso exige una cuenta permitida en Vercel y luego una cuenta Supabase comercial con membresía y licencia vigente; son controles distintos. Estos enlaces son para **evaluación técnica controlada**, no para entrega equivalente al comprador.

## Riesgos y recuperación

1. Dos JWT de administradores de instituciones diferentes no disponibles simultáneamente para el ensayo. Ejecutar `scripts/pilot-jwt-isolation.mjs` o el panel `?qa=1` con sus sesiones legítimas, verificar GET/POST/PATCH/DELETE, Storage y limpieza de registros ficticios. No sustituirlas con `service_role` ni claims SQL simulados. El profesor requiere un tercer JWT propio.
2. La interfaz avanzada y C15 permanecen sin banderas en Vercel. La migración 016 conserva copias **internas** en `pilot_backups`; estas no sustituyen un respaldo externo. No revertir ni borrar registros reales por automatismo. Antes de cambiar banderas, comprobar autorización y comportamiento con Auth real.
3. Falta migrar competencia, estadísticas, planificación, pagos e informes con almacenamiento y permisos por institución. No apuntar un módulo comercial al cliente `src/supabase.js`, endpoints privados de San Martín o rutas municipales de Storage.
4. Ante un fallo de Preview, volver a la C17 READY indicada arriba; conservar la protección de Vercel. Ante un fallo de base, inspeccionar primero 016 y las copias privadas sin alterar filas actuales, y preparar una reversión revisada, transaccional y específica del proyecto comercial.

## Comunicación para el comprador

«Estamos adaptando la plataforma que conocieron a una instalación exclusiva para Junín, con datos y permisos separados. La versión de prueba disponible aún no reproduce todas las funciones de la demostración original. Por eso no la presentaremos como equivalente ni habilitaremos cuentas definitivas hasta terminar la adaptación y las verificaciones de seguridad. Podemos mostrar el avance como piloto acotado, indicando exactamente sus límites, si desean evaluarlo con ese alcance».

No comprometer una nueva fecha de paridad sin completar módulos y pruebas.
