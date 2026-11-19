-- Deployed to Supabase project iltuwbawjiwvuqqrkyiz.

-- Persist the language each athlete selected. The first preference is saved at signup
-- (using non-sensitive user_metadata), then updated through authenticated RPCs.
-- Existing profiles mirror the language for staff exports.
alter table rb_intake.profiles
  add column preferred_language text not null default 'es'
  constraint rb_athlete_profile_language_check check (preferred_language in ('es','en'));

create table rb_intake.athlete_language_preferences (
  athlete_id uuid primary key references auth.users(id) on delete cascade,
  preferred_language text not null default 'es'
    check(preferred_language in ('es','en')),
  updated_at timestamptz not null default now()
);
alter table rb_intake.athlete_language_preferences enable row level security;
revoke all on table rb_intake.athlete_language_preferences from PUBLIC,anon,authenticated;

create function rb_intake.rb_initialize_language()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_choice text;
begin
  v_choice := new.raw_user_meta_data->>'preferred_language';
  if v_choice not in ('es','en') or v_choice is null then v_choice:='es'; end if;
  insert into rb_intake.athlete_language_preferences(athlete_id,preferred_language)
    values(new.id,v_choice) on conflict(athlete_id) do nothing;
  return new;
end;
$fn$;
revoke all on function rb_intake.rb_initialize_language() from PUBLIC,anon,authenticated;
create trigger rb_language_on_signup after insert on auth.users
  for each row execute function rb_intake.rb_initialize_language();

insert into rb_intake.athlete_language_preferences(athlete_id,preferred_language)
select u.id,
  case when u.raw_user_meta_data->>'preferred_language' in ('es','en')
    then u.raw_user_meta_data->>'preferred_language' else 'es' end
from auth.users u
on conflict(athlete_id) do nothing;

-- Existing athletes receive the preference recorded on their Auth account if present.
update rb_intake.profiles p set preferred_language=l.preferred_language
from rb_intake.athlete_language_preferences l where l.athlete_id=p.athlete_id
  and p.preferred_language is distinct from l.preferred_language;

create function rb_intake.rb_set_language(p_language text)
returns text language plpgsql security definer set search_path='' as $fn$
declare v_owner uuid:=auth.uid();
begin
  if v_owner is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_language is null or p_language not in ('es','en') then
    raise exception 'Language must be es or en' using errcode='22023';
  end if;
  insert into rb_intake.athlete_language_preferences(athlete_id,preferred_language,updated_at)
    values(v_owner,p_language,now())
    on conflict(athlete_id) do update
      set preferred_language=excluded.preferred_language,
          updated_at=now();
  update rb_intake.profiles p set preferred_language=p_language,
    updated_at=now()
    where p.athlete_id=v_owner and p.preferred_language is distinct from p_language;
  return p_language;
end;
$fn$;
create function public.rb_set_language(p_language text)
returns text language sql security invoker set search_path='' as $fn$
  select rb_intake.rb_set_language(p_language);
$fn$;

create function rb_intake.rb_my_language()
returns text language plpgsql stable security definer set search_path='' as $fn$
declare v_owner uuid:=auth.uid();v_language text;
begin
  if v_owner is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select coalesce(
    (select l.preferred_language from rb_intake.athlete_language_preferences l where l.athlete_id=v_owner),
    (select p.preferred_language from rb_intake.profiles p where p.athlete_id=v_owner),
    'es') into v_language;
  return v_language;
end;
$fn$;
create function public.rb_my_language()
returns text language sql stable security invoker set search_path='' as $fn$
  select rb_intake.rb_my_language();
$fn$;

create function rb_intake.rb_apply_profile_language()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
  new.preferred_language:=coalesce(
    (select l.preferred_language from rb_intake.athlete_language_preferences l
      where l.athlete_id=new.athlete_id),'es');
  return new;
end;
$fn$;
revoke all on function rb_intake.rb_apply_profile_language() from PUBLIC,anon,authenticated;
create trigger rb_language_on_profile_insert before insert on rb_intake.profiles
  for each row execute function rb_intake.rb_apply_profile_language();

-- Service roles read language; recipients and identity still come from the server.
create function rb_intake.rb_notification_language(p_athlete_id uuid)
returns text language plpgsql stable security definer set search_path='' as $fn$
declare v_language text;
begin
  if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select coalesce(
    (select l.preferred_language from rb_intake.athlete_language_preferences l
       where l.athlete_id=p_athlete_id),
    (select p.preferred_language from rb_intake.profiles p where p.athlete_id=p_athlete_id),
    'es') into v_language;
  return v_language;
end;
$fn$;
create function public.rb_notification_language(p_athlete_id uuid)
returns text language sql stable security invoker set search_path='' as $fn$
  select rb_intake.rb_notification_language(p_athlete_id);
$fn$;
CREATE OR REPLACE FUNCTION rb_intake.rb_register_roster(p_request_id uuid, p_alias text, p_city text, p_belt text, p_interest text, p_contact_consent boolean, p_academy text DEFAULT NULL::text, p_discipline text DEFAULT NULL::text, p_footage_url text DEFAULT NULL::text, p_profile jsonb DEFAULT '{}'::jsonb, p_prior jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid:=auth.uid();v_existing uuid;v_receipt uuid;v_prior jsonb;
begin
  if v_owner is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text,0));
  select a.id into v_existing from rb_intake.applications a
    where a.athlete_id=v_owner order by a.submitted_at,a.id limit 1;
  if v_existing is not null then return v_existing; end if;
  -- Language chosen on the registration form becomes the account preference.
  if p_profile ? 'preferred_language' then
    perform rb_intake.rb_set_language(p_profile->>'preferred_language');
  end if;
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
$function$;

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
    'preferred_language',coalesce(
      (select lp.preferred_language from rb_intake.athlete_language_preferences lp where lp.athlete_id=v_owner),
      p.preferred_language,'es'),
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
$function$;

CREATE OR REPLACE FUNCTION rb_intake.rb_claim_ack_email(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row record;v_details jsonb;
begin
  perform rb_intake.require_reviewer();
  if p_application_id is null then raise exception 'Registration required' using errcode='22023'; end if;
  with candidate as (
    select k.application_id
    from rb_intake.roster_acknowledgements k
    where k.application_id=p_application_id and k.email_attempts < 3
      and (k.email_state='pending' or
           (k.email_state='processing' and k.claimed_at < now()-interval '10 minutes'))
    for update skip locked
  )
  update rb_intake.roster_acknowledgements k
    set email_state='processing',email_attempts=k.email_attempts+1,claimed_at=now()
    from candidate c where k.application_id=c.application_id
    returning k.application_id into v_row;
  if not found then return null; end if;
  select jsonb_build_object(
    'application_id',a.id,
    'email',u.email,
    'alias',coalesce(nullif(p.alias,''),nullif(concat_ws(' ',p.first_name,p.last_name),''),'atleta'),
    'first_name',p.first_name,
    'realm',a.suggested_realm,
    'belt',a.belt,
    'interest',a.interest,
    'preferred_language',coalesce(
      (select lp.preferred_language from rb_intake.athlete_language_preferences lp where lp.athlete_id=a.athlete_id),
      p.preferred_language,'es')
  ) into v_details
  from rb_intake.applications a
  join auth.users u on u.id=a.athlete_id and u.email_confirmed_at is not null
  left join rb_intake.profiles p on p.athlete_id=a.athlete_id
  where a.id=v_row.application_id and u.email is not null;
  if v_details is null then
    update rb_intake.roster_acknowledgements
      set email_state='failed',last_error='Confirmed email unavailable',claimed_at=null
      where application_id=p_application_id;
    return null;
  end if;
  return v_details;
end;
$function$;

revoke all on function
  rb_intake.rb_set_language(text),public.rb_set_language(text),
  rb_intake.rb_my_language(),public.rb_my_language(),
  rb_intake.rb_notification_language(uuid),public.rb_notification_language(uuid)
from PUBLIC,anon,authenticated,service_role;
grant execute on function
  rb_intake.rb_set_language(text),public.rb_set_language(text),
  rb_intake.rb_my_language(),public.rb_my_language()
to authenticated;
grant execute on function
  rb_intake.rb_notification_language(uuid),public.rb_notification_language(uuid)
to service_role;
notify pgrst,'reload schema';

