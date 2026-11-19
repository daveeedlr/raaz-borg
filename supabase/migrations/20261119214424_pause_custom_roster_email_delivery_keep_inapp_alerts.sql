-- Pause automatic outbound email dispatch without disabling roster registration
-- or the durable staff inbox. The RA'AZ BORG in-app notifications continue normally.
create or replace function rb_intake.rb_notify_roster_insert()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
  insert into rb_intake.roster_alerts(application_id,created_at)
  values(new.id,new.submitted_at)
  on conflict(application_id) do nothing;
  -- No pg_net HTTP request while custom outbound mail is paused.
  return new;
end;
$fn$;
revoke all on function rb_intake.rb_notify_roster_insert()
from PUBLIC,anon,authenticated;
