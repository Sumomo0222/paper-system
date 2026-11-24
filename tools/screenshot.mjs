#!/usr/bin/env node
/**
 * Luma Home — 开发用截图工具（无界面 Chrome + DevTools 协议，零依赖）。
 *
 *   node tools/screenshot.mjs --url "http://127.0.0.1:8850/?noauto&scene=0" --out /tmp/hero.png
 *   node tools/screenshot.mjs --url ... --out /tmp/m.png --mobile          # 390×844 触屏视口
 *   node tools/screenshot.mjs --url ... --out /tmp/s.png --at "#collection" --count 3
 *   node tools/screenshot.mjs --url ... --out /tmp/h.png --at "#collection" --hover ".pcard:nth-child(1) .pcard__media"
 *
 * 参数：--w --h --dpr --wait(ms) --at(选择器) --count(屏数) --hover(选择器) --click(选择器)
 *       --js("表达式") --full --keep(不自动滚动) --chrome(可执行文件路径) --port
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes('--' + name);

const url = opt('url');
const out = opt('out', '/tmp/luma-shot.png');
const mobile = flag('mobile');
const W = Number(opt('w', mobile ? 390 : 1440));
const H = Number(opt('h', mobile ? 844 : 900));
const DPR = Number(opt('dpr', mobile ? 2 : 1));
const WAIT = Number(opt('wait', 3500));
const VERBOSE = flag('verbose');
const COUNT = Number(opt('count', 1));
const PORT = Number(opt('port', 9377));
const CHROME = opt('chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
if (!url) { console.error('need --url'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureChrome() {
  const ping = async () => { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); return r.ok ? await r.json() : null; } catch { return null; } };
  let info = await ping();
  if (!info) {
    const child = spawn(CHROME, [
      '--headless=new', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/luma-probe/chrome-profile',
      '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
      '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      `--window-size=${Math.max(W, 1440)},${Math.max(H, 900)}`, 'about:blank',
    ], { detached: true, stdio: 'ignore' });
    child.unref();
    for (let i = 0; i < 40 && !info; i++) { await sleep(250); info = await ping(); }
    if (!info) throw new Error('Chrome did not start');
  }
  return info;
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Set();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
      } else if (msg.method) for (const l of [...this.listeners]) l(msg);
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params, sessionId })); });
  }
  waitEvent(method, sessionId, timeout = 20000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.listeners.delete(l); rej(new Error('timeout waiting ' + method)); }, timeout);
      const l = (msg) => { if (msg.method === method && (!sessionId || msg.sessionId === sessionId)) { clearTimeout(t); this.listeners.delete(l); res(msg.params); } };
      this.listeners.add(l);
    });
  }
}

const info = await ensureChrome();
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
const cdp = new CDP(ws);
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
const send = (m, p) => cdp.send(m, p, sessionId);

const logs = [];
cdp.listeners.add((msg) => {
  if (msg.sessionId !== sessionId) return;
  if (msg.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  if (msg.method === 'Runtime.consoleAPICalled' && (['error', 'warning'].includes(msg.params.type) || VERBOSE)) logs.push(msg.params.type.toUpperCase() + ' ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') logs.push('LOG ' + msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
});
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile });
if (mobile) {
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
}

const loaded = cdp.waitEvent('Page.loadEventFired', sessionId);
await send('Page.navigate', { url });
await loaded;
await sleep(WAIT);

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const center = async (selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({block:'center', behavior:'instant'}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);

if (opt('js')) console.log('js:', JSON.stringify(await evaluate(opt('js'))));
if (opt('scroll')) {
  await evaluate(`window.scrollTo({ top: ${Number(opt('scroll'))}, behavior: 'instant' })`);
  await sleep(900);
}
if (opt('at')) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(opt('at'))}); if (el) { const y = el.getBoundingClientRect().top + scrollY - 70; window.scrollTo({ top: y, behavior: 'instant' }); } })()`);
  await sleep(1600);
}
if (opt('hover')) {
  const c = await center(opt('hover'));
  if (c) {
    await sleep(300);
    const c2 = await center(opt('hover'));
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c2.x, y: c2.y });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c2.x + 2, y: c2.y + 2 });
    await sleep(1400);
  } else logs.push('hover target not found: ' + opt('hover'));
}
// --clicks "选择器1, 选择器2"：依次点击，每步之间等待
for (const sel of (opt('clicks') || '').split(';;').map((x) => x.trim()).filter(Boolean)) {
  await center(sel);
  await sleep(450); // 页面开启了平滑滚动，等滚动停稳再取坐标
  const c = await center(sel);
  if (!c) { logs.push('click target not found: ' + sel); continue; }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  await sleep(1100);
}
if (opt('click')) {
  const c = await center(opt('click'));
  if (c) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await sleep(1500);
  } else logs.push('click target not found: ' + opt('click'));
}

if (opt('after')) console.log('after:', JSON.stringify(await evaluate(opt('after'))));
const meta = await evaluate(`(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); let r = 'no-webgl2'; if (gl) { const e = gl.getExtension('WEBGL_debug_renderer_info'); r = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'webgl2'; } return { gl: r, docH: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight, fonts: document.fonts.status }; })()`);

mkdirSync(dirname(out), { recursive: true });
const files = [];
for (let i = 0; i < COUNT; i++) {
  if (i > 0) { await evaluate(`window.scrollBy({ top: innerHeight, behavior: 'instant' })`); await sleep(1100); }
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = COUNT > 1 ? out.replace(/(\.png)?$/, `-${i + 1}.png`) : out;
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  files.push(file);
}

console.log(JSON.stringify({ files, meta, logs: logs.filter((l) => !/favicon/.test(l)).slice(0, 20) }, null, 1));
await cdp.send('Target.closeTarget', { targetId });
ws.close();
process.exit(0);
