-- Permite al Super Admin gestionar comprobantes de pago de cualquier jugador/a.
-- Los jugadores conservan sus políticas propias; esta política sólo amplía al rol super_admin.

drop policy if exists "super admins manage payment receipts" on storage.objects;

create policy "super admins manage payment receipts"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'payment-receipts'
  and (select public.is_super_admin())
)
with check (
  bucket_id = 'payment-receipts'
  and (select public.is_super_admin())
);
