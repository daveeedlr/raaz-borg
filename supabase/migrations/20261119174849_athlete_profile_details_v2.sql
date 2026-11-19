-- Reconstructed from deployed migration 20261119174849 athlete_profile_details_v2.
-- Adds typed athlete details, snapshots and restricted v2 RPCs; preserves legacy tables.
alter table rb_intake.profiles
  add column first_name text,
  add column last_name text,
  add column date_of_birth date,
  add column weight numeric,
  add column weight_unit text,
  add column height numeric,
  add column height_unit text,
  add column belt_stripes integer,
  add column country text,
  add column state_province text,
  add column username text;
alter table rb_intake.profiles
  add constraint rb_profile_names check ((first_name is null or length(first_name) between 1 and 80) and (last_name is null or length(last_name) between 1 and 80)),
  add constraint rb_profile_birth check (date_of_birth is null or date_of_birth between date '1900-01-01' and current_date),
  add constraint rb_profile_weight check ((weight is null and weight_unit is null) or (weight > 0 and weight < 1500 and weight_unit in ('kg','lb'))),
  add constraint rb_profile_height check ((height is null and height_unit is null) or (height > 0 and height < 350 and height_unit in ('cm','in'))),
  add constraint rb_profile_stripes check (belt_stripes is null or belt_stripes between 0 and 4),
  add constraint rb_profile_location check ((country is null or length(country) between 1 and 80) and (state_province is null or length(state_province) between 1 and 80)),
  add constraint rb_profile_username check (username is null or username ~ '^[A-Za-z0-9_.-]{3,40}$');
alter table rb_intake.applications add column profile_snapshot jsonb;

CREATE OR REPLACE FUNCTION rb_intake.rb_submit_application_v2(p_request_id uuid, p_alias text, p_city text, p_belt text, p_interest text, p_contact_consent boolean, p_academy text DEFAULT NULL::text, p_discipline text DEFAULT NULL::text, p_footage_url text DEFAULT NULL::text, p_profile jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_receipt uuid;
  v_prior jsonb;
  v_snapshot jsonb;
  v_first text;
  v_last text;
  v_country text;
  v_region text;
  v_username text;
  v_birth date;
  v_weight numeric;
  v_weight_unit text;
  v_height numeric;
  v_height_unit text;
  v_stripes integer;
begin
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Athlete profile must be an object' using errcode='22023';
  end if;
  v_first := nullif(btrim(p_profile->>'first_name'), '');
  v_last := nullif(btrim(p_profile->>'last_name'), '');
  v_country := nullif(btrim(p_profile->>'country'), '');
  v_region := nullif(btrim(p_profile->>'state_province'), '');
  v_username := nullif(btrim(p_profile->>'username'), '');
  v_birth := nullif(p_profile->>'date_of_birth', '')::date;
  v_weight := nullif(p_profile->>'weight', '')::numeric;
  v_weight_unit := nullif(btrim(p_profile->>'weight_unit'), '');
  v_height := nullif(p_profile->>'height', '')::numeric;
  v_height_unit := nullif(btrim(p_profile->>'height_unit'), '');
  v_stripes := nullif(p_profile->>'belt_stripes', '')::integer;

  if v_first is null or v_last is null or v_country is null or
     length(v_first) > 80 or length(v_last) > 80 or
     length(v_country) > 80 or length(v_region) > 80 or
     (v_username is not null and v_username !~ '^[A-Za-z0-9_.-]{3,40}$') then
    raise exception 'Name, country or username is invalid' using errcode='22023';
  end if;
  if v_birth is not null and (v_birth < date '1900-01-01' or v_birth > current_date) then
    raise exception 'Birth date is invalid' using errcode='22023';
  end if;
  if (v_weight is null) <> (v_weight_unit is null) or
     (v_weight is not null and (v_weight <= 0 or v_weight >= 1500 or v_weight_unit not in ('kg','lb'))) or
     (v_height is null) <> (v_height_unit is null) or
     (v_height is not null and (v_height <= 0 or v_height >= 350 or v_height_unit not in ('cm','in'))) or
     (v_stripes is not null and (v_stripes < 0 or v_stripes > 4)) then
    raise exception 'Invalid physical measurements or belt stripes' using errcode='22023';
  end if;
  v_snapshot := jsonb_build_object(
    'first_name', v_first, 'last_name', v_last, 'country', v_country,
    'state_province', v_region, 'username', v_username,
    'date_of_birth', v_birth, 'weight', v_weight, 'weight_unit', v_weight_unit,
    'height', v_height, 'height_unit', v_height_unit, 'belt_stripes', v_stripes
  );

  -- Existing RPC handles verified identity, consent, belt mapping, locking and retry idempotency.
  v_receipt := rb_intake.rb_submit_application(
    p_request_id, p_alias, p_city, p_belt, p_interest,
    p_contact_consent, p_academy, p_discipline, p_footage_url
  );
  select a.profile_snapshot into v_prior
    from rb_intake.applications a where a.id = v_receipt for update;
  if v_prior is not null and v_prior <> v_snapshot then
    raise exception 'Request ID already belongs to a different athlete profile'
      using errcode='23505';
  end if;

  update rb_intake.profiles p
     set first_name=v_first, last_name=v_last, date_of_birth=v_birth,
         weight=v_weight, weight_unit=v_weight_unit,
         height=v_height, height_unit=v_height_unit,
         belt_stripes=v_stripes, country=v_country,
         state_province=v_region, username=v_username
   where p.athlete_id = auth.uid();
  update rb_intake.applications a
     set profile_snapshot = v_snapshot
   where a.id = v_receipt and a.profile_snapshot is null;
  return v_receipt;
end;
$function$
;

CREATE OR REPLACE FUNCTION rb_intake.rb_my_profile_v2()
 RETURNS TABLE(alias text, city text, academy text, discipline text, belt text, first_name text, last_name text, date_of_birth date, weight numeric, weight_unit text, height numeric, height_unit text, belt_stripes integer, country text, state_province text, username text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.alias, p.city, p.academy, p.discipline, p.belt,
         p.first_name, p.last_name, p.date_of_birth, p.weight, p.weight_unit,
         p.height, p.height_unit, p.belt_stripes, p.country, p.state_province, p.username
  from rb_intake.profiles p where p.athlete_id = (select auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION rb_intake.rb_review_queue_v2()
 RETURNS TABLE(id uuid, submitted_at timestamp with time zone, status text, interest text, belt text, suggested_realm text, alias text, contact_email text, city text, academy text, discipline text, footage_url text, profile_snapshot jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select q.id, q.submitted_at, q.status, q.interest, q.belt, q.suggested_realm,
         q.alias, q.contact_email, q.city, q.academy, q.discipline, q.footage_url,
         a.profile_snapshot
  from rb_intake.rb_review_queue() q
  join rb_intake.applications a on a.id = q.id
  order by q.submitted_at, q.id;
$function$
;

CREATE OR REPLACE FUNCTION public.rb_submit_application_v2(p_request_id uuid, p_alias text, p_city text, p_belt text, p_interest text, p_contact_consent boolean, p_academy text DEFAULT NULL::text, p_discipline text DEFAULT NULL::text, p_footage_url text DEFAULT NULL::text, p_profile jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select rb_intake.rb_submit_application_v2(
    p_request_id, p_alias, p_city, p_belt, p_interest, p_contact_consent,
    p_academy, p_discipline, p_footage_url, p_profile
  );
$function$
;

CREATE OR REPLACE FUNCTION public.rb_my_profile_v2()
 RETURNS TABLE(alias text, city text, academy text, discipline text, belt text, first_name text, last_name text, date_of_birth date, weight numeric, weight_unit text, height numeric, height_unit text, belt_stripes integer, country text, state_province text, username text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from rb_intake.rb_my_profile_v2();
$function$
;

CREATE OR REPLACE FUNCTION public.rb_review_queue_v2()
 RETURNS TABLE(id uuid, submitted_at timestamp with time zone, status text, interest text, belt text, suggested_realm text, alias text, contact_email text, city text, academy text, discipline text, footage_url text, profile_snapshot jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from rb_intake.rb_review_queue_v2();
$function$
;

revoke all on function
  rb_intake.rb_submit_application_v2(uuid,text,text,text,text,boolean,text,text,text,jsonb),
  public.rb_submit_application_v2(uuid,text,text,text,text,boolean,text,text,text,jsonb),
  rb_intake.rb_my_profile_v2(), public.rb_my_profile_v2(),
  rb_intake.rb_review_queue_v2(), public.rb_review_queue_v2()
from public, anon, authenticated, service_role;
grant execute on function
  rb_intake.rb_submit_application_v2(uuid,text,text,text,text,boolean,text,text,text,jsonb),
  public.rb_submit_application_v2(uuid,text,text,text,text,boolean,text,text,text,jsonb),
  rb_intake.rb_my_profile_v2(), public.rb_my_profile_v2(),
  rb_intake.rb_review_queue_v2(), public.rb_review_queue_v2()
to authenticated;
notify pgrst,'reload schema';
