# Daily Scatter

A daily family category game, built for iPhones. It lives at **https://peterselj.github.io/dailyscatter/**.

## How it plays

- **Every day:** the first person to open the app rolls the letter for everyone. Each card has 5 categories and one letter. The categories and letter stay hidden until you hit **Start**, and then you get **3 minutes**. Answers save as you type and lock when time's up, or when you tap "I'm done."
- **All day:** the card is open until midnight Eastern. Before you've played, Today shows the start button first, with a **Yesterday's results** card under it (the winner and your score; tap it to see everyone's answers or to share them). After you've played, it shows the week's standings so far.
- **When everyone's done, or at midnight:** everyone's answers are revealed as soon as the whole family has finished, or at midnight if someone doesn't play. The admin picks who counts as "the family" in ⚙︎ Settings; Kenny is always optional. Until then, Today shows who it's waiting on.
  - An answer that **matches** someone else's on the same category is struck out for everyone who wrote it. Matching ignores capitals, punctuation, accents and a leading "the/a/an."
  - An answer counts if **any of its main words** starts with the letter, so "Eat Pizza" works for P. Little words like "the", "of" and "and" don't count, so "The Godfather" doesn't work for T. This is friendlier than the official rule, where only the first word counts. If no main word starts with the letter, the answer scores 0.
  - You can't use the **same answer twice** on your own card. The box turns red, the repeat is cleared when you leave it, and a repeat would score 0 anyway.
  - Every other answer scores **1 point per word that starts with the letter**, skipping little words like "of" and "and." So "Mickey Mantle" for M is worth 2.
- **Challenges:** anyone can tap an answer to 🚩 **challenge** it, or to say it's **the same as** another answer (say, a typo). If most of the other players who played that day challenge an answer (and at least two do), it's tossed and scores 0, like the vote in the board game. The admin has the last word: − / + sets any answer's points (say "To Tell the Truth" deserves 3), and "same as" suggestions need the admin's OK. In admin mode, Today lists anything waiting for a decision.
- **Yesterday tab:** the bottom bar (right to left, so Today sits under your right thumb: Today · Yesterday · This week · Past weeks) has a **Yesterday** tab that opens everyone's answers from yesterday, from anywhere in the app.
- **Highlights:** each day's results call out the talking points: matching answers ("great minds"), the top-scoring answers, the only person to score in a category, and anyone who scored in all five. They're in the app and in the WhatsApp post.
- **Streaks:** play on consecutive days and you get a 🔥 streak, shown next to your name. Missing a day resets it.
- **Hall of fame:** the Past weeks tab starts with all-time records: weeks won, days won, best day, average and longest streak.
- **Evening reminder:** at 6pm Eastern, if the day's results aren't out yet, the WhatsApp bot posts who still hasn't played. It never posts more than one a day. Change the hour, or turn it off, with `NUDGE_HOUR` in `js/config.js`.
- **Weekly:** weeks run Monday to Sunday. Scores reset every Monday, and past weeks (with winners) stay under **Past weeks**.
- **Sharing:** **Share** (at the bottom of any day's results, and the **Share** button next to "Your score yesterday" on Today) opens the iPhone share sheet with the whole day ready to paste into WhatsApp: the standings, every player's answer to every category (matches ~crossed out~, answers with no word starting with the letter marked ✗, admin calls marked ⚖️), and the week so far. If a phone can't open the share sheet, it copies the text instead.

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

Every 10 minutes (started by a Google Apps Script timer; see "A reliable clock" below), a GitHub Actions job (`.github/workflows/post-results.yml`, which runs `tools/post-results.mjs`) checks whether a day's results are out and posts them to the family WhatsApp group:
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

**A reliable clock (needed):** GitHub's built-in schedule is best-effort. In practice it skipped runs for hours at a time, including the 9am post. So a Google Apps Script timer starts the job every 10 minutes instead; the GitHub schedule stays on as a backup.
1. **Make a GitHub token that can only start this job:** github.com → your picture → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
   - Name: "Daily Scatter clock". Expiration: the longest offered (add a calendar reminder to renew it).
   - Repository access: **Only select repositories** → `dailyscatter`.
   - Permissions → Repository permissions → **Actions: Read and write**. Nothing else.
   - Generate it and copy the token.
2. **Make the script:** go to script.google.com → **New project**. Name it "Daily Scatter clock", delete what's there, and paste in the contents of `tools/apps-script-trigger.gs`. Click Save.
3. **Store the token in the script:** ⚙︎ Project Settings → Script Properties → **Add script property**. Property `GITHUB_TOKEN`, value: the token. Save.
4. **Test it:** back in the Editor, pick `pokeDailyScatter` in the toolbar and click **Run**, then approve the permissions Google asks for. It should finish with no error, and a new "Post results to WhatsApp" run should appear on GitHub's Actions tab.
5. **Start the timer:** ⏰ Triggers → **Add Trigger** → function `pokeDailyScatter`, event source **Time-driven**, **Minutes timer**, **Every 10 minutes** → Save.

If the token expires or something breaks, Google emails you about the failed runs.

**Keeping it running:**
- **The bot's phone has to check in with WhatsApp at least every 14 days,** or WhatsApp disconnects Green API. Green API suggests every 10. Automate it with an iPhone Shortcut on the phone that has WhatsApp Business:
  1. Shortcuts app → **Automation** → **+** → **Time of Day**. Pick a weekly time when the phone is usually unlocked, like Sunday 10am. Choose **Run Immediately**.
  2. Add the action **Open App** → **WhatsApp Business**. Done.
- **If the link ever drops anyway,** the job notices on its next run and stops trying to post, so it doesn't use up retries. Once a day (the noon run) it marks itself as failed, so GitHub emails you. To fix it, open WhatsApp Business, go to Linked devices, and remove the old Green API device. Then scan the QR code again in the Green API console. Any due posts go out once it's back.
- **The GitHub key for the clock expires** on the date you chose when you made it. GitHub emails a reminder beforehand. Make a new one the same way and paste it into the script's `GITHUB_TOKEN` property.
- GitHub pauses its own backup schedule after 60 days without commits. That doesn't matter, because the Google clock doesn't depend on it.

## Sheabot (the judge in the group chat)

Say **Sheabot** in the WhatsApp group and it answers, as a reply to your message:
- "Sheabot, is 'fruit salad' a legit sandwich starting with F?"
- Reply to a results post with "Sheabot, rule on Zach's #3."

It knows the house rules and the results the family can already see (yesterday's, and today's once they're out). It never gives away today's card early. Its rulings are advice: the family vote and the admin still decide scores.

**How it works:** the script `tools/sheabot.gs` runs in the same Google Apps Script project as the clock. GREEN-API forwards the group's messages to it. Messages that mention Sheabot go to Google's Gemini AI (free tier) for an answer; everything else is ignored and never leaves the script.

**Setup (about 15 minutes, one time):**
1. **Get a free AI key:** go to aistudio.google.com, sign in, and choose **Get API key → Create API key**. Don't add billing; the free tier is plenty.
2. **Add the script:** open your "Daily Scatter clock" project at script.google.com. Click **+** next to Files → **Script**, name it `sheabot`, and paste in the contents of `tools/sheabot.gs`. Save.
3. **Add Script Properties** (⚙︎ Project Settings → Script Properties):
   - `GEMINI_API_KEY`: the key from step 1
   - `GREEN_API_URL`, `GREEN_API_INSTANCE`, `GREEN_API_TOKEN`: the same three values you gave GitHub (they're in the GREEN-API console)
   - `WHATSAPP_CHAT_ID`: the group's id, the same value as the GitHub secret
   - `WEBHOOK_KEY`: make up a long random word (letters and numbers)
4. **Test the AI:** in the Editor, choose `sheabotTest` in the toolbar and click **Run**. Approve the permissions. The Execution log should show a ruling on "fruit salad".
5. **Deploy it:** **Deploy → New deployment** → type **Web app** → Execute as **Me**, Who has access **Anyone** → **Deploy**. Copy the **Web app URL** (it ends in `/exec`) and add it as one more Script Property, `WEBAPP_URL`.
6. **Connect it:** run `sheabotConnect` from the Editor. Wait about five minutes, then say "Sheabot, are you there?" in the group.

**Good to know:**
- **Changing how it talks or rules:** add a Script Property `SHEABOT_STYLE` with extra instructions, like "Be tougher on puns." No redeploy needed.
- **After editing the script itself:** Deploy → Manage deployments → ✎ → Version: **New version** → Deploy. The URL stays the same.
- **Switching it off:** run `sheabotDisconnect`.
- **Speed:** it uses Google's "lite" Flash model, which answers in about 2 seconds on the free tier. The full Flash model took over 2 minutes when tried. To use a different model, set a Script Property `GEMINI_MODEL`.
- **Limits:** it answers at most 30 messages an hour. If Google's free allowance runs out for the day, it says it can't rule right now.
- **Privacy:** every message in the group passes through GREEN-API and your Google script so Sheabot can hear its name. Only messages that mention Sheabot (and the message they reply to) are sent to Google's AI. On the free tier, Google may use those to improve its products.

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
| Your own name | ⚙︎ → **Change my name** (your scores and streak stay with you) |
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
| `js/stats.js` | Highlights, streaks and hall-of-fame records (pure functions, unit tested) |
| `js/reveal.js` | When results come out (midnight, or once the family is done) and quiet hours for posts |
| `js/time.js` | Eastern-time days, the midnight close and Monday weeks, with DST handled |
| `js/prompts.js` | Categories, letters and the daily pick (no category repeats for about 9 weeks) |
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
