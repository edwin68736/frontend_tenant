// Benchmark controlado del POS (app local, tenant demo). Latencia artificial por petición /api/* (simula
// los ~250 ms/llamada medidos en producción). Mide: primer producto visible, peticiones iniciales y duplicadas.
// Uso: node pos_bench.js <etiqueta> <runs> <latenciaMs>
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const label = process.argv[2] || 'run';
const RUNS = Number(process.argv[3] || 5);
const LAT = Number(process.argv[4] || 250);
const ORIGIN = 'http://demo.localhost:5173';
const URL_ = ORIGIN + '/sales/pos';
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
const port = 9460 + Math.floor(Math.random() * 30);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'posb-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--no-first-run',
  '--disable-extensions', '--host-resolver-rules=MAP *.localhost [::1]', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port, path: p }, (r) => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej);
});

(async () => {
  let ver;
  for (let i = 0; i < 40; i++) { try { ver = await getJson('/json/version'); break; } catch { await sleep(250); } }
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); const listeners = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else listeners.forEach(l => l(d));
  });
  const send = (method, params = {}, sessionId) => new Promise((res) => {
    const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const seedScript = `try{const s=${JSON.stringify(seed)};if(!localStorage.getItem('token')){for(const k in s)localStorage.setItem(k,s[k]);}}catch(e){}`;

  async function navigateAndMeasure(sess, reqs, state) {
    reqs.length = 0; state.t0 = Date.now(); state.firstProduct = null; state.lastApiEnd = 0; state.inflight = 0;
    await send('Page.navigate', { url: URL_ }, sess);
    const deadline = Date.now() + 40000;
    let idleSince = 0;
    while (Date.now() < deadline) {
      await sleep(25);
      if (state.firstProduct === null) {
        const ev = await send('Runtime.evaluate', { expression: `!!document.querySelector('[data-product-visual]')`, returnByValue: true }, sess);
        if (ev.result && ev.result.result && ev.result.result.value === true) state.firstProduct = Date.now() - state.t0;
      }
      if (state.firstProduct !== null && state.inflight === 0) {
        idleSince = idleSince || Date.now();
        if (Date.now() - idleSince > 1200) break;
      } else idleSince = 0;
    }
    return {
      firstProductMs: state.firstProduct,
      firstApiAtMs: reqs.length ? reqs[0].at : null,
      apiCount: reqs.length,
      lastApiEndMs: state.lastApiEnd,
      reqs: reqs.map(r => ({ at: r.at, end: r.end, u: r.u })),
    };
  }

  const out = { label, lat: LAT, cold: [], warm: [] };
  for (let n = 0; n < RUNS; n++) {
    const ctx = (await send('Target.createBrowserContext')).result.browserContextId;
    const tgt = (await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx })).result.targetId;
    const sess = (await send('Target.attachToTarget', { targetId: tgt, flatten: true })).result.sessionId;
    await send('Page.enable', {}, sess);
    await send('Network.enable', {}, sess);
    await send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript }, sess);
    await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] }, sess);
    const reqs = []; const state = { t0: 0, firstProduct: null, lastApiEnd: 0, inflight: 0 };
    const byReqId = new Map();
    const onEv = (d) => {
      if (d.sessionId !== sess) return;
      if (d.method === 'Fetch.requestPaused') {
        const p = d.params; const url = new URL(p.request.url);
        if (p.request.method === 'OPTIONS') { send('Fetch.continueRequest', { requestId: p.requestId }, sess); return; }
        const rec = { at: Date.now() - state.t0, u: p.request.method + ' ' + url.pathname + (url.search ? '?' + url.search.slice(1, 40) : ''), end: 0 };
        reqs.push(rec); state.inflight++;
        byReqId.set(p.networkId || p.requestId, rec);
        setTimeout(() => send('Fetch.continueRequest', { requestId: p.requestId }, sess), LAT);
      }
      if (d.method === 'Network.loadingFinished' || d.method === 'Network.loadingFailed') {
        const rec = byReqId.get(d.params.requestId);
        if (rec && !rec.end) { rec.end = Date.now() - state.t0; state.lastApiEnd = Math.max(state.lastApiEnd, rec.end); state.inflight = Math.max(0, state.inflight - 1); }
      }
    };
    listeners.push(onEv);
    out.cold.push(await navigateAndMeasure(sess, reqs, state));
    out.warm.push(await navigateAndMeasure(sess, reqs, state));
    listeners.splice(listeners.indexOf(onEv), 1);
    await send('Target.closeTarget', { targetId: tgt });
    await send('Target.disposeBrowserContext', { browserContextId: ctx });
  }
  fs.writeFileSync(path.join(__dirname, 'bench_' + label + '.json'), JSON.stringify(out));
  const med = (a) => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const summ = (arr) => ({ firstProductMs_p50: med(arr.map(r => r.firstProductMs)), apiCount_p50: med(arr.map(r => r.apiCount)), firstApiAt_p50: med(arr.map(r => r.firstApiAtMs)) });
  console.log(JSON.stringify({ label, lat: LAT, cold: summ(out.cold), warm: summ(out.warm) }));
  const collapse=(rs)=>{const o=[];rs.forEach(r=>{const prev=o.find(x=>x.u===r.u&&Math.abs(x.at-r.at)<40);if(!prev)o.push(r)});return o};const col=collapse(out.warm[out.warm.length-1].reqs);const cnt={};col.forEach(r=>{const k=r.u.split('?')[0];cnt[k]=(cnt[k]||0)+1});const dups=Object.entries(cnt).filter(([,v])=>v>1);console.log('colapsando pares StrictMode (<40ms): únicas='+col.length+' repetidas='+JSON.stringify(dups));const dup = {}; out.warm[out.warm.length - 1].reqs.forEach(r => { dup[r.u] = (dup[r.u] || 0) + 1; });
  console.log('peticiones (última corrida caliente):');
  out.warm[out.warm.length - 1].reqs.forEach(r => console.log('  ', String(r.at).padStart(5), String(r.end).padStart(5), r.u));
  chrome.kill();
  process.exit(0);
})();
