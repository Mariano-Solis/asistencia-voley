# Guía breve de la demostración JNN

Versión de ensayo protegida. Acceso: URL de Preview facilitada por el propietario, autenticación de Vercel para el equipo de prueba y después cuenta propia de la aplicación (Supabase Auth). El comprador final no necesitará una cuenta Vercel cuando se habilite un entorno de entrega, previa revisión de seguridad. No compartir códigos de activación ni contraseñas.

Los enlaces de confirmación, acceso por correo y recuperación del piloto llevan al **alias estable protegido** de la rama comercial. Si comenzaste desde una URL única de Preview, el enlace puede abrir el mismo piloto bajo otra dirección; completá el recorrido allí. La comprobación automatizada de esa redirección usó respuestas simuladas: todavía falta validar un correo real después de este cambio.

## Demostración controlada de 10–15 minutos

Reservá 2 minutos para ingresar y verificar Junín JNN, 3 para crear y editar una categoría y un jugador ficticios, 3 para registrar Presente/Tarde/Ausente, 3 para filtrar Historial y abrir el CSV, y 2 para mostrar Identidad y cerrar sesión. No uses datos reales ni un escudo no autorizado. La Preview requiere primero el acceso del equipo de pruebas por Vercel; el acceso comercial definitivo será independiente de Vercel después de aprobar las pruebas de seguridad.

## Administrador y profesor

El administrador habilita un profesor **después** de que éste cree su cuenta y confirme su correo; lo hace desde Profesores con el correo verificado. Puede suspenderlo o reactivarlo allí. El profesor consulta categorías, jugadores, asistencia, historial e identidad de su institución y puede registrar actividad deportiva. La edición de categorías e identidad y la gestión de otros profesores corresponden al administrador. La asignación limitada a categorías individuales aún no existe: no ofrezcas ese alcance en la demostración. El recorrido de profesor con una cuenta Auth propia sigue sin prueba real; las restricciones del servidor se ensayaron con identidades SQL simuladas.

## Recorrido

1. Abrí la Preview protegida e iniciá sesión en la aplicación con la identidad temporal autorizada. Si cambiaste de navegador, seguí el acceso por correo; no reutilices el enlace anterior.
2. Comprobá que la cabecera muestre Junín Vóley JNN y que el rol sea Administrador. La identidad actual es provisional: todavía no hay un escudo oficial asociado.
3. En **Categorías**, creá una categoría ficticia o editá su nombre. No uses nombres de alumnos o jugadores reales en la demostración.
4. En **Jugadores**, agregá una persona ficticia, buscala, cambiale el nombre y filtrá por categoría. La opción Desactivar conserva el historial.
   Si el jugador ya tiene asistencias, su categoría queda fija para preservar el historial. Podés seguir editando su nombre y estado.
5. En **Asistencia**, elegí categoría y fecha, creá una jornada si hace falta y marcá Presente, Tarde o Ausente.
   Al guardar, la candidata anuncia el nombre y el estado; en Jugadores anuncia cada alta, edición y cambio de actividad. Si no aparece la confirmación, comprobá el aviso antes de repetir la operación.
6. En **Historial**, filtrá por categoría, fecha o jugador. El número del botón Exportar CSV debe coincidir con las asistencias filtradas. Descargá el archivo y comprobá las columnas Fecha, Categoría, Jugador y Estado.
7. En **Identidad**, podés elegir nombre público, colores y subir un escudo autorizado desde el dispositivo. Revisá la vista previa antes de guardar. El escudo queda en almacenamiento privado por institución. No uses el resultado «Junín Municipalidad» de Court Track como escudo de JNN sin confirmar la relación y el permiso de uso.
8. Cerrá sesión desde la cabecera. Al volver, la aplicación debe pedir autenticación y verificar la vigencia institucional.

## Si aparece un problema

- «Acceso institucional no disponible»: pedí al propietario que revise membresía y vigencia de la licencia de ensayo. La licencia temporal vence al terminar el 24/11/2026 en Argentina.
- Error al guardar: no repitas inmediatamente una emisión o canje de código. Actualizá los datos y comunicá el mensaje exacto al responsable.
- «La operación terminó, pero no se pudieron actualizar los datos»: el guardado respondió correctamente y falló la lectura posterior. Tocá **Actualizar** antes de repetir el alta o la edición para evitar duplicados.
- Court Track no disponible: seguí con la configuración manual. No se bloquea el uso deportivo.
- Profesor: el administrador puede habilitar o suspender una cuenta verificada. En esta candidata el profesor autorizado ve las categorías de su institución; la asignación limitada a categorías individuales todavía está en desarrollo y no debe prometerse.
- Un profesor puede consultar la identidad institucional, pero solo un administrador del club puede editarla. La prueba automatizada de ese menú usa respuestas de servidor simuladas; todavía falta el recorrido con una cuenta Auth propia de profesor.
- CSV no descargado: revisá los permisos de descargas del navegador Android y repetí el filtro. Registrá modelo, navegador y fecha; esta comprobación sobre la última candidata aún requiere prueba manual.

## Comprobación breve en Android de la candidata actual

Usá solo nombres ficticios. Anotá el resultado y una captura sin correo ni código visible:

1. Editá una categoría, actualizá la página y comprobá el nombre.
2. Creá o editá un jugador ficticio, buscalo por parte del nombre, filtrá por categoría y probá Desactivar/Reactivar.
3. Filtrá Historial por categoría, fecha y jugador; cotejá el número del botón Exportar con las filas mostradas.
4. Descargá el CSV **nuevo** y abrilo en una planilla: nombres acentuados y Presente/Tarde/Ausente deben aparecer como en pantalla.
5. En Identidad, subí un escudo de ensayo que tengas derecho a usar, recortalo, guardalo y recargá. Verificá después desde otro dispositivo con la misma cuenta. No subas un escudo oficial de JNN sin confirmación.
6. Cerrá sesión, abrí otra vez y verificá que solicite acceso; probá recuperación solo con una cuenta de ensayo controlada.

Una captura de pantalla del resultado y el CSV bastan para revisar los pasos visibles. Los controles de RLS y Storage requieren además las solicitudes directas con dos JWT; no se aprueban por una captura de la interfaz.

## Transición posterior a la cuenta definitiva

Después de aprobar el aislamiento con dos cuentas Auth institucionales reales, el propietario verifica por un canal independiente la identidad y el correo del administrador designado. Esa persona crea su **propia** cuenta y confirma el enlace normal de Supabase Auth. El propietario emite una nueva autorización personal de un solo uso y vigencia controlada; el destinatario la canjea en su sesión. Se comprueba su membresía y acceso. Luego se suspende la membresía temporal y se verifica que ya no puede acceder, sin compartir contraseñas, transferir sesiones ni alterar `auth.users` manualmente. No ejecutar este procedimiento todavía.
# Nota de integridad del historial (candidata C10)

Para retirar un jugador del listado activo, usá **Desactivar** en Jugadores. La asistencia anterior se conserva. La edición de nombre permanece disponible; la categoría de un jugador con asistencia registrada no se puede cambiar porque alteraría el historial. Los profesores no pueden borrar directamente jugadores, jornadas ni marcas mediante la API. Un administrador tampoco puede borrar un jugador o una jornada mientras tenga asistencia registrada. Esta barrera se verificó en PostgreSQL comercial con datos ficticios revertidos; el recorrido del profesor con JWT propio sigue pendiente.
