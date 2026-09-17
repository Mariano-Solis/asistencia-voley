-- If a player accidentally repeats the complete surname inside the first-name field,
-- remove that duplicated surname from first_name. The surname field remains authoritative.
-- Example: first_name='Guadalupe Arrojo', last_name='Arrojo' -> 'Guadalupe'.
-- Compound surnames are removed only when the complete compound surname is repeated.

create or replace function public.remove_duplicate_surname_from_first_name(p_first_name text, p_last_name text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  first_clean text;
  last_clean text;
  first_words text[];
  last_words text[];
  result_words text[] := array[]::text[];
  i integer := 1;
  first_count integer;
  last_count integer;
  candidate text;
  result_text text;
begin
  first_clean := public.normalize_person_name(p_first_name);
  last_clean := public.normalize_person_name(p_last_name);

  if first_clean is null or last_clean is null then
    return first_clean;
  end if;

  first_words := regexp_split_to_array(first_clean, '\s+');
  last_words := regexp_split_to_array(last_clean, '\s+');
  first_count := coalesce(array_length(first_words, 1), 0);
  last_count := coalesce(array_length(last_words, 1), 0);

  while i <= first_count loop
    if last_count > 0 and i + last_count - 1 <= first_count then
      candidate := array_to_string(first_words[i:i + last_count - 1], ' ');
      if lower(candidate) = lower(last_clean) then
        i := i + last_count;
        continue;
      end if;
    end if;

    result_words := array_append(result_words, first_words[i]);
    i := i + 1;
  end loop;

  result_text := nullif(btrim(array_to_string(result_words, ' ')), '');
  -- Never erase the complete first-name field if both fields were identical.
  return coalesce(result_text, first_clean);
end;
$function$;

create or replace function public.normalize_player_name_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.last_name is not null then
    new.last_name := upper(regexp_replace(btrim(new.last_name), '\s+', ' ', 'g'));
  end if;

  if new.first_name is not null then
    new.first_name := public.remove_duplicate_surname_from_first_name(new.first_name, new.last_name);
  end if;

  if new.first_name is not null and new.last_name is not null then
    new.full_name := new.last_name || ' ' || new.first_name;
  elsif new.full_name is not null then
    new.full_name := regexp_replace(btrim(new.full_name), '\s+', ' ', 'g');
  end if;

  return new;
end;
$function$;

-- Re-run normalization through the existing trigger so current duplicates are repaired
-- and player profile display names remain synchronized by the existing after-trigger.
update public.players
set first_name = first_name,
    last_name = last_name,
    full_name = full_name;
