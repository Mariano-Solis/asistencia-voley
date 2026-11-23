# Alta comercial de una institución futura

Procedimiento de esta candidata; no habilita compradores reales hasta aprobar las pruebas de JWT y Storage entre dos clubes. No requiere crear filas manualmente ni compartir contraseñas.

1. El propietario recupera su acceso legítimo a la cuenta original y verifica que el panel **Propietario de plataforma** aparezca. Un administrador institucional nunca debe ver ese panel ni emitir códigos.
2. En **Agregar institución**, introduce un identificador único y un nombre confirmado por el comprador. El sistema la crea pendiente. Revisa las coincidencias de Court Track si existen, sin asociar automáticamente un escudo dudoso. La carga manual sigue disponible para cualquier país o federación.
3. Define vigencia y activa una licencia de ensayo o comercial según el acuerdo fuera de la aplicación. Comprueba que el panel refleje estado y vencimiento. La suspensión debe cortar el acceso institucional mediante RLS.
4. El administrador designado crea su cuenta **propia** y confirma su correo por Supabase Auth. El propietario comprueba la identidad por un canal independiente, emite un código personal al correo exacto y lo entrega privadamente. El código se muestra una sola vez. El destinatario lo canjea en su sesión; no se transfiere una contraseña ni una cuenta temporal.
5. Verifica nombre y rol en el panel institucional, configura nombre público, escudo autorizado y paleta, y comprueba categoría, jugador, asistencia, historial y CSV. Luego ejecuta la prueba cruzada con otra institución mediante dos JWT reales y Storage; si falla, suspende la habilitación del nuevo comprador y conserva la evidencia.
6. Antes del uso real, confirma recuperación de acceso, soporte y vigencia, y registra el resultado de la matriz de aceptación. El administrador definitivo de JNN sigue sin activar en esta candidata.

Si el propietario no puede entrar o los correos están limitados, no emitir códigos por SQL administrativo como sustituto. Esperar el restablecimiento normal de Auth y retomar el flujo desde su panel. No reutilizar una licencia de ensayo como definitiva.
