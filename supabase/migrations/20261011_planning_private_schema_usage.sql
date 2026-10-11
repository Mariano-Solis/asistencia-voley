-- Permite que las políticas RLS invoquen exclusivamente las funciones privadas ya autorizadas.
grant usage on schema private to authenticated;
revoke usage on schema private from anon;
