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

## Bloqueantes técnicos detectados
- El super_admin actual es global en funciones inspeccionadas; no habilitar multicliente con esa autorización.
- No se verificó aún el esquema vivo ni todos los permisos/RLS.
- No se verificaron build, pruebas automatizadas ni despliegue del piloto.
- Administrador designado por el propietario: Juan Pablo Solis (Junín Vóley JNN). Falta su correo de acceso y confirmar autorización de activación y datos institucionales.

## Criterio de ejecución
Implementar por dependencias, no fusionar con main ni desplegar producción sin autorización y pruebas. Cada cierre requiere evidencia, resultado reproducible y rollback.
