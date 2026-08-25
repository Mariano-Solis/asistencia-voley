# Asistencia Voley

Aplicación independiente para tomar asistencia de jugadoras.

## Arranque rápido

1. Crear un proyecto en Supabase.
2. Ejecutar el archivo `supabase/schema.sql` en el SQL Editor.
3. Crear un archivo `.env` copiando `.env.example` y completar:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Instalar dependencias:
   `npm install`
5. Ejecutar:
   `npm run dev`

## Primer administrador

1. Registrate desde la pantalla inicial.
2. En Supabase, abrí `Table Editor > profiles`.
3. Cambiá tu campo `role` de `player` a `admin`.
4. Cerrá sesión y volvé a ingresar.

Después podrás agregar jugadoras desde la aplicación.
