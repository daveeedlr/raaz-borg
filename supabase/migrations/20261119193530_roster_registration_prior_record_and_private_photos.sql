-- Applied to Supabase iltuwbawjiwvuqqrkyiz on 2026-11-19.
-- RA'AZ BORG: a roster registration is a one-time intake, not a job application.
-- Previous records are athlete-reported and never alter the verified fighter_fights table.
alter table rb_intake.profiles
  add column prior_competed integer,
  add column prior_won integer,
  add column prior_lost integer,
  add column prior_drawn integer,
  add column avatar_path text,
  add constraint rb_roster_prior_record_consistent check (
    (prior_competed is null and prior_won is null and prior_lost is null and prior_drawn is null)
    or (prior_competed between 0 and 5000 and
        prior_won between 0 and 5000 and prior_lost between 0 and 5000 and prior_drawn between 0 and 5000 and
        prior_won + prior_lost + prior_drawn <= prior_competed)
  ),
  add constraint rb_roster_avatar_path_format check (
    avatar_path is null or
    (length(avatar_path) <= 180 and
     avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$')
  );

alter table public.fighter_registrations
  add column prior_competed integer,
  add column prior_won integer,
  add column prior_lost integer,
  add column prior_drawn integer,
  add constraint rb_legacy_roster_prior_consistent check (
    (prior_competed is null and prior_won is null and prior_lost is null and prior_drawn is null)
    or (prior_competed between 0 and 5000 and
        prior_won between 0 and 5000 and prior_lost between 0 and 5000 and prior_drawn between 0 and 5000 and
        prior_won + prior_lost + prior_drawn <= prior_competed)
  );

-- Private, account-scoped photos: no public bucket access or unverified roster publication.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('roster-avatars','roster-avatars',false,2097152,
       array['image/jpeg','image/png','image/webp']::text[])
on conflict(id) do nothing;

create policy "Roster athletes can upload own private photo"
on storage.objects for insert to authenticated
with check (
  bucket_id='roster-avatars' and
  (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "Roster athletes can read own private photo"
on storage.objects for select to authenticated
using (
  bucket_id='roster-avatars' and
  (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "Roster athletes can delete own private photo"
on storage.objects for delete to authenticated
using (
  bucket_id='roster-avatars' and
  (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Reject incomplete, inflated, or inconsistent self-reported records.
create function rb_intake.rb_validate_prior_record(p_prior jsonb)
returns jsonb language plpgsql immutable set search_path='' as $func$
declare
  k text; v jsonb := '{}'::jsonb; num integer;
begin
  if p_prior is null or p_prior='null'::jsonb then return null; end if;
  if jsonb_typeof(p_prior)<>'object' then
    raise exception 'Prior record must be an object' using errcode='22023';
  end if;
  for k in select unnest(array['competed','won','lost','drawn']) loop
    if coalesce(p_prior->>k,'') !~ '^[0-9]{1,4}$' then
      raise exception 'All four prior-record totals must be whole nonnegative numbers' using errcode='22023';
    end if;
    num := (p_prior->>k)::integer;
    if num>5000 then raise exception 'Prior record limit exceeded' using errcode='22023'; end if;
    v:=v||jsonb_build_object(k,num);
  end loop;
  if (v->>'won')::int+(v->>'lost')::int+(v->>'drawn')::int>(v->>'competed')::int then
    raise exception 'Outcomes cannot exceed total fights competed' using errcode='22023';
  end if;
  return v;
end;
$func$;
revoke all on function rb_intake.rb_validate_prior_record(jsonb) from public,anon,authenticated,service_role;

-- A concurrent double click or a returning athlete cannot create another roster entry.
create function rb_intake.rb_register_roster(
  p_request_id uuid,p_alias text,p_city text,p_belt text,p_interest text,
  p_contact_consent boolean,p_academy text default null,p_discipline text default null,
  p_footage_url text default null,p_profile jsonb default '{}'::jsonb,p_prior jsonb default null
) returns uuid language plpgsql security definer set search_path='' as $func$
declare v_owner uuid:=auth.uid();v_existing uuid;v_receipt uuid;v_prior jsonb;
begin
  if v_owner is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text,0));
  select a.id into v_existing from rb_intake.applications a
    where a.athlete_id=v_owner order by a.submitted_at,a.id limit 1;
  if v_existing is not null then return v_existing; end if;
  v_prior := rb_intake.rb_validate_prior_record(p_prior);
  v_receipt := rb_intake.rb_submit_application_v2(p_request_id,p_alias,p_city,p_belt,p_interest,
    p_contact_consent,p_academy,p_discipline,p_footage_url,p_profile);
  update rb_intake.profiles p set
    prior_competed=(v_prior->>'competed')::int,
    prior_won=(v_prior->>'won')::int,
    prior_lost=(v_prior->>'lost')::int,
    prior_drawn=(v_prior->>'drawn')::int
  where p.athlete_id=v_owner;
  update rb_intake.applications a set profile_snapshot =
    coalesce(a.profile_snapshot,'{}'::jsonb) || jsonb_build_object('prior_record',v_prior)
    where a.id=v_receipt and a.athlete_id=v_owner;
  return v_receipt;
end;
$func$;

create function public.rb_register_roster(
  p_request_id uuid,p_alias text,p_city text,p_belt text,p_interest text,
  p_contact_consent boolean,p_academy text default null,p_discipline text default null,
  p_footage_url text default null,p_profile jsonb default '{}'::jsonb,p_prior jsonb default null
) returns uuid language sql security invoker set search_path='' as $func$
  select rb_intake.rb_register_roster(p_request_id,p_alias,p_city,p_belt,p_interest,
    p_contact_consent,p_academy,p_discipline,p_footage_url,p_profile,p_prior);
$func$;

-- Existing registered athletes may optionally fill or correct their prior record.
create function rb_intake.rb_update_roster_prior(p_prior jsonb)
returns jsonb language plpgsql security definer set search_path='' as $func$
declare v_owner uuid:=auth.uid();v_prior jsonb;
begin
  if v_owner is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not exists(select 1 from rb_intake.applications a where a.athlete_id=v_owner) then
    raise exception 'Roster registration required' using errcode='42501';
  end if;
  v_prior := rb_intake.rb_validate_prior_record(p_prior);
  update rb_intake.profiles p set
    prior_competed=(v_prior->>'competed')::int,
    prior_won=(v_prior->>'won')::int,
    prior_lost=(v_prior->>'lost')::int,
    prior_drawn=(v_prior->>'drawn')::int,
    updated_at=now()
    where p.athlete_id=v_owner;
  return v_prior;
end;
$func$;
create function public.rb_update_roster_prior(p_prior jsonb)
returns jsonb language sql security invoker set search_path='' as $func$
  select rb_intake.rb_update_roster_prior(p_prior);
$func$;

-- Validate storage ownership on the server before recording a private photo path.
create function rb_intake.rb_set_roster_avatar(p_path text)
returns text language plpgsql security definer set search_path='' as $func$
declare v_owner uuid:=auth.uid();
begin
  if v_owner is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not exists(select 1 from rb_intake.applications a where a.athlete_id=v_owner) then
    raise exception 'Roster registration required' using errcode='42501';
  end if;
  if p_path is not null and
    (length(p_path)>180 or
     p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' or
     split_part(p_path,'/',1)<>v_owner::text or
     not exists (select 1 from storage.objects o where o.bucket_id='roster-avatars'
                 and o.name=p_path and o.owner_id=v_owner::text)) then
    raise exception 'Private avatar does not belong to authenticated athlete'
      using errcode='42501';
  end if;
  update rb_intake.profiles p set avatar_path=p_path,updated_at=now()
    where p.athlete_id=v_owner;
  return p_path;
end;
$func$;
create function public.rb_set_roster_avatar(p_path text)
returns text language sql security invoker set search_path='' as $func$
  select rb_intake.rb_set_roster_avatar(p_path);
$func$;

CREATE OR REPLACE FUNCTION rb_intake.sync_fighter_profile(p_athlete_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.fighter_registrations (
    user_id,email,email_verified,realm,first_name,last_name,nickname,
    date_of_birth,age,weight,weight_unit,height,height_unit,
    gym_name,belt_rank,belt_stripes,country,state_province,city,username,
    registration_status,created_at,prior_competed,prior_won,prior_lost,prior_drawn,avatar_path
  )
  select
    p.athlete_id,u.email,u.email_confirmed_at is not null,b.realm,
    p.first_name,p.last_name,p.alias,
    p.date_of_birth,
    case when p.date_of_birth is not null then
      date_part('year',pg_catalog.age(current_date,p.date_of_birth))::int
    else null end,
    p.weight,p.weight_unit,p.height,p.height_unit,
    p.academy,p.belt,p.belt_stripes,p.country,p.state_province,p.city,p.username,
    case when exists (select 1 from rb_intake.applications a where a.athlete_id=p.athlete_id)
      then 'application_submitted' else 'profile_incomplete' end,
    coalesce(u.created_at, pg_catalog.now()),
    p.prior_competed,p.prior_won,p.prior_lost,p.prior_drawn,p.avatar_path
  from rb_intake.profiles p
  join auth.users u on u.id=p.athlete_id
  left join rb_intake.belts b on b.code=p.belt
  where p.athlete_id=p_athlete_id
  on conflict (user_id) do update
    set email=excluded.email, email_verified=excluded.email_verified,
        realm=excluded.realm, first_name=excluded.first_name, last_name=excluded.last_name,
        nickname=excluded.nickname, date_of_birth=excluded.date_of_birth, age=excluded.age,
        weight=excluded.weight, weight_unit=excluded.weight_unit,
        height=excluded.height, height_unit=excluded.height_unit,
        gym_name=excluded.gym_name, belt_rank=excluded.belt_rank,
        belt_stripes=excluded.belt_stripes, country=excluded.country,
        state_province=excluded.state_province, city=excluded.city,
        username=excluded.username, registration_status=excluded.registration_status,
        prior_competed=excluded.prior_competed, prior_won=excluded.prior_won,
        prior_lost=excluded.prior_lost,prior_drawn=excluded.prior_drawn,
        avatar_path=excluded.avatar_path;
end;
$function$
;
CREATE OR REPLACE FUNCTION rb_intake.rb_my_fighter_portal()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_owner uuid := auth.uid();
  v_result jsonb;
begin
  if v_owner is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select jsonb_build_object(
    'email',u.email,
    'username',coalesce(nullif(p.username,''),nullif(p.alias,''),split_part(u.email,'@',1)),
    'name',coalesce(nullif(p.alias,''),nullif(concat_ws(' ',p.first_name,p.last_name),''),split_part(u.email,'@',1)),
    'realm',b.realm,
    'belt',p.belt,
    'gym',p.academy,
    'country',p.country,
    'weight',p.weight,
    'weight_unit',p.weight_unit,
    'first_name',p.first_name,
    'last_name',p.last_name,
    'alias',p.alias,
    'date_of_birth',p.date_of_birth,
    'city',p.city,
    'state_province',p.state_province,
    'discipline',p.discipline,
    'height',p.height,
    'height_unit',p.height_unit,
    'belt_stripes',p.belt_stripes,
    'avatar_path',p.avatar_path,
    'prior_record',case when p.prior_competed is null then null else
      jsonb_build_object('competed',p.prior_competed,'won',p.prior_won,
                         'lost',p.prior_lost,'drawn',p.prior_drawn) end,
    'application', (
      select jsonb_build_object(
        'id',a.id,'status',a.status,'interest',a.interest,
        'belt',a.belt,'realm',a.suggested_realm,'submitted_at',a.submitted_at
      )
      from rb_intake.applications a
      where a.athlete_id = v_owner
      order by a.submitted_at desc,a.id desc limit 1
    ),
    'messages',coalesce((
      select jsonb_agg(jsonb_build_object('kind',n.kind,'created_at',n.created_at) order by n.created_at desc)
      from rb_intake.athlete_notifications n
      where n.athlete_id=v_owner and n.kind='welcome'
    ),'[]'::jsonb),
    'stats',(
      select jsonb_build_object(
        'wins',count(*) filter (where f.result='win'),
        'losses',count(*) filter (where f.result='loss'),
        'draws',count(*) filter (where f.result='draw'),
        'total',count(*)
      )
      from public.fighter_fights f where f.fighter_id=v_owner
    ),
    'recent_fights',coalesce((
      select jsonb_agg(jsonb_build_object(
        'opponent',r.opponent,'result',r.result,
        'method',r.method,'date',r.fight_date
      ) order by r.fight_date desc,r.created_at desc)
      from (
        select f.opponent,f.result,f.method,f.fight_date,f.created_at
        from public.fighter_fights f where f.fighter_id=v_owner
        order by f.fight_date desc,f.created_at desc limit 8
      ) r
    ),'[]'::jsonb)
  ) into v_result
  from auth.users u
  left join rb_intake.profiles p on p.athlete_id=u.id
  left join rb_intake.belts b on b.code=p.belt
  where u.id=v_owner and u.email_confirmed_at is not null;
  return v_result;
end;
$function$
;
revoke all on function
  rb_intake.rb_register_roster(uuid,text,text,text,text,boolean,text,text,text,jsonb,jsonb),
  public.rb_register_roster(uuid,text,text,text,text,boolean,text,text,text,jsonb,jsonb),
  rb_intake.rb_update_roster_prior(jsonb),public.rb_update_roster_prior(jsonb),
  rb_intake.rb_set_roster_avatar(text),public.rb_set_roster_avatar(text)
  from public,anon,authenticated,service_role;
grant execute on function
  rb_intake.rb_register_roster(uuid,text,text,text,text,boolean,text,text,text,jsonb,jsonb),
  public.rb_register_roster(uuid,text,text,text,text,boolean,text,text,text,jsonb,jsonb),
  rb_intake.rb_update_roster_prior(jsonb),public.rb_update_roster_prior(jsonb),
  rb_intake.rb_set_roster_avatar(text),public.rb_set_roster_avatar(text)
  to authenticated;
notify pgrst,'reload schema';
