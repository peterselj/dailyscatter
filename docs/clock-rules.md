# Clock rules: rolling them out

The database keeps the timer honest. When a card starts, Firestore stamps the time itself, and `firestore.rules` refuses answer changes once the timer (plus 3 minutes' grace) runs out, after "I'm done", or after the day ends. Nobody sees anything new: no sign-in, no new screens.

The app and the rules have to change in the right order, or saves get refused. That's why there are two steps, a few days apart.

## Step 1, before merging the app update

1. Open the Firebase console → **Firestore Database** → **Rules**.
2. Replace everything there with the contents of [`docs/firestore-step1.rules`](firestore-step1.rules), then **Publish**.

This only allows one new field (`editing`), so the app everyone has today keeps working and the updated app can save.

3. Merge the app update. Phones pick it up the next time the app is opened.

## Step 2, once everyone has played on the updated app

1. Run:

   ```
   npm run clock-check
   ```

   It lists each player's latest card from the last two weeks and whether it was played on the updated app. It only reads.
2. When it says everyone is updated, replace the rules with [`firestore.rules`](../firestore.rules) and **Publish**.

Someone who hasn't played in a while doesn't need to hold this up: when they next open the app, it updates before they start a card. The only risk is a phone that has the old app open in the background during the switch. Its saves would be refused ("Too late to save"), and the answers stay in that phone's backup.

## Undoing it

Publish `docs/firestore-step1.rules` again. The updated app works with either.

## What the rules check

- A card's start is stamped by the database (`serverStartedAt`). A phone can't set it, move it, or restart the clock.
- Answers can change only until the timer runs out plus 3 minutes (slow networks, the last save after "Time's up"), and not at all after "I'm done".
- No card changes after the day ends, and cards can't be removed.
- Each write changes one card, named in `editing`.
- Helper players (`ASSISTED_PLAYERS`, e.g. Kenny) have no timer and can skip, until the day ends.

Not covered yet: knowing *who* is writing. Anyone with the app's address can still read answers before the reveal, write someone else's card, or set scores in admin mode. Fixing that needs each phone to have an identity (the "private answers" step).

## Tests

- `npm test`: includes a check that `firestore.rules` lists the same helper players and special-card timers as `js/config.js` and `js/prompts.js`. If you add a special card with `timerSeconds`, add it to `timerSeconds()` in `firestore.rules` too.
- `npm run test:rules`: runs `tests/rules.test.mjs` against Google's Firestore emulator (needs Java; downloads the emulator the first time). This also runs in CI.
