# RAAZ BORG — Combat Re-Coded

Official website of **Ra'az Undergrounds** — an underground grappling platform from Quito, Ecuador, where traditional martial arts collide with neuro-interface fiction.

## Pages

| Page | File |
|---|---|
| Universe (home) | `index.html` |
| Athlete account and applications | `competir.html` |
| Fighters | `fighters.html` |
| Qualification guide | `realm-nexus.html` |
| Clashes GP | `clashes.html` |
| Labs & Media | `labs.html` |
| Shop — Combat Suits | `shop.html` |

## Stack

Static HTML/CSS/JS — no build step. Shared styles in `css/style.css`, shared logic (EN/ES language toggle, navigation and visual effects) in `js/main.js`, optimized images in `assets/`.

## Local preview

Open `index.html` in a browser, or:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Deploy

Works out of the box on GitHub Pages (Settings → Pages → Deploy from branch → `main`, root).

---

RA'AZ BORG © 2026 — [@raazborg](https://www.instagram.com/raazborg/)

## Athlete application backend

Supabase Auth supplies the account identity. The private `rb_intake` schema stores profiles, belt mappings, submitted applications, reviewer membership and review history. Existing fighter registrations and event records retain their original structure. An application expresses interest in the GP, the Börg Lab or both. A reviewer invitation does not award one of the eight GP places.

### Authenticated API

Call these public functions through Supabase RPC with the athlete’s session. Generate a UUID once per intended submission and reuse it for retries.

```js
const { data: receipt, error } = await supabase.rpc('rb_submit_application', {
  p_request_id: requestId,
  p_alias: alias,
  p_city: city,
  p_belt: belt,
  p_interest: interest,
  p_contact_consent: consent,
  p_academy: academy,
  p_discipline: discipline,
  p_footage_url: footageUrl
});
```

The server derives the contact email from the verified account and the suggested realm from the selected belt. Unmapped ranks go to staff for review. Show a receipt only after a successful response. The same request ID with changed details returns a conflict.

| Function | Purpose |
|---|---|
| `rb_my_profile()` | Prefill the signed-in athlete’s current details. |
| `rb_my_applications()` | Show their receipts and current statuses. |
| `rb_review_queue()` | Staff list of submitted records with contact details. Use range pagination for larger queues. |
| `rb_review_application(p_id, p_expected_status, p_new_status)` | Move a submission into review, invite the athlete or close the application. A stale status requires a refresh. |

A project administrator assigns staff by inserting a verified staff account UUID into `rb_intake.reviewers(user_id)`. Keep this schema outside the exposed API schemas. Staff membership is managed in the database. The migration leaves new memberships empty.

### Verification and rollout

The SQL checks in `supabase/tests/intake.sql` run in a rollback-only transaction on a test database with Supabase Auth. They cover retry behavior, realm assignment, athlete isolation and staff review. Run with `psql -v ON_ERROR_STOP=1 -f supabase/tests/intake.sql` after applying the migration to a test project.

The bilingual Competir page uses the project’s publishable key and a pinned local Supabase JS client. Signed-in athletes can submit and view their own applications. Enable email/password authentication in Supabase and allow the deployed Competir URL with its selection query parameters in Auth redirect URLs (for the fork, `https://jayjayanton.github.io/raaz-borg/competir.html**`). Email confirmation and recovery links depend on these project settings. The public email address remains available for assistance.

## Launch operation checklist (November 2026 audit)

- **Customer flow:** browsing the shop requires no account; prices are published in USD and orders are initiated through email or Instagram. Listed stock is a manual snapshot, not a live inventory feed. Reconcile counts after every sale (especially sizes and sold-out flags).
- **Athlete flow:** new visitors select a belt and interest, create an account, confirm the email, then sign in and submit their application. Existing users sign in with the same email and can return to their receipt and status. A submission is not acceptance into the GP or a confirmed fight.
- **Review operations:** the protected reviewer RPCs exist, but reviewer accounts must be added explicitly to `rb_intake.reviewers`. Check the review queue regularly; the public website does not automatically email staff for new applications. Configure a tested notification system before depending on instant outreach.
- **Authentication setup:** enable email/password, email confirmation, and the complete deployed `competir.html` URL in Supabase Auth redirect allow-list. Verify the business inbox can receive confirmation and recovery mail. Enable leaked-password protection in Supabase Auth if supported by your plan.
- **Regression:** `npm ci && npm test` runs browser smoke coverage in CI. Database role, idempotency and isolation tests run in the separate athlete-intake workflow.

## Staff reviewer console

The private staff UI lives at `equipo.html` (do not add it to the public navigation). Staff sign in with an already confirmed Supabase account. It displays the queue and status transitions through the pre-existing protected `rb_review_queue` and `rb_review_application` RPCs. The page itself never grants reviewer permissions.

A trusted Supabase administrator can approve an existing verified reviewer account with:
```sql
insert into rb_intake.reviewers(user_id)
select id from auth.users
where email = 'replace-with-verified-staff-email@example.org'
  and email_confirmed_at is not null;
```
Do not approve unconfirmed or disposable QA accounts. Reviewers email applicants manually; changing a status does not notify them automatically. Staff should only mark `invited` after sending an invitation. Remove staff access by deleting that UUID from `rb_intake.reviewers` when necessary.

## Athlete profile v2 — registration and storage

The site reuses the existing Supabase project `iltuwbawjiwvuqqrkyiz`, not a separate database. Login and email confirmation live in `auth.users`. Athlete identity, belt, gym, geographic and optional size details live in `rb_intake.profiles`; each submitted application stores an immutable `profile_snapshot` in `rb_intake.applications`. Staff can inspect the snapshot via the protected `rb_review_queue_v2` function. The original legacy `public.fighter_registrations` table remains untouched.

The athlete submits verified identity, first/last name, fighter alias, location, optional username, birthday, belt stripes, weight/height, gym and discipline. Age is calculated rather than duplicated; email is supplied from verified Auth identity; payments and avatar uploads are not collected during interest application. Existing v1 RPCs remain compatible.

**Hosted Auth redirect configuration (must be set in Supabase Dashboard):** Authentication → URL Configuration. Set Site URL to `https://jayjayanton.github.io/raaz-borg/`, and allow `https://jayjayanton.github.io/raaz-borg/competir.html**` in Redirect URLs. Reissue any confirmation link that previously returned to localhost. A public static page cannot change the project's Auth Site URL.

## Legacy fighter registrations: automatic synchronization

`public.fighter_registrations` is now an account/athlete summary synchronized in Postgres. The `auth.users` insert/confirmation trigger creates a **partial** legacy row with `user_id`, verified-email flag and `registration_status='account_created'`; no fake biographical or payment fields are inserted. Changes in `rb_intake.profiles` copy actual fighter details into that row, and an application submission changes `registration_status` to `application_submitted`.

Do not confuse **accounts** (`auth.users`) with **applications** (`rb_intake.applications`). The private intake profile and applications remain authoritative, while the legacy table is only a restricted, RLS-protected summary. Browser roles cannot INSERT, UPDATE or TRUNCATE the summary directly; profile changes must go through the protected RPCs. Birth-derived age is recalculated on profile changes (not continuously); the date of birth is canonical. Missing values remain `NULL`.

The migrations `20261119181803_sync_legacy_fighter_registration_on_signup.sql` and `20261119181913_harden_legacy_fighter_sync_triggers.sql` have been applied to Supabase project `iltuwbawjiwvuqqrkyiz`. The standalone CI harness builds a disposable baseline for the older table before applying migrations and testing the Auth, profile and application triggers. All fixture accounts are rolled back; they are not production data.
