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
