# RAAZ BORG — Combat Re-Coded

Official website of **Ra'az Undergrounds** — an underground grappling platform from Quito, Ecuador, where traditional martial arts collide with neuro-interface fiction.

## Pages

| Page | File |
|---|---|
| Universe (home) | `index.html` |
| Athlete interest (email) | `competir.html` |
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

## Moving athlete inquiries into accounts

The public site runs on GitHub Pages. Today, `competir.html` prepares an email draft. Its URL can carry a belt and an interest (`gp`, `lab`, or `both`), which lets an athlete return to the same application. The athlete sends the email from their own mail app. Browsing videos, viewing fighters and exploring the shop are public activities.

The separate account prototype has an Express API, Supabase Auth, fighter profiles and a dashboard. Its client calls a local development server. Registration currently couples account creation to athlete and payment details, and the recovery screens are empty. The following steps apply to a future account release.

1. **Keep the entry point.** When an athlete chooses to apply, check for a valid session. Returning athletes go straight to their application. New visitors can sign in or create an account in Spanish or English. Return to the selected belt and GP or Lab interest after verification or sign-in. Carry only these choices through the return URL. Collect athlete details when the application needs them.
2. **Connect a staging API and database.** Configure an HTTPS API origin and Supabase Auth for the staging site. Implement email verification, recovery, sign-out and expired-session handling. Store privileged credentials on the server. Use a verified session to determine the owner of each private profile and application.
3. **Separate an account from an application.** A private profile stores reusable athlete details. A separate application records the event or Lab interest, belt, contact consent and review status. Validate the belt and derive the suggested realm on the server. Make retries return the same application. Only staff can change review status or confirm a GP spot. Publish a profile only after separate approval.
4. **Test the handoff.** Run a two-account test of row-level access, plus staff review, recovery, a repeated submission and returning to the chosen realm on mobile. Enable the account path once athletes can see a receipt and their status and the team can see the same application in its queue. Keep the email route available during rollout.
