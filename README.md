# Daily Scatter

A daily family category game, built for iPhones. It lives at **https://peterselj.github.io/dailyscatter/**.

## How it plays

- **Every day:** the first person to open the app rolls the letter for everyone. Each card has 5 categories and one letter. The categories and letter stay hidden until you hit **Start**, and then you get **3 minutes**. Answers save as you type and lock when time's up, or when you tap "I'm done."
- **At 1:00pm Eastern:** cards lock and everyone's answers are revealed.
  - An answer that **matches** someone else's on the same category is struck out for everyone who wrote it. Matching ignores capitals, punctuation, accents and a leading "the/a/an."
  - An answer that **doesn't start with the letter** scores 0.
  - Every other answer scores **1 point per word that starts with the letter**, skipping little words like "of" and "and." So "Mickey Mantle" for M is worth 2.
- **Reviewing:** anyone can tap an answer to 🚩 **flag** it, or to say it's **the same as** another answer (say, a typo). Only the admin can change scores: set an answer's points or confirm a "same as."
- **Weekly:** weeks run Monday to Sunday. Scores reset every Monday, and past weeks (with winners) stay under **Past weeks**.
- **Sharing:** the Share buttons open the iPhone share sheet with a ready-to-send summary for the group chat.

### Kenny's card (playing with a helper)

Players listed in `ASSISTED_PLAYERS` (in `js/config.js`) play with a helper's phone:
- There's no timer, and the screen shows one big category at a time. The helper asks the question out loud and types the answer.
- Answers save as you go, so you can close it and come back later. It has to be done by 1pm.
- **Not today 😴** marks a day off. Tap **Actually, let's play** to undo it.
- Kenny has his own page, `kenny.html`, which you can add to the Home Screen as a second icon.

### Adding it to the Home Screen

Open the site in Safari, tap **Share**, then **Add to Home Screen**. For Kenny, open `…/dailyscatter/kenny.html` and do the same. Each icon remembers who it's for.

## Playtest mode

Open **https://peterselj.github.io/dailyscatter/?playtest** to practice any time of day:
- **Separate data:** playtest uses its own practice data. Nothing there touches the real game or the real scores.
- **No 1pm wait:** tap **Reveal now** in the yellow banner to see results right away.
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
| Lock/reveal time | `LOCK_HOUR` in `js/time.js` |

Players switch who they are under ⚙︎ → **Switch player**. The admin unlocks admin mode under ⚙︎ with the admin code.

## How it's built

It's a plain static site with no build step and no dependencies. `index.html` loads `js/app.js` as an ES module. The app talks to Firestore directly over its REST API (no Firebase SDK), which keeps the page small.

| File | What it does |
|---|---|
| `js/app.js` | Screens, routing, the timer and Kenny mode |
| `js/game.js` | Reading and writing game data |
| `js/scoring.js` | All scoring rules (pure functions, unit tested) |
| `js/time.js` | Eastern-time days, the 1pm lock and Monday weeks, with DST handled |
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

On `localhost`, the app automatically uses the fake database in `tests/server.mjs`, so testing never touches the real one. To test against Google's Firestore emulator (which also enforces `firestore.rules`), start the emulator, then run with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085`.
