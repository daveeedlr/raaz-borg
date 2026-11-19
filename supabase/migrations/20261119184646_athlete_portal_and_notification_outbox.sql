-- RA'AZ BORG private personalized fighter portal and durable email-notification outbox.
-- Email delivery requires an external verified sender; in-app messages work immediately.
create table rb_intake.athlete_notifications(
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references rb_intake.applications(id) on delete set null,
  kind text not null check(kind in ('welcome','sign_in')),
  session_id uuid,
  created_at timestamptz not null default now(),
  email_state text not null default 'pending'
    check(email_state in ('pending','processing','sent','failed')),
  email_attempts integer not null default 0 check(email_attempts>=0),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text
);
alter table rb_intake.athlete_notifications enable row level security;
revoke all on rb_intake.athlete_notifications from PUBLIC,anon,authenticated;
create unique index athlete_welcome_once
  on rb_intake.athlete_notifications(athlete_id) where kind='welcome';
create unique index athlete_signin_once_per_session
  on rb_intake.athlete_notifications(athlete_id,session_id) where kind='sign_in';
create index athlete_notifications_recent
  on rb_intake.athlete_notifications(athlete_id,created_at desc);
create index athlete_notifications_delivery
  on rb_intake.athlete_notifications(email_state,claimed_at,created_at);
create index athlete_notifications_application
  on rb_intake.athlete_notifications(application_id);
CREATE OR REPLACE FUNCTION rb_intake.queue_first_application_welcome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into rb_intake.athlete_notifications(athlete_id,application_id,kind)
  values(new.athlete_id,new.id,'welcome')
  on conflict do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION rb_intake.rb_claim_athlete_emails(p_athlete_id uuid, p_limit integer DEFAULT 4)
 RETURNS TABLE(id uuid, kind text, recipient text, username text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  return query
  with claims as (
    select n.id
    from rb_intake.athlete_notifications n
    where n.athlete_id=p_athlete_id and n.email_attempts<3
      and (n.email_state='pending' or
         (n.email_state='processing' and n.claimed_at < now()-interval '5 minutes'))
    order by n.created_at,n.id
    limit greatest(1,least(coalesce(p_limit,4),8))
    for update skip locked
  ), updated as (
    update rb_intake.athlete_notifications n
    set email_state='processing',email_attempts=email_attempts+1,claimed_at=now()
    from claims c where n.id=c.id
    returning n.id,n.kind,n.athlete_id,n.created_at
  )
  select d.id,d.kind,u.email::text,
    coalesce(nullif(p.username,''),nullif(p.alias,''),split_part(u.email,'@',1)),
    d.created_at
  from updated d
  join auth.users u on u.id=d.athlete_id
  left join rb_intake.profiles p on p.athlete_id=d.athlete_id
  where u.email_confirmed_at is not null and u.email is not null;
end;
$function$;

CREATE OR REPLACE FUNCTION rb_intake.rb_finish_athlete_email(p_id uuid, p_sent boolean, p_error text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_updated integer;
begin
  if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  update rb_intake.athlete_notifications n
  set email_state=case when p_sent then 'sent'
      when n.email_attempts>=3 then 'failed' else 'pending' end,
      sent_at=case when p_sent then now() else null end,
      claimed_at=null,
      last_error=case when p_sent then null else left(coalesce(p_error,'Delivery failed'),200) end
  where n.id=p_id and n.email_state='processing';
  get diagnostics v_updated = row_count;
  return v_updated=1;
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
    'name',coalesce(nullif(p.alias,''),nullif(concat_ws(' ',p.first_name,p.last_name),''),split_part(u.email,'@',1)),
    'realm',b.realm,
    'belt',p.belt,
    'gym',p.academy,
    'country',p.country,
    'weight',p.weight,
    'weight_unit',p.weight_unit,
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

CREATE OR REPLACE FUNCTION rb_intake.rb_queue_sign_in_alert()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_owner uuid := auth.uid();
  v_session uuid;
begin
  if v_owner is null then
    raise exception 'Sign in required' using errcode='42501';
  end if;
  v_session := nullif(auth.jwt()->>'session_id','')::uuid;
  if v_session is null then
    return false;
  end if;
  insert into rb_intake.athlete_notifications(athlete_id,kind,session_id)
    values(v_owner,'sign_in',v_session)
    on conflict do nothing;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rb_claim_athlete_emails(p_athlete_id uuid, p_limit integer DEFAULT 4)
 RETURNS TABLE(id uuid, kind text, recipient text, username text, created_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select * from rb_intake.rb_claim_athlete_emails(p_athlete_id,p_limit);
$function$;

CREATE OR REPLACE FUNCTION public.rb_finish_athlete_email(p_id uuid, p_sent boolean, p_error text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select rb_intake.rb_finish_athlete_email(p_id,p_sent,p_error);
$function$;

CREATE OR REPLACE FUNCTION public.rb_my_fighter_portal()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select rb_intake.rb_my_fighter_portal();
$function$;

CREATE OR REPLACE FUNCTION public.rb_queue_sign_in_alert()
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select rb_intake.rb_queue_sign_in_alert();
$function$;
revoke all on function rb_intake.queue_first_application_welcome(),
  rb_intake.rb_queue_sign_in_alert(),public.rb_queue_sign_in_alert(),
  rb_intake.rb_my_fighter_portal(),public.rb_my_fighter_portal(),
  rb_intake.rb_claim_athlete_emails(uuid,integer),public.rb_claim_athlete_emails(uuid,integer),
  rb_intake.rb_finish_athlete_email(uuid,boolean,text),public.rb_finish_athlete_email(uuid,boolean,text)
from PUBLIC,anon,authenticated,service_role;
grant execute on function rb_intake.rb_queue_sign_in_alert(),public.rb_queue_sign_in_alert(),
  rb_intake.rb_my_fighter_portal(),public.rb_my_fighter_portal() to authenticated;
grant execute on function rb_intake.rb_claim_athlete_emails(uuid,integer),public.rb_claim_athlete_emails(uuid,integer),
  rb_intake.rb_finish_athlete_email(uuid,boolean,text),public.rb_finish_athlete_email(uuid,boolean,text)
to service_role;
create trigger rb_welcome_after_application after insert on rb_intake.applications
for each row execute function rb_intake.queue_first_application_welcome();
insert into rb_intake.athlete_notifications(athlete_id,application_id,kind)
select distinct on(a.athlete_id) a.athlete_id,a.id,'welcome'
from rb_intake.applications a
order by a.athlete_id,a.submitted_at,a.id
on conflict do nothing;
notify pgrst,'reload schema';
