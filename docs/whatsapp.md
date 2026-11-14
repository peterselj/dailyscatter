# Automatic WhatsApp posts

Optional. Without this, the **Share** button in the app does the same job by hand.

Every 10 minutes (started by a Google Apps Script timer; see "A reliable clock" below), a GitHub Actions job (`.github/workflows/post-results.yml`, which runs `tools/post-results.mjs`) checks whether a day's results are out and posts them to the group's WhatsApp chat:
- The whole day goes out: standings, every answer, and the week so far.
- **Quiet hours:** nothing is posted between 9pm and 9am (in the game's time zone). Results that come out then are posted at 9am.
- **Evening reminder:** at 6pm, if the day's results aren't out yet, it posts who still hasn't played. Change the hour or turn it off with `NUDGE_HOUR` in `js/config.js`.
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
2. **Make the script:** go to script.google.com → **New project**. Name it "Daily Scatter clock", delete what's there, and paste in the contents of `tools/apps-script-trigger.gs`. If this is your own copy of the game, change `REPO` at the top to your GitHub `owner/repo`. Click Save.
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


**Emails you can ignore, and ones you can't:**

| Email | What it means |
|---|---|
| GitHub: "All jobs have failed" around noon | The WhatsApp link dropped. Re-link it (see above). |
| GitHub: "All jobs have failed", several in a row at other times | Something is actually broken. Open the run's log. |
| GitHub: "No jobs were run … Internal server error", once or twice | A GitHub hiccup. Ignore it. |
| Google: "GitHub said 401" or "403" | The clock's GitHub token expired. Make a new one. |
| Google: "GitHub said 502" (or 500, 503) | A GitHub hiccup. Ignore it. |
