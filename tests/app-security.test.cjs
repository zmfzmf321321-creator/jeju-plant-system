const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/js/app.js'), 'utf8');
function load(names, extra = {}) {
  const context = vm.createContext({ console, structuredClone, URL, ...extra });
  for (const name of names) {
    const match = source.match(new RegExp(`^  (?:async )?function ${name}\\([^\\n]*\\)[\\s\\S]*?^  }`, 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
  return context;
}
test('profile is fail closed for missing, false, string true, and query errors', async () => {
  for (const result of [{ data: null }, { data: { is_approved: false } }, { data: { is_approved: 'true' } }, { error: { message: 'denied' } }]) {
    const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return result; } };
    const c = load(['getSignedInProfile'], { supabaseClient: { from: () => query } });
    assert.equal((await c.getSignedInProfile({ id: 'u' })).isApproved, false);
  }
  const c = load(['getSignedInProfile'], { supabaseClient: { from() { throw Error('offline'); } } });
  assert.equal((await c.getSignedInProfile({ id: 'u' })).isApproved, false);
});
test('pagination uses stable order and retrieves rows beyond first page', async () => {
  const calls = [];
  const c = load(['fetchAllRows'], { supabaseClient: { from(table) { return { select() { return this; }, order(key) { calls.push([table, key]); return this; }, async range(a,b) { return { data: a === 0 ? Array.from({length:1000}, (_,id)=>({id})) : [{id:1000}] }; } }; } } });
  assert.equal((await c.fetchAllRows('instruments')).length, 1001);
  assert.deepEqual(calls, [['instruments','id'],['instruments','id']]);
});
test('valid zero coordinates remain zero', () => {
  const c = load(['normalizeInstrumentRecord'], { normalizeFloor: x => x });
  const result = c.normalizeInstrumentRecord({ coord_x: 0, coord_y: '0', history_logs: null });
  assert.equal(result.coord_x, 0); assert.equal(result.coord_y, 0); assert.equal(result.originalHistoryLogs, null);
});
test('measurement labels escape stored HTML', () => {
  const c = load(['escapeDisplayText']);
  assert.equal(c.escapeDisplayText('<img src=x onerror="bad()">'), '&lt;img src=x onerror=&quot;bad()&quot;&gt;');
});
test('local date uses local components across UTC boundary', () => {
  class LocalDate { getFullYear(){return 2026;} getMonth(){return 9;} getDate(){return 1;} toISOString(){throw Error('UTC must not be used');} }
  const c = load(['getLocalDateValue'], { Date: LocalDate });
  assert.equal(c.getLocalDateValue(), '2026-10-01');
});
test('conflict preserves local history and queries original snapshot', async () => {
  const calls = []; let refresh = 0;
  const query = { update(x){calls.push(x);return this;},eq(k,v){calls.push([k,v]);return this;},select(){return this;}, async maybeSingle(){return {data:null};} };
  const c = load(['saveHistoryConditionally'], { supabaseClient: { from:()=>query }, alert:()=>{}, fetchInstruments:async()=>refresh++ });
  const target = {id:7,history_logs:[{content:'before'}]};
  assert.equal(await c.saveHistoryConditionally(target,target.history_logs,[{content:'new'}]),false);
  assert.equal(target.history_logs[0].content,'before'); assert.equal(refresh,1);
  assert.deepEqual(calls[2],['history_logs',JSON.stringify(target.history_logs)]);
});
test('retry after a conflict keeps the original editor index and equipment snapshot', async () => {
  const match = source.match(/document\.getElementById\('btnSaveHist'\)\.addEventListener\('click', async \(\) => \{([\s\S]*?)^  \}\);/m);
  assert.ok(match);
  const original = [{content:'first'}, {content:'editing'}];
  const current = [{content:'concurrent insertion'}, ...original];
  const target = {id:'A', history_logs:current, originalHistoryLogs:current};
  const elements = {histContent:{value:'my edit'}, histAuthor:{value:'worker'}, histDate:{value:'2026-10-01'}, loginUserBadge:{}};
  let captured;
  const context = vm.createContext({
    structuredClone, activeTargetId:'B', editingHistoryIndex:1,
    historyEditorSnapshot:{targetId:'A',index:1,original}, currentInstruments:[target],
    pendingHistPhotoFile:null, document:{getElementById:id=>elements[id]},
    localStorage:{setItem(){}}, currentUserInfo:{}, uploadImageToStorage:async()=>null,
    saveHistoryConditionally:async(t,before,after)=>{captured={t,before,after}; return false;}, alert(){}
  });
  vm.runInContext(`async function submitHistory(){${match[1]}}`,context);
  await context.submitHistory();
  assert.equal(captured.t.id,'A');
  assert.equal(captured.before.length,2);
  assert.equal(captured.after[0].content,'first');
  assert.equal(captured.after[1].content,'my edit');
  assert.equal(target.history_logs[0].content,'concurrent insertion');
});
test('history rendering treats stored markup as text and binds image separately', () => {
  class Element {
    constructor(){this.children=[];this.style={};this.listeners={};}
    set innerHTML(x){throw Error('unsafe HTML');}
    append(...children){this.children.push(...children);}
    appendChild(child){this.children.push(child);}
    replaceChildren(){this.children=[];}
    addEventListener(name,fn){this.listeners[name]=fn;}
  }
  const list = new Element(); const bindings=[];
  const c = load(['renderHistoryListModal'], { document:{getElementById:()=>list,createElement:()=>new Element()}, bindPhoto:(el,url)=>bindings.push(url), openEditHistory:()=>{},deleteHistoryItem:()=>{},openImageLightbox:()=>{} });
  const attack = '<img src=x onerror=alert(1)>';
  c.renderHistoryListModal({history_logs:[{content:attack,author:attack,date:attack,photo:'private-url'}]});
  assert.equal(list.children[0].children[1].textContent,attack);
  assert.deepEqual(bindings,['private-url']);
});
test('storage rejects external URLs, other buckets and SVG', async () => {
  const c = load(['storagePhotoPath'],{SUPABASE_URL:'https://example.supabase.co'});
  assert.throws(()=>c.storagePhotoPath('https://evil.example/a.png'));
  assert.throws(()=>c.storagePhotoPath('https://example.supabase.co/storage/v1/object/public/other/a.png'));
  assert.throws(()=>c.storagePhotoPath('https://example.supabase.co/storage/v1/object/public/instrument-photos/a%2F..%2Fb.png'));
  assert.equal(c.storagePhotoPath('https://example.supabase.co/storage/v1/object/public/instrument-photos/u/a.png'),'u/a.png');
  const blobContext = load(['getPhotoBlob'], { rasterTypes: new Set(['image/png']), storagePhotoPath: ()=>'a.svg', supabaseClient: {storage:{from:()=>({download:async()=>({data:{type:'image/svg+xml',size:20}})})}} });
  await assert.rejects(blobContext.getPhotoBlob('canonical-svg-url'));
});
test('upload captures original equipment before awaiting and updates only after DB success', async () => {
  let resolve; const upload = new Promise(r=>resolve=r); const calls=[];
  const target={id:'A'};
  const query={update(){return this;},eq(key,id){calls.push(id);return this;},select(){return this;},async maybeSingle(){return {data:{id:'A'}};}};
  const c=load(['handleUpdateMainPhoto'],{activeTargetId:'A',currentInstruments:[target,{id:'B'}],uploadImageToStorage:()=>upload,supabaseClient:{from:()=>query},renderFloorPins:()=>{},render3DHotspots:()=>{},alert:()=>{},bindPhoto:()=>{throw Error('stale UI binding');}});
  const pending=c.handleUpdateMainPhoto({}); c.activeTargetId='B'; resolve('url'); await pending;
  assert.deepEqual(calls,['A']); assert.equal(target.photo_url,'url');
});
