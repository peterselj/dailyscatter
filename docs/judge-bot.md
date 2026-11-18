# The judge bot (Sheabot)

Optional, and it needs the WhatsApp bot from [whatsapp.md](whatsapp.md) set up first.

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

**Making it yours:** the settings block at the top of `tools/sheabot.gs` holds the bot's name, the pattern that spots its name in a message, its persona, and your Firebase project and time zone. Change those to match your `js/config.js`. In this family it's Shea, the parents' Westie.

**Good to know:**
- **Changing how it talks or rules:** add a Script Property `SHEABOT_STYLE` with extra instructions, like "Be tougher on puns." No redeploy needed.
- **After editing the script itself:** Deploy → Manage deployments → ✎ → Version: **New version** → Deploy. The URL stays the same.
- **Switching it off:** run `sheabotDisconnect`.
- **Speed:** it uses Google's "lite" Flash model, which answers in about 2 seconds on the free tier. The full Flash model took over 2 minutes when tried. To use a different model, set a Script Property `GEMINI_MODEL`.
- **Limits:** it answers at most 30 messages an hour. If Google's free allowance runs out for the day, it says it can't rule right now.
- **Privacy:** every message in the group passes through GREEN-API and your Google script so Sheabot can hear its name. Only messages that mention Sheabot (and the message they reply to) are sent to Google's AI. On the free tier, Google may use those to improve its products.
