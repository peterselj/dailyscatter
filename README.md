# Daily Scatter

A daily family category game, built for iPhones. It lives at **https://peterselj.github.io/dailyscatter/**.

## How it plays

- **Every day:** the first person to open the app rolls the letter for everyone. Each card has 5 categories and one letter. The categories and letter stay hidden until you hit **Start**, and then you get **3 minutes**. Answers save as you type and lock when time's up, or when you tap "I'm done."
- **All day:** the card is open until midnight Eastern. Before you've played, Today shows the start button first, with a **Yesterday's results** card under it (the winner and your score; tap it to see everyone's answers or to share them). After you've played, it shows the week's standings so far.
- **At midnight:** the day closes and everyone's answers are revealed.
  - An answer that **matches** someone else's on the same category is struck out for everyone who wrote it. Matching ignores capitals, punctuation, accents and a leading "the/a/an."
  - An answer that **doesn't start with the letter** scores 0.
  - You can't use the **same answer twice** on your own card. The box turns red, the repeat is cleared when you leave it, and a repeat would score 0 anyway.
  - Every other answer scores **1 point per word that starts with the letter**, skipping little words like "of" and "and." So "Mickey Mantle" for M is worth 2.
- **Reviewing:** anyone can tap an answer to 🚩 **flag** it, or to say it's **the same as** another answer (say, a typo). Only the admin can change scores: nudge any answer's points up or down with − / + (say "To Tell the Truth" deserves 3), or confirm a "same as."
- **Yesterday tab:** the bottom bar has a **Yesterday** tab that opens everyone's answers from yesterday, from anywhere in the app.
- **Weekly:** weeks run Monday to Sunday. Scores reset every Monday, and past weeks (with winners) stay under **Past weeks**.
- **Sharing:** **Share all answers** (on any day's results, and the **Share** button next to "Your score yesterday" on Today) opens the iPhone share sheet with the whole day ready to paste into WhatsApp: the standings, every player's answer to every category (matches ~crossed out~, wrong letters marked ✗, admin calls marked ⚖️), and the week so far. If a phone can't open the share sheet, it copies the text instead.

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
npm run serve         # local copy at http://localhost:8080 using an in-memory fake database
```

**Updates reach phones on their own.** An open app checks for a newer version every few minutes and whenever it's reopened, then reloads itself, though never in the middle of a card. ⚙︎ Settings shows the version a phone is running.

**Before every release, run `npm run stamp`.** It puts a fresh version number on every file reference (`?v=…`), so phones download a matching set of new files instead of mixing old cached ones with new ones. A unit test fails if a reference is unstamped or the stamps don't match.

On `localhost`, the app automatically uses the fake database in `tests/server.mjs`, so testing never touches the real one. To test against Google's Firestore emulator (which also enforces `firestore.rules`), start the emulator, then run with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085`.
