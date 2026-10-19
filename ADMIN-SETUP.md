# Per-user login and course portal: admin guide

Supabase project: **UGL Training Course** (`fjojwlygbbajfqhdusut`).

## How the site is organised

- `index.html` is the portal: sign-in, then four tabs. **Home** (progress only), **Course** (four tracks of lessons), **Tools** (email answers, calculators and state tables) and **Simulator**. Every item appears in exactly one tab, set by its `section` in `ugl-catalog.js`. Progress counts Course lessons the trainee has **marked as read** (a button on each lesson card and inside each lesson); opening a lesson does not count by itself. Marks are stored in `lesson_done` and can be undone.
- Everything inside the tracks is private. The files people open live in the Supabase Storage bucket `course`, and their sources live in the **private** GitHub repo `ugl-training-sources` (never in this public repo):
  - the six training decks (bucket root) and their narration (`audio/`)
  - `pages/`: policies, tools and references built from the documents in `sources/`
  - `files/`: PDFs, shown in the built-in viewer
- `ugl-catalog.js` lists every item (title, section, track or tool group, file path). Add one by uploading the file and adding a line there. `soon: true` shows a "Coming soon" card.
- Colors live in one token block at the top of `ugl-site.css` (`--u-*`), with a light set under `:root[data-theme="light"]` (the decks' paper palette). The sun/moon button (`ugl-theme.js`) switches the whole site, remembers the choice per browser, and opens the narrated decks in the same theme.
- Everything opens inside the site: HTML pages and decks through `module.html`, and PDFs in the built-in viewer (pdf.js, bundled in `vendor/pdfjs`).
- `module.html` is the loader. It never reads the bucket directly: it asks the **content gateway** (the `content` Edge Function, source in `supabase/functions/content/`) for each file. The gateway checks the user and the browser, logs the request (`access_log`, and `module_opens` for the open history) and returns a link that works for 60 seconds. A lesson is kept on the device after its first download (cleared at sign-out), so reopening it is instant, but the gateway is still asked and logs every open.

## One-time setup (Supabase dashboard)

1. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up".
2. **Authentication → URL Configuration**: set **Site URL** (and Redirect URLs) to the address where this site is hosted.
3. **Storage → `course` bucket**: filled automatically from the private `ugl-training-sources` repo (see *Changing content*).

## Adding people (username and password, no real email)

People sign in with a plain **username** and a password. Supabase needs an email-shaped id behind the scenes, so the site adds `@ugldispatch.com` to whatever is typed (`omar` becomes `omar@ugldispatch.com`). Nothing is ever emailed. The domain is set in `ugl-config.js` (`userDomain`).

**Admin page → Add a person**: type a username, type a password or press **Generate**, tick **Make this person an admin** if they should see the Admin page, and press **Add person**. The page then shows the username and password to hand over (with a Copy button). The person types only the username and the password on the login page.

**Forgotten password**: Admin page → the person's row → **Reset password**. Keep the suggested password or type your own; the page shows it to hand over.

These and the account actions below go through the `admin-users` Edge Function (source in `supabase/functions/admin-users/`), which refuses anyone who is not an admin and records every change in `security_events` (kind `admin`).

Without the Admin page: Supabase dashboard → Authentication → Users → Add user → Create new user (email = username + `@ugldispatch.com`, tick **Auto Confirm User**). Password from SQL:

```sql
update auth.users
set encrypted_password = extensions.crypt('NewPassword123', extensions.gen_salt('bf'))
where email = 'omar@ugldispatch.com';
```

On the **Admin** page, each person's row also has:
- **Block / Unblock**: block signs them out within half a minute, wherever they are, and stops them signing in. Unblock lets them sign in again.
- **More → Make admin / Remove admin rights**: making someone an admin also removes any access limit on them.
- **More → Delete account**: you have to type their username to confirm. Their progress, lesson history and access settings are deleted with the account. The activity log keeps their past events, without a name.

Nobody can block, delete or remove admin rights from their own account, so there is always at least one admin. Admins cannot be blocked; remove their admin rights first.

## Changing content

Content is edited in the private `ugl-training-sources` repo; the tools here expect it cloned next to this repo (`../ugl-training-sources`, or set `UGL_SOURCES`).

1. Edit the source in `sources/` (for example `policy-reefer.docx`) or a deck in `decks/`.
2. Decks: `python3 tools/build_decks.py` (removes the old password gate, re-encodes the narration at 48 kbps into `audio/<deck>.pack`, converts images to WebP and fonts to WOFF2; needs ffmpeg, Pillow, fontTools and brotli). A 17 MB deck becomes about 2 MB, plus its narration, which loads after the slides appear.
   Pages: `python3 tools/build_content.py` (needs `python-docx` and poppler's `pdftotext`).
3. Commit and push the private repo. Its **Sync course files to Supabase** workflow uploads whatever changed in `upload-to-supabase/` to the bucket (and removes deleted files). It signs in with GitHub's own short-lived token, which only that workflow on `main` can get, so there is no password to keep. To upload everything again, run the workflow by hand (Actions → Sync course files to Supabase → Run workflow).

In the private repo, `sources/legacy/` holds the older "Policy and Charges" documents; they are not shown in the portal.

## Work Simulator

- Cases live in `sources/simulator-cases.json`. Each case is a short shift: messages arrive by email or Telegram and the trainee either picks an answer (`choice`) or writes a reply (`reply`) that is checked against rubric points.
- The Simulator is hidden (`hidden: true` in `ugl-catalog.js`) until the real cases are ready. To show it: build, upload `pages/simulator.html`, and remove both `hidden` flags.
- After changing cases: `python3 tools/build_content.py`, then upload `upload-to-supabase/pages/simulator.html` to the bucket's `pages` folder (replace the old one).
- Results: Table Editor → `sim_results`. One row per finished case with the user, score, and every answer they gave, including the emails and messages they wrote.

## Responsibility checklist

`sources/responsibility-checklist.docx` becomes `pages/responsibilities.html` (Course → Start Here): the 8 load stages with tick boxes and a "Start a new load" reset.

## FMCSA summary

`sources/fmcsa-summary.docx` becomes `pages/fmcsa-summary.html` (Course → Compliance & Safety). Edit the Word file, run `python3 tools/build_content.py`, and upload the page again. The "Key numbers" tiles are set in `FMCSA_KEYS` in `tools/build_content.py`.

## Email course and Email Quick Answers

`sources/carrier-dispatch-email-course.html` becomes `pages/email-course.html` (Course → Daily Workflow): the 10 modules with their screenshots, and the knowledge check with each answer hidden until it is opened.

`sources/email-answers.json` becomes `pages/email-answers.html` (Tools → Email & inbox). It has two modes: **What do I do?** (type the situation or tap a common one, get one answer) and **Is this sender real?** (checks a setup sender against the three verified addresses). To add a situation, copy an entry in `items` and fill in `q` (the situation), `do` (the one-line instruction shown big), `a` (one short supporting line, optional), `steps` (up to 3), `k` (extra search words, the words people actually type), `lvl` (`scam`, `check`, `act`, `pass` or `how`) and `mod` (the course module its link opens). `common` lists the buttons shown before anyone types. Rebuild and upload `pages/email-answers.html` again.

## Preview before launch

`python3 tools/build_preview.py OUT_DIR` builds an offline copy of the whole site (no login, progress kept in the browser) for review. The narrated decks are not bundled because of their size.

## Admin page and security

Admins (listed in `public.admins`) see an **ADMIN** button in the top bar. `admin.html` shows, for the last 30 days:
- every trainee's lessons marked as read, last lesson opened and reading time, with a per-lesson list (marked or not, times opened, reading time) and activity trail;
- alerts: failed sign-ins (which account was tried, how many times, from which device and address), lessons marked as read without ever being opened, refused requests (scripts, bots, robot-driven or headless browsers, AI browsers that name themselves, other websites, too many lessons too fast), copy / print / save attempts with what was selected, and pages left open with no mouse, keyboard, touch or scrolling;
- **Block / Unblock**: blocking uses Supabase's own ban. The sign-in server refuses the person from then on, so open pages sign them out within half a minute (every page checks every 30 seconds, and whenever the tab comes back into view) and show "Your access is paused". They cannot sign in again until you unblock them. The lesson gateway refuses them at once.
- **Access**: choose what one person can open:
  - **Everything** (the default);
  - **Tools only** (every tool, including tools added later, and no lessons);
  - **Only what I pick** (tick lessons and tools; a group's top box ticks the whole group).

  The **CAN OPEN** column shows each person's choice. Their **MARKED AS READ** count is out of the lessons they can open. A limit applies at once: the gateway refuses anything outside it, even from an old link. Their menu changes the next time they open or refresh the course, and any copies of lessons saved on their device for fast reopening that are no longer open to them are deleted then. Admins always see everything.

The rules behind it:
- Course files can only be fetched through the gateway. Signed-in users cannot read the bucket directly, and the open history (`module_opens`) is written by the gateway, not the browser, so it can be neither skipped nor faked. Read marks are the trainee's own choice; the admin page shows any lesson marked as read that was never opened.
- The gateway refuses: requests from other sites or without the course page's browser signals; known crawlers, AI fetchers and HTTP libraries; browsers driven by WebDriver or running headless; AI browsers that identify themselves; blocked users; anything outside a person's access limit (it reads `ugl-catalog.js` from the live site to know which file is which item and which items are tools); more than 60 requests or 14 different lessons in 10 minutes (9 lessons raises an alert).
- Sign-in: sign-ups and guest accounts are off; Supabase allows about 30 sign-in attempts per address every few minutes; every wrong password typed on the login page is reported to the Admin page (`login-report` Edge Function, at most 30 reports per address per hour; the password itself is never sent).
- Signing out ends access at once: the database only accepts a login token whose session still exists (`session_active()`), so a token copied from a signed-out browser is useless, even an admin's.
- The pages hide themselves if another website tries to show them inside a frame (clickjacking).
- On lesson pages: copy, cut, right-click, save, view-source and print are turned off and reported; a faint watermark with the username and date covers every page; a hidden notice tells AI assistants the content is confidential.
- Limits: anything shown on a screen can still be photographed or retyped, and AI browsers that look exactly like Chrome (most of them) cannot be told apart from a person except by behaviour, which the reading-time alerts cover. The watermark is there so a leaked screenshot shows whose account it came from.

Data: `access_log` (every gateway request), `security_events` (page reports, failed sign-ins, account changes), `blocked_users`, `admins`, `user_access` (one row per limited person: `mode` is `tools` or `custom`, `items` lists the catalog ids for `custom`; no row means everything). Only admins can read them, except that each person can read their own `user_access` row so the menu knows what to show. Only admins can change `user_access`, never for themselves, and the database records who made each change. Database functions `gateway_open` and `gateway_event` are callable only by the gateway.

## Bucket sync function

The Edge Function `course-admin` (source in `supabase/functions/course-admin/`) is what the private repo's sync workflow calls. It accepts uploads and deletions only with a GitHub token issued to the `main` branch of `Ugl-Update/ugl-training-sources`, and can only write to the `course` bucket.

## Seeing activity

- The **Admin** page (above).
- Last login: Authentication → Users → *Last sign in*.
- Raw data: Table Editor → `lesson_done` (marked as read), `module_opens` (opened), `access_log`, `security_events`.

## Public repo warning

This repo is public and only holds the site itself (login, portal, styles, tools). The decks, documents and built pages were moved to the private `ugl-training-sources` repo, but older commits and pull request #1 still contain them. To remove them completely, make this repo private (GitHub Pages then needs a paid plan or another host) or move the site to a fresh repository.
