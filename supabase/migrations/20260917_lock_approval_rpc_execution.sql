-- SECURITY DEFINER functions receive EXECUTE for PUBLIC by default in PostgreSQL.
-- Remove that inherited grant so anonymous clients cannot invoke approval RPCs.
revoke execute on function public.get_registration_requests() from public;
revoke execute on function public.get_registration_requests() from anon;
revoke execute on function public.review_registration(uuid,text,text) from public;
revoke execute on function public.review_registration(uuid,text,text) from anon;

grant execute on function public.get_registration_requests() to authenticated;
grant execute on function public.review_registration(uuid,text,text) to authenticated;
