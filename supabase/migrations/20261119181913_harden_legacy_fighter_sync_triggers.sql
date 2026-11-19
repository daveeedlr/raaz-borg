-- Harden synchronization against Auth users without a created_at value and
-- use proper current_date syntax in derived ages.
CREATE OR REPLACE FUNCTION rb_intake.sync_fighter_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.fighter_registrations (user_id,email,created_at,email_verified,registration_status)
  values (new.id,new.email,coalesce(new.created_at, pg_catalog.now()),new.email_confirmed_at is not null,'account_created')
  on conflict (user_id) do update
    set email=excluded.email,
        email_verified=excluded.email_verified;
  return new;
end;
$function$;
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
      date_part('year',pg_catalog.age(current_date,p.date_of_birth))::int
    else null end,
    p.weight,p.weight_unit,p.height,p.height_unit,
    p.academy,p.belt,p.belt_stripes,p.country,p.state_province,p.city,p.username,
    case when exists (select 1 from rb_intake.applications a where a.athlete_id=p.athlete_id)
      then 'application_submitted' else 'profile_incomplete' end,
    coalesce(u.created_at, pg_catalog.now())
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
