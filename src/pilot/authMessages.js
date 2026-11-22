export function authErrorMessage(error) {
  if (error?.code === 'over_email_send_rate_limit' || (error?.status === 429 && /email rate limit/i.test(error?.message || ''))) {
    return 'Supabase limitó temporalmente el envío de correos. Esperá antes de solicitar otro enlace. El ingreso con contraseña se procesa por separado.'
  }
  return error?.message || 'No se pudo completar la operación.'
}
