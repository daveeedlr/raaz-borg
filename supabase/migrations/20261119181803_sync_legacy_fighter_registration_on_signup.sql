-- Legacy fighter table is an authenticated account ledger plus a projection of athlete intake.
-- Unknown personal details remain NULL; nothing is invented and old rows are preserved.
alter table public.fighter_registrations
  alter column realm drop not null,
  alter column first_name drop not null,
  alter column last_name drop not null,
  alter column nickname drop not null,
  alter column date_of_birth drop not null,
  alter column age drop not null,
  alter column weight drop not null,
  alter column weight_unit drop not null,
  alter column height drop not null,
  alter column height_unit drop not null,
  alter column gym_name drop not null,
  alter column belt_rank drop not null,
  alter column belt_stripes drop not null,
  alter column country drop not null,
  alter column state_province drop not null,
  alter column city drop not null,
  alter column email drop not null,
  alter column payment_option drop not null,
  alter column username drop not null;
create unique index if not exists fighter_registrations_user_unique on public.fighter_registrations(user_id);
alter table public.fighter_registrations
  add column if not exists registration_status text not null default 'account_created'
    check (registration_status in ('account_created','profile_incomplete','application_submitted')),
  add column if not exists email_verified boolean not null default false;
alter table public.fighter_registrations alter column user_id set not null;

-- No direct public writes or TRUNCATE: RLS does not protect TRUNCATE.
revoke all on table public.fighter_registrations from PUBLIC,anon,authenticated;
grant select on table public.fighter_registrations to authenticated;

CREATE OR REPLACE FUNCTION rb_intake.sync_fighter_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.fighter_registrations (user_id,email,created_at,email_verified,registration_status)
  values (new.id,new.email,new.created_at,new.email_confirmed_at is not null,'account_created')
  on conflict (user_id) do update
    set email=excluded.email,
        email_verified=excluded.email_verified;
  return new;
end;
$function$;
revoke all on function rb_intake.sync_fighter_account() from PUBLIC,anon,authenticated;

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
    registration_status,created_at
  )
  select
    p.athlete_id,u.email,u.email_confirmed_at is not null,b.realm,
    p.first_name,p.last_name,p.alias,
    p.date_of_birth,
    case when p.date_of_birth is not null then
      date_part('year',pg_catalog.age(pg_catalog.current_date,p.date_of_birth))::int
    else null end,
    p.weight,p.weight_unit,p.height,p.height_unit,
    p.academy,p.belt,p.belt_stripes,p.country,p.state_province,p.city,p.username,
    case when exists (select 1 from rb_intake.applications a where a.athlete_id=p.athlete_id)
      then 'application_submitted' else 'profile_incomplete' end,
    u.created_at
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
        username=excluded.username, registration_status=excluded.registration_status;
end;
$function$;
revoke all on function rb_intake.sync_fighter_profile(uuid) from PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION rb_intake.on_fighter_profile_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform rb_intake.sync_fighter_profile(new.athlete_id);
  return new;
end;
$function$;
revoke all on function rb_intake.on_fighter_profile_change() from PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION rb_intake.on_fighter_application_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform rb_intake.sync_fighter_profile(new.athlete_id);
  return new;
end;
$function$;
revoke all on function rb_intake.on_fighter_application_change() from PUBLIC,anon,authenticated;
drop trigger if exists rb_fighter_account_sync on auth.users;
create trigger rb_fighter_account_sync after insert or update of email,email_confirmed_at on auth.users
for each row execute function rb_intake.sync_fighter_account();
drop trigger if exists rb_fighter_profile_sync on rb_intake.profiles;
create trigger rb_fighter_profile_sync after insert or update on rb_intake.profiles
for each row execute function rb_intake.on_fighter_profile_change();
drop trigger if exists rb_fighter_application_sync on rb_intake.applications;
create trigger rb_fighter_application_sync after insert on rb_intake.applications
for each row execute function rb_intake.on_fighter_application_change();

insert into public.fighter_registrations(user_id,email,email_verified,created_at,registration_status)
select u.id,u.email,u.email_confirmed_at is not null,u.created_at,'account_created'
from auth.users u
on conflict(user_id) do update
set email=excluded.email,email_verified=excluded.email_verified;

do $$
declare r record;
begin
  for r in select athlete_id from rb_intake.profiles loop
    perform rb_intake.sync_fighter_profile(r.athlete_id);
  end loop;
end;
$$;
