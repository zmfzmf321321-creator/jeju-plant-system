const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = stripTypeScriptTypes(readFileSync(`${__dirname}/index.ts`, 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace('export async function handler', 'async function handler'), { mode: 'transform' });
let approved = true;
let validUser = true;
let profileOk = true;
let calls = [];
const context = vm.createContext({
  Request, Response, URL, Uint8Array, TextDecoder, AbortSignal, atob, console,
  Deno: { env: { get: name => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon', GEMINI_API_KEY: 'mock' })[name] } },
  base64Encode: bytes => Buffer.from(bytes).toString('base64'),
  serve: handler => { context.handle = handler; },
  fetch: async (input, options) => {
    const url = String(input);
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return Response.json(validUser ? { id: 'user-1' } : {}, { status: validUser ? 200 : 401 });
    if (url.includes('/rest/v1/user_profiles')) return Response.json([{ is_approved: approved }], { status: profileOk ? 200 : 500 });
    if (url.includes('/storage/')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
    if (url.startsWith('https://generativelanguage.googleapis.com/')) return Response.json({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    throw new Error(`Unexpected fetch: ${url}`);
  },
});
vm.runInContext(source, context);
const request = body => new Request('https://local/', { method: 'POST', headers: { authorization: 'Bearer real-user-token' }, body: JSON.stringify(body) });
async function expectStatus(req, status, expectedCalls) {
  calls = [];
  assert.equal((await context.handle(req)).status, status);
  if (expectedCalls !== undefined) assert.equal(calls.length, expectedCalls);
}
(async () => {
  await expectStatus(new Request('https://local/', { method: 'OPTIONS' }), 200, 0);
  await expectStatus(new Request('https://local/'), 405, 0);
  await expectStatus(new Request('https://local/', { method: 'POST', body: 'invalid' }), 401, 0);
  validUser = false;
  await expectStatus(request({ prompt: 'test' }), 401, 1);
  validUser = true; approved = false;
  await expectStatus(request({ prompt: 'test' }), 403, 2);
  approved = true; profileOk = false;
  await expectStatus(request({ prompt: 'test' }), 403, 2);
  profileOk = true;
  await expectStatus(request({ prompt: 'test' }), 200, 3);
  for (const url of ['http://127.0.0.1/private', 'https://evil.com/x', 'https://example.supabase.co/auth/v1/user', 'data:image/svg+xml;base64,PHN2Zz4=']) {
    await expectStatus(request({ prompt: 'test', photosToSend: [url] }), 400, 2);
  }
  await expectStatus(request({ prompt: 'test', photosToSend: ['https://example.supabase.co/storage/v1/object/public/instrument-photos/photo.png'] }), 200, 4);
  const storageCall = calls.find(item => item.url.includes('/storage/'));
  assert.equal(storageCall.url, 'https://example.supabase.co/storage/v1/object/authenticated/instrument-photos/photo.png');
  assert.equal(storageCall.options.headers.Authorization, 'Bearer real-user-token');
  assert.equal(storageCall.options.redirect, 'error');
  await expectStatus(request({ prompt: 'test', photosToSend: ['data:image/png;base64,AQID'] }), 200, 3);
  await expectStatus(request({ prompt: 'x'.repeat(12 * 1024 * 1024) }), 413, 2);
  console.log('PASS: auth, live approval, fail closed, SSRF, authenticated storage, raster validation and request limit');
})().catch(error => { console.error(error); process.exitCode = 1; });
