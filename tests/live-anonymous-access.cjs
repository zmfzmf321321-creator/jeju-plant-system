// Read-only live smoke check. Never prints credentials or returned business data.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
const project = source.match(/const SUPABASE_URL = '([^']+)'/)[1];
const publishableKey = source.match(/const SUPABASE_KEY = '([^']+)'/)[1];
(async () => {
  const checks = [
    ['anonymous business data', `${project}/rest/v1/instruments?select=id&limit=1`, { headers: { apikey: publishableKey } }],
    ['unauthenticated AI', `${project}/functions/v1/gemini-chat`, { method: 'POST', headers: { apikey: publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'access check' }) }],
  ];
  if (process.env.SECURITY_TEST_PHOTO_PATH) checks.push(['legacy public photo', `${project}/storage/v1/object/public/instrument-photos/${process.env.SECURITY_TEST_PHOTO_PATH.split('/').map(encodeURIComponent).join('/')}`, {}]);
  for (const [name, url, options] of checks) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    await response.arrayBuffer();
    assert.ok(response.status >= 400 && response.status < 500, `${name}: expected denial, got ${response.status}`);
    console.log(`PASS: ${name} denied (${response.status})`);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
