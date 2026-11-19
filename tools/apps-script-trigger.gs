// Google Apps Script: starts the "Post results to WhatsApp" GitHub job every
// 10 minutes. GitHub's own schedule is best-effort and often skips runs for
// hours, so this is the reliable clock. Setup steps are in docs/whatsapp.md
// ("A reliable clock").
//
// Needs a Script Property named GITHUB_TOKEN: a fine-grained GitHub token with
// access to only the dailyscatter repo and "Actions: Read and write".

// Your own copy? Change this to your GitHub "owner/repo".
var REPO = 'peterselj/dailyscatter';

function pokeDailyScatter() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Add a Script Property named GITHUB_TOKEN first.');
  // GitHub (or Google) sometimes errors for a moment. Try a few times, and only
  // report a failure (which sends Google's failure email) after 3 runs in a row
  // have failed, i.e. half an hour. A single blip stays quiet.
  let problem = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = poke(token);
      const code = res.getResponseCode();
      if (code === 204) { problem = ''; break; }
      problem = 'GitHub said ' + code + ': ' + res.getContentText();
      if (code < 500) break; // 401/403/404 won't fix themselves by retrying
    } catch (e) {
      problem = String(e && e.message || e);
    }
    Utilities.sleep(5000 * attempt);
  }
  const failures = problem ? Number(props.getProperty('FAILURES_IN_A_ROW') || 0) + 1 : 0;
  props.setProperty('FAILURES_IN_A_ROW', String(failures));
  if (failures >= 3) throw new Error(problem + ' (' + failures + ' runs in a row)');
  if (problem) console.log('Blip, will retry in 10 minutes: ' + problem);
}

function poke(token) {
  return UrlFetchApp.fetch(
    'https://api.github.com/repos/' + REPO + '/actions/workflows/post-results.yml/dispatches',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
      payload: JSON.stringify({ ref: 'main' }),
      muteHttpExceptions: true,
    },
  );
}
