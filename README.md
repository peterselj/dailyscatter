# Daily Scatter

A daily family category game, built for iPhones. It lives at **https://peterselj.github.io/dailyscatter/**.

## How it plays

- **Every day:** the first person to open the app rolls the letter for everyone. Each card has 5 categories and one letter. The categories and letter stay hidden until you hit **Start**, and then you get **3 minutes**. Answers save as you type and lock when time's up, or when you tap "I'm done."
- **All day:** the card is open until midnight Eastern. Before you've played, Today shows the start button first, with a **Yesterday's results** card under it (the winner and your score; tap it to see everyone's answers or to share them). After you've played, it shows the week's standings so far.
- **When everyone's done, or at midnight:** everyone's answers are revealed as soon as the whole family has finished, or at midnight if someone doesn't play. The admin picks who counts as "the family" in ⚙︎ Settings; Kenny is always optional. Until then, Today shows who it's waiting on.
  - An answer that **matches** someone else's on the same category is struck out for everyone who wrote it. Matching ignores capitals, punctuation, accents and a leading "the/a/an."
  - An answer that **doesn't start with the letter** scores 0.
  - You can't use the **same answer twice** on your own card. The box turns red, the repeat is cleared when you leave it, and a repeat would score 0 anyway.
  - Every other answer scores **1 point per word that starts with the letter**, skipping little words like "of" and "and." So "Mickey Mantle" for M is worth 2.
- **Reviewing:** anyone can tap an answer to 🚩 **flag** it, or to say it's **the same as** another answer (say, a typo). Only the admin can change scores: nudge any answer's points up or down with − / + (say "To Tell the Truth" deserves 3), or confirm a "same as."
- **Yesterday tab:** the bottom bar (right to left, so Today sits under your right thumb: Today · Yesterday · This week · Past weeks) has a **Yesterday** tab that opens everyone's answers from yesterday, from anywhere in the app.
- **Weekly:** weeks run Monday to Sunday. Scores reset every Monday, and past weeks (with winners) stay under **Past weeks**.
- **Sharing:** **Share** (at the bottom of any day's results, and the **Share** button next to "Your score yesterday" on Today) opens the iPhone share sheet with the whole day ready to paste into WhatsApp: the standings, every player's answer to every category (matches ~crossed out~, wrong letters marked ✗, admin calls marked ⚖️), and the week so far. If a phone can't open the share sheet, it copies the text instead.

### Kenny's card (playing with a helper)

Players listed in `ASSISTED_PLAYERS` (in `js/config.js`) play with a helper's phone:
- Same screen as a regular card, but with no timer: a green **Kenny mode** tag sits where the clock would be. The helper asks each category out loud and types the answer.
- Answers save as you go, so you can close it and come back later. It has to be done by midnight.
- **Not today 😴** marks a day off. Tap **Actually, let's play** to undo it.
- Kenny has his own page, `kenny.html`, which you can add to the Home Screen as a second icon.

### Adding it to the Home Screen

Open the site in Safari, tap **Share**, then **Add to Home Screen**. For Kenny, open `…/dailyscatter/kenny.html` and do the same. Each icon remembers who it's for.

## Playtest mode

Open **https://peterselj.github.io/dailyscatter/?playtest** to practice any time of day:
- **Separate data:** playtest uses its own practice data. Nothing there touches the real game or the real scores.
- **No midnight wait:** tap **Reveal now** in the yellow banner to see results right away.
- **Next day ›** jumps the practice game forward a day, so you can play through a whole week and watch the Monday reset.
- **Exit** returns to the real game. **⚙︎ → Wipe all playtest data** starts the practice over.

Playtest stays on for that phone until you tap Exit. Everyone in playtest shares the same practice game, so you can test with a few family members at once.

## Automatic WhatsApp posts

Every 10 minutes, a GitHub Actions job (`.github/workflows/post-results.yml`, which runs `tools/post-results.mjs`) checks whether a day's results are out and posts them to the family WhatsApp group:
- The whole day goes out: standings, every answer, and the week so far.
- **Quiet hours:** nothing is posted between 9pm and 9am Eastern. Results that come out then are posted at 9am.
- **After Sunday's results,** the week's winner and final standings go out too.
- **Nothing is posted twice.** Each post is recorded in the database. If WhatsApp is down, the job tries again at the next check.

It sends through [GREEN-API](https://green-api.com), which links a WhatsApp number the way WhatsApp Web does. GREEN-API is unofficial, and WhatsApp can ban numbers that act like bots, so **use a spare number, not your personal one.**

**Setup (one time):**
1. **Get a spare number** and set it up in the **WhatsApp Business** app. That app can run on the same iPhone as your regular WhatsApp, for example using a second eSIM. Name it "Daily Scatter" and add it to the family group.
2. **Connect it to GREEN-API:** sign up at green-api.com and create an instance on the free Developer plan. Then, in WhatsApp Business, go to Settings → Linked devices → Link a device, and scan the QR code from the GREEN-API console.
3. **Add three secrets to this repo** (Settings → Secrets and variables → Actions → New repository secret):
   - `GREEN_API_URL`: the API URL shown in the GREEN-API console, like `https://7103.api.greenapi.com`
   - `GREEN_API_INSTANCE`: the instance id (`idInstance`)
   - `GREEN_API_TOKEN`: the instance token (`apiTokenInstance`)
4. **Find the group's id:** go to Actions → **Post results to WhatsApp** → **Run workflow**, choose **list-groups**, and open the run's log. Copy the family group's id (it ends in `@g.us`) into a secret named `WHATSAPP_CHAT_ID`.
5. **Optional test chat:** make a small test group with the bot and add its id as `WHATSAPP_TEST_CHAT_ID`. Running the workflow with **playtest** then posts playtest results there right away. Practice results never go to the family group.
6. **Preview:** run the workflow with **dry-run** to see exactly what it would post, without posting anything.

**Keeping it running:**
- Open WhatsApp Business on that phone at least every couple of weeks. WhatsApp disconnects linked devices if the phone has been offline for about 14 days.
- GitHub pauses scheduled jobs in a public repo after 60 days with no commits. If that happens, re-enable the job on the Actions tab.
- GitHub sometimes runs scheduled jobs a few minutes late.

## One-time setup (already done unless noted)

1. **GitHub Pages:** in the repo, go to Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`.
2. **Firebase:** the project `dailyscatter-f0771` has a Firestore database.
3. **Security rules (do this once):** open the Firebase console, go to Firestore Database → **Rules**, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**. The app can't read or write anything until you do.

## Changing things

| To change... | Edit |
|---|---|
| The family code or admin code | `js/config.js` (it stores a SHA-256 of each; the comment there shows how to make a new one) |
| Timer length | `TIMER_SECONDS` in `js/config.js` |
| Who plays with a helper | `ASSISTED_PLAYERS` in `js/config.js` (each one also needs its own page: copy `kenny.html` and change `data-as`) |
| The categories | `PROMPTS` in `js/prompts.js` |
| A special card for a birthday or holiday | `SPECIAL_CARDS` in `js/prompts.js` (there's an example in the comments) |
| Which letters can come up | `LETTERS` in `js/prompts.js` |
| When a day closes and is revealed | `lockTime` in `js/time.js` (midnight Eastern) |

Players switch who they are under ⚙︎ → **Switch player**. The admin unlocks admin mode under ⚙︎ with the admin code.

## How it's built

It's a plain static site with no build step and no dependencies. `index.html` loads `js/app.js` as an ES module. The app talks to Firestore directly over its REST API (no Firebase SDK), which keeps the page small.

| File | What it does |
|---|---|
| `js/app.js` | Screens, routing, the timer and Kenny mode |
| `js/game.js` | Reading and writing game data |
| `js/scoring.js` | All scoring rules (pure functions, unit tested) |
| `js/reveal.js` | When results come out (midnight, or once the family is done) and quiet hours for posts |
| `js/time.js` | Eastern-time days, the midnight close and Monday weeks, with DST handled |
| `js/prompts.js` | Categories, letters and the daily pick (no repeats within a week) |
| `js/db.js`, `js/codec.js` | Tiny Firestore REST client |

**Data:** there is one document per day, `days/YYYY-MM-DD`. It holds the letter, the prompts, each player's card (`cards.<id>`), and the review maps (`flags`, `merges`, `overrides`). Scores are never stored; every phone works them out from the answers, so a change to the scoring rules applies to old days too. `players/<id>` remembers names for the "Who are you?" buttons.

**About security:** there are no logins. The family code keeps strangers from wandering in. The admin code is checked on the phone. The database rules stop anyone from re-rolling, deleting or adding unexpected data. This is fine for a family game, but it isn't bank-grade security: a determined techie could still edit answers through the API.

**Cost:** a family this size uses a tiny fraction of Firestore's free tier. There's no server and nothing scheduled.

## Development

Requires Node 18 or later. For the end-to-end test you also need Playwright with Chromium.

```bash
npm test              # unit tests: scoring, time zones, prompts
npm run e2e           # plays several full days on emulated iPhones (screenshots in tests/screens/)
npm run devices       # main screens on 6 iPhone sizes (SE to Pro Max, plus large text), dark mode
npm run poster        # the WhatsApp posting job, through a week of scenarios, against a fake WhatsApp
npm run check         # all of the above; run before every release
npm run serve         # local copy at http://localhost:8080 using an in-memory fake database
```

**Updates reach phones on their own.** An open app checks for a newer version every few minutes and whenever it's reopened, then reloads itself, though never in the middle of a card. ⚙︎ Settings shows the version a phone is running.

**Before every release, run `npm run stamp`.** It puts a fresh version number on every file reference (`?v=…`), so phones download a matching set of new files instead of mixing old cached ones with new ones. A unit test fails if a reference is unstamped or the stamps don't match.

On `localhost`, the app automatically uses the fake database in `tests/server.mjs`, so testing never touches the real one. To test against Google's Firestore emulator (which also enforces `firestore.rules`), start the emulator, then run with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085`.
