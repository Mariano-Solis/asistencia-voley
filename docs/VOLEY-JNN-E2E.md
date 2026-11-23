# Ejecución de navegador del piloto JNN

`npm run test:pilot:browser` compila el piloto con una clave publicable **ficticia**, inicia Vite en `127.0.0.1:4176` y simula las respuestas de Supabase dentro de Playwright. Recorre móvil 390×844 y escritorio 1280×800: ingreso simulado, categoría, jugador, filtros, jornada, los tres estados, historial, CSV, recarga y salida. No crea cuentas ni toca el proyecto Supabase. **No acredita Auth real, RLS ni Storage.**

## Entorno reproducible

1. Clonar la rama comercial en un entorno aislado y ejecutar `npm ci`.
2. Instalar Playwright 1.62.1 para la prueba en ese entorno (`npm install --no-save playwright@1.62.1`), luego su Chromium oficial (`npx playwright install chromium`). Estas descargas requieren conexión y espacio local; comprobar antes cualquier cargo de un ejecutor remoto.
3. Ejecutar `npm run test:pilot:browser`. `PILOT_CHROMIUM_PATH` permite elegir un binario instalado y `PILOT_TEST_PORT` otro puerto local libre. La prueba rechaza un puerto ocupado y restaura `dist/index.html` aunque falle.
4. Conservar las líneas `PASS mocked browser journey` de ambas vistas y el código de salida 0. Un resultado sin ambas líneas no es una prueba aprobada. Repetir `npm run test:pilot` y ambas compilaciones después de corregir un fallo.

El entorno de trabajo C11/C12 tiene Chromium instalado, pero no permite iniciar su socket de proceso (`Operation not permitted`); el navegador remoto tampoco puede acceder al servidor local. No se ejecutó el recorrido E2E aquí. Una ejecución manual desde la computadora del propietario es una alternativa sin consumir minutos de GitHub Actions. **No se preparó ni ejecutó un workflow remoto:** no se pudo confirmar la disponibilidad gratuita de minutos y la misión prohíbe gastos. Si se habilita una cuota sin cargo comprobada, usar un workflow solo manual, sin secretos, con tiempo y concurrencia limitados.

## Puerta posterior con servicios reales

El navegador simulado no reemplaza `scripts/pilot-jwt-isolation.mjs`: este exige dos JWT vigentes del **mismo proyecto comercial**, de cuentas Auth distintas con membresías activas en instituciones diferentes. Se pasan solo al entorno privado del proceso junto con la clave publicable; no copiar a consola compartida, GitHub, chat ni capturas. El script crea identificadores ficticios, verifica operaciones propias antes de las ajenas y comprueba limpieza al final. Club Ficticio B aún requiere el código emitido por el propietario y canjeado por su destinatario. No intentar la prueba real antes de completar esa autorización.
