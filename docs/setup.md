# Run your own copy

This sets up the game for your own family or friends. It takes about 30 minutes, costs nothing, and needs a GitHub account and a Google account. You don't need to write code, but you will edit one settings file.

What you end up with: your own website for the game, with its own private data. Nothing is shared with the original.

## 1. Copy the code

1. On the repo's GitHub page, click **Fork** (or **Use this template** if it's offered). Keep the repo **public**: GitHub's free website hosting needs that.
2. In your copy, go to **Settings → Pages → Deploy from a branch**, choose `main` and `/ (root)`, and save. Your game's address will be `https://YOUR-NAME.github.io/REPO-NAME/`.

## 2. Create the database

1. Go to console.firebase.google.com → **Add project**. Any name. You can turn Analytics off.
2. **Build → Firestore Database → Create database**. Pick a location near you and choose **production mode**.
3. Open the **Rules** tab, replace everything with the contents of [`firestore.rules`](../firestore.rules), and click **Publish**. The game can't read or write anything until you do.
4. Click the gear → **Project settings → Your apps → Web** (`</>`), and register an app. It shows a `firebaseConfig` block. You need two values from it: `projectId` and `apiKey`.

## 3. Fill in your settings

Everything specific to your group is in [`js/config.js`](../js/config.js). Edit it on GitHub (the pencil icon) or on your computer:

| Setting | What to put |
|---|---|
| `FIREBASE` | Your `projectId` and `apiKey` from step 2. |
| `SITE_URL` | Your game's address from step 1, ending in `/`. |
| `TIME_ZONE` | Your group's time zone, like `America/Chicago` or `Europe/London`. Days roll over at midnight there. |
| `FAMILY_CODE_SHA256` | A hash of the code your group types to get in. See below. |
| `ADMIN_CODE_SHA256` | A hash of the code only you know, for fixing scores. |
| `TIMER_SECONDS` | Leave at 180 unless you want a different timer. |
| `ASSISTED_PLAYERS` | People who play through a helper. Use `[]` if you have none. |
| `NUDGE_HOUR` | Only matters with the WhatsApp bot. |

**Making the two code hashes.** Pick two long codes (a few words run together is good; short words can be guessed from the hash). In a terminal with Node installed, run this once per code, typing the code in lowercase:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('your code here').digest('hex'))"
```

Paste each result into `config.js`. No Node? Search for "SHA-256 generator" and use one that runs in your browser.

**Helper players.** The original has one player, Kenny, who plays through someone else's phone: no timer, and he never holds up the day's results.
- **Nobody like that in your group?** Set `ASSISTED_PLAYERS = []` and delete `kenny.html` and `manifest-kenny.webmanifest`.
- **Someone like that?** Change the id and name in `ASSISTED_PLAYERS`. Rename `kenny.html` to match the id, and inside it change `data-as="kenny"`, the title and the app name. Do the same in the manifest file it points to.

## 4. Check it and publish

On your computer, in the repo folder (needs Node 18 or later):

```bash
npm run doctor
```

It checks that your settings are filled in, that the database answers, and that the rules are published, and tells you what to fix.

```bash
npm run stamp
```

Run this before every release. It puts a fresh version number on the files, so phones pick up your changes. Then commit and push to `main`. A minute or two later the game is live at your address.

If you edited `config.js` on GitHub and don't have Node, you can skip both commands the first time. If the site shows "the database isn't letting us in," go back to step 2.3.

## 5. Invite your group

1. Send everyone the address and the group code. Each person types their first name once.
2. On iPhone: open it in Safari, tap **Share → Add to Home Screen**.
3. You: tap ⚙︎, enter the admin code, and under **Family** check the people who play every day. Once all of them finish, the day's results come out early. With nobody checked, results come out at midnight.

Try it first without bothering anyone: add `?playtest` to the address. Practice mode has its own data, a **Reveal now** button and a **Next day** button.

## Make it yours

| To change... | Where |
|---|---|
| The categories | `PROMPTS` in `js/prompts.js` |
| A special card for a birthday or holiday | `SPECIAL_CARDS` in `js/prompts.js` |
| Which letters can come up | `LETTERS` in `js/prompts.js` |
| Scoring rules | `js/scoring.js` (run `npm test` after) |
| The name, colors and icon | `index.html`, `manifest.webmanifest`, `css/styles.css`, `tests/make-icons.mjs` |

## Optional extras

- **[Automatic WhatsApp posts](whatsapp.md):** a bot account that posts each day's results, an evening reminder, and the week's winner. It needs a spare phone number and about an hour of setup.
- **[A judge in the group chat](judge-bot.md):** an AI bot that rules on disputed answers when someone says its name. It builds on the WhatsApp bot.

## What to know before you rely on it

- **Security is "family-grade."** There are no logins. The group code keeps strangers out of the app, and the database rules block deleting or re-rolling. Someone technical could still edit answers directly. Don't use it for anything that matters.
- **It's free at family scale.** A dozen players use a small fraction of Firebase's free tier. It isn't built for hundreds of groups in one database.
- **The name.** This is a homemade game inspired by Scattergories, which is a Hasbro trademark. If you publish your copy, give it your own name and don't use theirs.
