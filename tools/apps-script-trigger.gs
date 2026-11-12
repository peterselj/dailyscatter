// Google Apps Script: starts the "Post results to WhatsApp" GitHub job every
// 10 minutes. GitHub's own schedule is best-effort and often skips runs for
// hours, so this is the reliable clock. Setup steps are in the README
// ("Automatic WhatsApp posts" > "A reliable clock").
//
// Needs a Script Property named GITHUB_TOKEN: a fine-grained GitHub token with
// access to only the dailyscatter repo and "Actions: Read and write".

function pokeDailyScatter() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Add a Script Property named GITHUB_TOKEN first.');
  // GitHub sometimes answers with a server error for a moment; try a few times
  // before giving up, so one hiccup doesn't send a failure email.
  let res;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = poke(token);
    if (res.getResponseCode() < 500) break;
    Utilities.sleep(5000 * attempt);
  }
  if (res.getResponseCode() !== 204) {
    throw new Error('GitHub said ' + res.getResponseCode() + ': ' + res.getContentText());
  }
}

function poke(token) {
  return UrlFetchApp.fetch(
    'https://api.github.com/repos/peterselj/dailyscatter/actions/workflows/post-results.yml/dispatches',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
      payload: JSON.stringify({ ref: 'main' }),
      muteHttpExceptions: true,
    },
  );
}
