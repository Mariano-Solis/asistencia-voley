create or replace function public.handle_player_category()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_auto_category uuid;
  v_target_category uuid;
  v_old_is_b boolean := false;
  v_super boolean := false;
  v_can_move boolean := false;
  v_target_gender text;
  v_category_changed boolean := false;
begin
  if new.birth_date is null or new.sex is null then
    return new;
  end if;

  v_auto_category := public.calculate_player_category_auto(new.birth_date, new.sex);

  begin
    v_super := public.is_super_admin();
  exception when others then
    v_super := false;
  end;

  -- En altas hechas por un Profe/Super Admin, respetar la categoría elegida
  -- siempre que tenga permiso de edición sobre el destino. Las altas de
  -- jugador@s se siguen categorizando automáticamente.
  if tg_op = 'INSERT' then
    if new.category_id is not null
       and (v_super or public.can_edit_category(new.category_id)) then
      select c.gender into v_target_gender
      from public.categories c
      where c.id = new.category_id and c.active = true;

      if v_target_gender is null then
        raise exception 'La categoría seleccionada no existe o está inactiva.';
      end if;
      if lower(v_target_gender) <> lower(new.sex) then
        raise exception 'La categoría seleccionada no corresponde a la rama del jugador.';
      end if;

      new.category_override := (new.category_id is distinct from v_auto_category);
      return new;
    end if;

    new.category_id := v_auto_category;
    new.category_override := false;
    return new;
  end if;

  v_category_changed := new.category_id is distinct from old.category_id;

  -- Si un Profe autorizado o el Super Admin modifica explícitamente la categoría,
  -- esa selección manual tiene prioridad incluso cuando en la misma edición también
  -- se corrige fecha de nacimiento o sexo. Antes, el recálculo etario podía pisarla.
  if v_category_changed then
    v_can_move := v_super or (
      public.can_edit_category(old.category_id)
      and public.can_edit_category(new.category_id)
    );

    if v_can_move then
      select c.gender into v_target_gender
      from public.categories c
      where c.id = new.category_id and c.active = true;

      if v_target_gender is null then
        raise exception 'La categoría seleccionada no existe o está inactiva.';
      end if;
      if lower(v_target_gender) <> lower(new.sex) then
        raise exception 'La categoría seleccionada no corresponde a la rama del jugador.';
      end if;

      new.category_override := (new.category_id is distinct from v_auto_category);
      return new;
    end if;

    -- Un cambio manual no autorizado se descarta. Si también cambió fecha/sexo,
    -- el bloque siguiente recalcula desde la categoría anterior de forma segura.
    new.category_id := old.category_id;
    new.category_override := old.category_override;
  end if;

  -- Si cambia fecha de nacimiento o sexo sin un cambio manual autorizado de
  -- categoría, recalcular la categoría etaria. Cuando el jugador estaba en una
  -- línea B, conservar B si existe la categoría B equivalente.
  if new.birth_date is distinct from old.birth_date
     or new.sex is distinct from old.sex then
    select (c.name ~* '[[:space:]]B$') into v_old_is_b
    from public.categories c where c.id = old.category_id;

    v_target_category := v_auto_category;
    if coalesce(v_old_is_b,false) and v_auto_category is not null then
      select cb.id into v_target_category
      from public.categories ca
      join public.categories cb
        on cb.active = true
       and cb.gender = ca.gender
       and cb.name = ca.name || ' B'
      where ca.id = v_auto_category
      limit 1;
      v_target_category := coalesce(v_target_category, v_auto_category);
    end if;

    new.category_id := v_target_category;
    new.category_override := false;
    return new;
  end if;

  -- Reparación histórica sin categoría.
  if old.category_id is null and new.category_id is not null
     and new.category_id = v_auto_category then
    new.category_override := false;
    return new;
  end if;

  return new;
end;
$function$;

revoke all on function public.handle_player_category() from public, anon, authenticated;
