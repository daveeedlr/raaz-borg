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
