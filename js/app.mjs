/* ============================================================
 * PAPER SYSTEM — 应用逻辑
 * hash 路由单页应用：首页 / 商品列表 / 商品详情 / 定制工坊 / 结算
 * 依赖：js/data.js（window.PS_DATA）与 js/art.mjs
 * ============================================================ */
import { renderProductArt, renderCustomArt } from './art.mjs';

const D = window.PS_DATA;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

/* ---------------- 工具 ---------------- */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => D.currency.symbol + Math.round(n).toLocaleString('en-US');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const byId = (pid) => D.products.find((p) => p.id === pid);
const catName = (id) => (D.categories.find((c) => c.id === id) || {}).name || id;
const RULE_NAME = { grid: '方眼', dot: '点阵', line: '横线', blank: '白纸', week: '周间页' };

/* 持久化 */
const store = {
  get(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 忽略 */ } },
};

/* ---------------- 库存（含本地已购扣减） ---------------- */
const stockUsed = () => store.get('ps-stock-v1', {});
const stockOf = (pid) => Math.max(0, (byId(pid)?.stock ?? 0) - (stockUsed()[pid] || 0));
function consumeStock(taken) {
  const used = stockUsed();
  for (const [pid, n] of Object.entries(taken)) used[pid] = (used[pid] || 0) + n;
  store.set('ps-stock-v1', used);
  renderCartCount();
}
const stockBadge = (pid) => {
  const n = stockOf(pid);
  if (n <= 0) return { cls: 'out', label: '补货中', text: '补货中' };
  if (n <= 5) return { cls: 'low', label: `库存紧张 · 仅剩 ${n}`, text: `仅剩 ${n}` };
  return { cls: '', label: `现货 · 库存 ${n}`, text: '现货' };
};

/* ---------------- 购物车 ---------------- */
/* 行结构：{ key, pid|null, name, img, unit, qty, variant:[...], engrave, setParts } */
let cart = store.get('ps-cart-v1', []);
const cartSave = () => store.set('ps-cart-v1', cart);
const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);
const cartSubtotal = () => cart.reduce((s, i) => s + i.qty * i.unit, 0);

function cartMaxOf(item) {
  return item.pid ? stockOf(item.pid) + heldInCart(item.pid) - (item.qty - 0) : 99;
}
function heldInCart(pid) {
  return cart.filter((i) => i.pid === pid).reduce((s, i) => s + i.qty, 0);
}
function addToCart(entry) {
  const line = cart.find((i) => i.key === entry.key);
  const cap = entry.pid ? stockOf(entry.pid) : 99;
  const inCart = line ? line.qty : 0;
  if (entry.pid && inCart + entry.qty > cap) {
    toast(`库存不足 — 「${entry.name}」最多可购 ${cap - inCart} 件`);
    return false;
  }
  if (line) line.qty += entry.qty;
  else cart.push(entry);
  cartSave();
  renderCartCount();
  renderCartDrawer();
  toast(`已加入购物车 — ${entry.name}`);
  return true;
}
function removeFromCart(key) {
  cart = cart.filter((i) => i.key !== key);
  cartSave(); renderCartCount(); renderCartDrawer();
}

/* ---------------- Toast ---------------- */
let toastZone;
function toast(msg, ms = 2600) {
  if (!toastZone) { toastZone = document.createElement('div'); toastZone.className = 'toast-zone'; document.body.appendChild(toastZone); }
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span class="t-dot"></span>${esc(msg)}`;
  toastZone.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
}

/* ---------------- 路由 ---------------- */
const app = () => $('#app');
let route = { path: 'home', params: {} };
const cleanups = [];

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [pathPart, qs] = h.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { path: segs[0] || 'home', params: { ...params, id: params.id || segs[1] || '' } };
}

function nav(hash) { if (location.hash === hash) render(); else location.hash = hash; }

function render() {
  cleanups.forEach((f) => { try { f(); } catch { /* noop */ } }); cleanups.length = 0;
  closeCart(); closeMenu();
  route = parseHash();
  const v = {
    '': viewHome, home: viewHome, shop: viewShop, product: viewProduct,
    custom: viewCustom, checkout: viewCheckout, done: viewDone,
  }[route.path] || viewHome;
  const main = app();
  main.innerHTML = v();
  main.classList.remove('page-enter'); void main.offsetWidth; main.classList.add('page-enter');
  window.scrollTo(0, 0);
  bindReveal();
  bindCommon(main);
  afterRender[route.path === '' ? 'home' : route.path]?.();
  updateNav();
}

const afterRender = {
  home() { initDesk(); initShelf(); initTeaser(); },
  shop() { initShopFilters(); },
  product() { initProductPage(); },
  custom() { initCustomizer(); },
  checkout() { initCheckout(); },
  done() {},
};

function updateNav() {
  const cur = route.path === '' ? 'home' : route.path;
  $$('.nav-links a, .mobile-menu a').forEach((a) => {
    a.classList.toggle('on', a.dataset.route === cur);
  });
}

/* ---------------- 通用绑定 ---------------- */
function bindCommon(root) {
  $$('[data-nav]', root).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); closeMenu(); nav(a.getAttribute('href')); }));
  $$('[data-add]', root).forEach((b) => b.addEventListener('click', () => quickAdd(b.dataset.add)));
  $$('[data-open-product]', root).forEach((c) => c.addEventListener('click', (e) => {
    if (e.target.closest('.specs-toggle')) return;
    nav('#/product/' + c.dataset.openProduct);
  }));
  $$('[data-goto]', root).forEach((b) => b.addEventListener('click', () => nav(b.dataset.goto)));
}

function bindReveal() {
  const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: .12 });
  $$('.reveal').forEach((el) => io.observe(el));
}

/* 图片：路径失效时回退到内置矢量插画（保证任何情况下都有图） */
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName === 'IMG' && img.dataset.pid) {
    const p = byId(img.dataset.pid);
    if (p) { img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(renderProductArt(p)); img.dataset.pid = ''; }
  }
}, true);

/* ============================================================
 * 视图片段
 * ============================================================ */
function priceTag(n) { return `<span class="pcard-price"><small>${D.currency.symbol}</small>${Math.round(n).toLocaleString('en-US')}</span>`; }

function cardHTML(p, idx) {
  const sb = stockBadge(p.id);
  const sp = p.specs || {};
  const specRow = (k, label, extra = '') => (sp[k] && sp[k] !== '—')
    ? `<div class="sp-row"><span class="sp-k">${label}</span><span>${esc(sp[k])}${extra}</span></div>` : '';
  const paperRow = sp.paper
    ? `<div class="sp-row"><span class="sp-k">纸张</span><span class="swatch-tex"></span><span>${esc(sp.paper)}</span></div>` : '';
  return `
  <article class="pcard reveal" data-open-product="${p.id}">
    <div class="pcard-media">
      <span class="pcard-badge badge ${p.badge === '新品' ? 'badge-cobalt' : p.badge === '限定' ? 'badge-ink' : 'badge-line'}">${esc(p.badge || '常备')}</span>
      <span class="pcard-no">NO.${String(idx + 1).padStart(3, '0')}</span>
      <img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" data-pid="${p.id}">
      <div class="pcard-specs">
        ${paperRow}
        ${specRow('rule', '页型')}
        ${specRow('size', '尺寸')}
        ${specRow('binding', '装订')}
        ${sp.paper ? '' : specRow('cover', '材质')}
      </div>
    </div>
    <div class="pcard-body">
      <span class="pcard-cat">${esc(catName(p.cat))} — ${esc(p.jp || '')}</span>
      <h3 class="pcard-name">${esc(p.name)}</h3>
      <p class="pcard-sub">${esc(p.sub || '')}</p>
      <button class="specs-toggle" type="button">规格</button>
      <div class="pcard-foot">
        ${priceTag(p.price)}
        <span class="pcard-stock ${sb.cls}">${sb.text}</span>
      </div>
    </div>
  </article>`;
}

/* ============================================================
 * 首页
 * ============================================================ */
function viewHome() {
  const cp = D.copy;
  const featured = D.products.filter((p) => p.featured).sort((a, b) => a.featured - b.featured);
  const marq = cp.marquee.map((m) => `<span>${esc(m)}</span>`).join('');
  return `
  <section class="hero">
    <div class="wrap hero-grid">
      <div>
        <span class="kicker">${esc(cp.heroKicker)}</span>
        <h1 class="hero-title">${esc(cp.heroTitleA)}<br><span class="blue">${esc(cp.heroTitleB)}</span></h1>
        <p class="hero-lead">${esc(cp.heroLead)}</p>
        <div class="hero-cta">
          <button class="btn btn-primary" data-goto="#/shop">浏览全部商品</button>
          <button class="btn" data-goto="#/custom">定制一本笔记本</button>
        </div>
        <div class="hero-scroll">SCROLL — 整理一张你的桌面</div>
      </div>
      <aside class="hero-side cm"><span class="cm2"></span>
        <div class="hs-row"><span class="hs-k">Paper</span><span class="hs-v">川内川纸 · 92g 三层施胶</span></div>
        <div class="hs-row"><span class="hs-k">Binding</span><span class="hs-v">裸装锁线 · 180° 平摊</span></div>
        <div class="hs-row"><span class="hs-k">System</span><span class="hs-v">六孔互换 · 可增删</span></div>
        <div class="hs-row"><span class="hs-k">Ink</span><span class="hs-v">钴蓝 #07 · 全线同源</span></div>
        <div class="hs-row"><span class="hs-k">Colors</span><span class="hs-v">米白 / 石墨黑 / 钴蓝</span></div>
      </aside>
    </div>
  </section>

  <div class="marquee" aria-hidden="true"><div class="marquee-track">${marq}${marq}</div></div>

  <section class="desk" id="desk">
    <div class="wrap">
      <div class="desk-head">
        <div>
          <span class="kicker">DESK PLAYGROUND</span>
          <h2 class="desk-title">${esc(cp.deskTitle)}</h2>
        </div>
        <p class="desk-lead">${esc(cp.deskLead)}</p>
        <div class="desk-actions">
          <button class="chip" id="desk-clear">清空桌面</button>
        </div>
      </div>
      <div class="desk-tray" id="desk-tray"></div>
      <div class="desk-mat cm" id="desk-mat"><span class="cm2"></span>
        <span class="mat-label">DESK MAT — GRID 5mm</span>
        <span class="mat-edge"></span>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      <div class="section-head reveal">
        <div>
          <span class="kicker">EDITOR'S PICK</span>
          <h2 class="sec-title">${esc(cp.editorTitle)}</h2>
        </div>
        <span class="sec-note">${esc(cp.editorNote)}</span>
      </div>
      <div class="grid-cards g3">${featured.map((p, i) => cardHTML(p, i)).join('')}</div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap">
      <div class="section-head reveal">
        <div>
          <span class="kicker">CATALOG</span>
          <h2 class="sec-title">分类货架</h2>
        </div>
        <button class="btn btn-sm" data-goto="#/shop">查看全部 ${D.products.length} 件 →</button>
      </div>
      <div class="shelf-tabs" id="shelf-tabs">
        ${D.categories.map((c, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-cat="${c.id}">${esc(c.name)} · ${esc(c.jp)}</button>`).join('')}
      </div>
      <div class="grid-cards g3" id="shelf-grid"></div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap">
      <div class="custom-teaser reveal">
        <div class="ct-copy">
          <span class="kicker">${esc(cp.customTeaser.kicker)}</span>
          <h2 class="ct-title">${esc(cp.customTeaser.title)}</h2>
          <p class="ct-lead">${esc(cp.customTeaser.lead)}</p>
          <div style="margin-top:26px"><button class="btn btn-primary" data-goto="#/custom">${esc(cp.customTeaser.cta)} →</button></div>
        </div>
        <div class="ct-art"><div id="teaser-art"></div></div>
      </div>
    </div>
  </section>`;
}

function initTeaser() {
  const el = $('#teaser-art');
  if (!el) return;
  const cfgs = [
    { size: 'a5', paper: 'grid', cover: { material: 'card', hex: '#26241F' }, binding: 'thread', accessories: { band: 1 }, engrave: '' },
    { size: 'b6', paper: 'week', cover: { material: 'card', hex: '#0B49C0' }, binding: 'tape', accessories: { ribbon: 1 }, engrave: '' },
    { size: 'a6', paper: 'dot', cover: { material: 'leather', hex: '#7A5232' }, binding: 'thread', accessories: { band: 1, penloop: 1 }, engrave: '' },
    { size: 'a5', paper: 'blank', cover: { material: 'naked', hex: '#EFE9DA' }, binding: 'thread', accessories: {}, engrave: '' },
  ];
  let i = 0;
  const tick = () => { el.innerHTML = renderCustomArt('tz' + i, cfgs[i % cfgs.length]); el.style.opacity = 1; i++; };
  tick();
  const timer = setInterval(tick, 2600);
  cleanups.push(() => clearInterval(timer));
}

/* ---------- 分类货架 ---------- */
function initShelf() {
  const grid = $('#shelf-grid');
  const tabs = $('#shelf-tabs');
  if (!grid || !tabs) return;
  const show = (catId) => {
    const list = D.products.filter((p) => p.cat === catId);
    grid.innerHTML = list.map((p, i) => cardHTML(p, D.products.indexOf(p))).join('') || '<div class="empty-note">该分类暂无商品</div>';
    bindCommon(grid); bindReveal(); bindSpecsToggle(grid);
    $$('.reveal', grid).forEach((el) => el.classList.add('in'));
  };
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    $$('.chip', tabs).forEach((c) => c.classList.remove('on'));
    b.classList.add('on');
    show(b.dataset.cat);
  });
  show(D.categories[0].id);
}

/* ---------- 悬停规格（移动端点按展开） ---------- */
function bindSpecsToggle(root) {
  $$('.specs-toggle', root).forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    b.closest('.pcard').classList.toggle('specs-open');
  }));
}
bindSpecsToggle(document);

/* ============================================================
 * 桌面拖拽工作台
 * ============================================================ */
function deskPool() {
  const ids = ['nt-tsukuba-a5', 'nt-kamakura-a5', 'bd-system-a5', 'pn-ps14-graphite', 'st-index-cobalt', 'st-washi-grid', 'dk-pen-tray', 'dk-file-box'];
  return ids.map(byId).filter(Boolean);
}

function initDesk() {
  const mat = $('#desk-mat');
  const tray = $('#desk-tray');
  if (!mat || !tray) return;
  const items = []; // {pid, x, y, el}

  tray.innerHTML = deskPool().map((p) => `
    <button class="desk-chip" data-throw="${p.id}" type="button">
      <img src="${esc(p.img)}" alt="" data-pid="${p.id}">
      <span>${esc(p.name)}</span><span class="dc-price">${fmt(p.price)}</span>
    </button>`).join('');

  const layout = () => {
    const W = mat.clientWidth, H = mat.clientHeight;
    return { W, H };
  };

  function place(p, x, y, rot = 0) {
    const iw = 148, ih = 128;
    x = clamp(x, 10, Math.max(10, mat.clientWidth - iw - 10));
    y = clamp(y, 10, Math.max(10, mat.clientHeight - ih - 10));
    const el = document.createElement('div');
    el.className = 'desk-item';
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.transform = `rotate(${rot}deg)`;
    el.innerHTML = `<img src="${esc(p.img)}" alt="${esc(p.name)}" data-pid="${p.id}">
      <span class="di-tag"><b>${fmt(p.price)}</b>${esc(p.name)}</span>`;
    mat.appendChild(el);
    const it = { pid: p.id, x, y, el, rot };
    items.push(it);
    drag(el, it);
    return it;
  }

  function throwIn(pid) {
    const p = byId(pid); if (!p) return;
    const { W, H } = layout();
    const x = clamp(Math.random() * (W - 180) + 30, 20, Math.max(20, W - 190));
    const y = clamp(Math.random() * (H - 220) + 30, 16, Math.max(16, H - 210));
    place(p, x, y, (Math.random() * 6 - 3).toFixed(1) * 1);
  }

  tray.addEventListener('click', (e) => {
    const b = e.target.closest('[data-throw]');
    if (b) throwIn(b.dataset.throw);
  });
  $('#desk-clear')?.addEventListener('click', () => {
    items.forEach((i) => i.el.remove()); items.length = 0; regroup();
    toast('桌面已清空 — 从上方托盘再取几件吧');
  });

  function drag(el, it) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const mr = mat.getBoundingClientRect();
      const ir = el.getBoundingClientRect();
      const offX = e.clientX - ir.left, offY = e.clientY - ir.top;
      el.classList.add('dragging');
      const move = (ev) => {
        const x = clamp(ev.clientX - mr.left - offX, 4, mr.width - ir.width - 4);
        const y = clamp(ev.clientY - mr.top - offY, 4, mr.height - ir.height - 4);
        it.x = x; it.y = y;
        el.style.left = x + 'px'; el.style.top = y + 'px';
      };
      const up = () => {
        el.classList.remove('dragging');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        regroup();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }

  /* 分组：包围盒相交（含 26px 缓冲）的物品归为一组 */
  function computeGroups() {
    const pad = 26;
    const rects = items.map((it) => {
      const w = it.el.offsetWidth || 148, h = it.el.offsetHeight || 120;
      return { it, l: it.x - pad, t: it.y - pad, r: it.x + w + pad, b: it.y + h + pad };
    });
    const parent = items.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    rects.forEach((a, i) => rects.forEach((b, j) => {
      if (i < j && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) parent[find(i)] = find(j);
    }));
    const map = new Map();
    items.forEach((it, i) => {
      const root = find(i);
      if (!map.has(root)) map.set(root, []);
      map.get(root).push(it);
    });
    return [...map.values()].filter((g) => g.length >= 2);
  }

  function regroup() {
    $$('.desk-group', mat).forEach((g) => g.remove());
    if (items.length < 2) return;
    computeGroups().forEach((group, gi) => {
      const l = Math.min(...group.map((g) => g.x)) - 10;
      const t = Math.min(...group.map((g) => g.y)) - 8;
      const r = Math.max(...group.map((g) => g.x + (g.el.offsetWidth || 148))) + 10;
      const b = Math.max(...group.map((g) => g.y + (g.el.offsetHeight || 120))) + 12;
      const total = group.reduce((s, g) => s + byId(g.pid).price, 0);
      const names = group.map((g) => byId(g.pid).name).join(' + ');
      const box = document.createElement('div');
      box.className = 'desk-group';
      box.style.left = l + 'px'; box.style.top = t + 'px';
      box.style.width = (r - l) + 'px'; box.style.height = (b - t) + 'px';
      const barTop = t >= 44 ? -34 : 6;
      box.innerHTML = `
        <div class="dg-bar" style="top:${barTop}px">
          <span class="dg-label">组合 ${String.fromCharCode(65 + gi % 26)} — ${fmt(total)}</span>
          <button class="dg-add" type="button">整组加入购物车</button>
        </div>`;
      box.querySelector('.dg-add').addEventListener('click', (e) => {
        e.stopPropagation();
        const parts = group.map((g) => byId(g.pid));
        const key = 'set|' + parts.map((p) => p.id).sort().join('+');
        addToCart({
          key, pid: null, name: '桌面组合 · ' + parts.length + ' 件',
          img: parts[0].img, unit: total, qty: 1,
          variant: parts.map((p) => p.name), setParts: parts.map((p) => p.id),
        });
      });
      mat.appendChild(box);
    });
  }

  /* 初始摆放：两件自动成组，其余散放 */
  const seed = () => {
    const { W, H } = layout();
    const a = deskPool()[0], b = deskPool()[3], c = deskPool()[5], d = deskPool()[6], e = deskPool()[4];
    const ax = Math.max(30, W * 0.3), ay = Math.min(90, H * 0.16);
    place(a, ax, ay, -1.5);
    place(b, ax + 170, ay + 26, 2);
    place(c, Math.max(30, W * 0.68), Math.min(250, H * 0.42), -2);
    place(d, Math.max(30, W * 0.08), Math.min(260, H * 0.44), 1.5);
    place(e, Math.max(30, W * 0.52), Math.min(60, H * 0.1), -1);
    regroup();
  };
  requestAnimationFrame(seed);
  cleanups.push(() => { items.forEach((i) => i.el.remove()); });
}

/* ============================================================
 * 商品列表
 * ============================================================ */
function viewShop() {
  return `
  <section class="page-head">
    <div class="wrap">
      <span class="kicker">CATALOG — ALL ITEMS</span>
      <h1 class="ph-title disp">全部商品</h1>
      <p class="ph-lead">从笔记本到桌面收纳，每一件都基于同一张网格原稿设计。按分类筛选，或按价格与上新款序排列。</p>
    </div>
  </section>
  <div class="wrap">
    <div class="filter-bar" id="filter-bar">
      <div class="filter-chips">
        <button class="chip ${route.params.cat ? '' : 'on'}" data-cat="">全部</button>
        ${D.categories.map((c) => `<button class="chip ${route.params.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${esc(c.name)} · ${esc(c.jp)}</button>`).join('')}
      </div>
      <div class="sort-wrap">
        SORT
        <select id="sort-sel">
          <option value="rec">推荐排序</option>
          <option value="new">新品优先</option>
          <option value="asc">价格 从低到高</option>
          <option value="desc">价格 从高到低</option>
        </select>
      </div>
    </div>
    <div class="grid-cards" id="shop-grid"></div>
    <div class="empty-note" id="shop-empty" style="display:none">该条件下暂无商品 — 试试其他筛选</div>
  </div>
  <div style="height:60px"></div>`;
}

function initShopFilters() {
  const grid = $('#shop-grid');
  const empty = $('#shop-empty');
  const state = { cat: route.params.cat || '', sort: route.params.sort || 'rec' };
  $('#sort-sel').value = state.sort;

  const apply = () => {
    let list = D.products.filter((p) => !state.cat || p.cat === state.cat);
    if (state.sort === 'asc') list = [...list].sort((a, b) => a.price - b.price);
    if (state.sort === 'desc') list = [...list].sort((a, b) => b.price - a.price);
    if (state.sort === 'new') list = [...list].sort((a, b) => (b.badge === '新品') - (a.badge === '新品') || a.price - b.price);
    if (state.sort === 'rec') list = [...list].sort((a, b) => (b.featured || 0) - (a.featured || 0));
    grid.innerHTML = list.map((p) => cardHTML(p, D.products.indexOf(p))).join('');
    empty.style.display = list.length ? 'none' : 'block';
    bindCommon(grid); bindSpecsToggle(grid);
    $$('.reveal', grid).forEach((el) => el.classList.add('in'));
  };

  $('#filter-bar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.cat = b.dataset.cat;
    $$('.chip', $('#filter-bar')).forEach((c) => c.classList.remove('on'));
    b.classList.add('on');
    apply();
  });
  $('#sort-sel').addEventListener('change', (e) => { state.sort = e.target.value; apply(); });
  apply();
}

/* ============================================================
 * 商品详情
 * ============================================================ */
function viewProduct() {
  const p = byId(route.params.id);
  if (!p) return `<div class="wrap"><div class="empty-note" style="padding:120px 0">商品不存在 — <a href="#/shop" style="text-decoration:underline">返回全部商品</a></div></div>`;
  const sb = stockBadge(p.id);
  const sp = p.specs || {};
  return `
  <div class="wrap">
    <button class="pd-back" data-goto="#/shop">← BACK TO CATALOG</button>
    <div class="pd">
      <div class="pd-media cm"><span class="cm2"></span>
        <div class="pd-art" id="pd-art"></div>
        <div class="pd-caption"><span>${esc(p.id.toUpperCase())}</span><span>${esc(catName(p.cat))} · ${esc(p.jp || '')}</span></div>
      </div>
      <div>
        <div class="pd-catline">
          <span class="badge badge-cobalt">${esc(p.badge || '常备')}</span>
          <span class="en-tag">${esc(catName(p.cat))} / ${esc(p.jp || '')}</span>
        </div>
        <h1 class="pd-title disp">${esc(p.name)}</h1>
        <p class="pd-sub">${esc(p.sub || '')}</p>
        <div class="pd-priceline">
          <span class="pd-price"><small>${D.currency.symbol}</small><span id="pd-price">${Math.round(p.price).toLocaleString('en-US')}</span></span>
          <span class="pd-taxnote">含税 · JPY</span>
        </div>
        <p class="pd-story">${esc(p.story || '')}</p>

        ${p.colors?.length ? `
        <div class="opt-block">
          <div class="opt-label"><b>封面 / 主体颜色</b><span class="ov" id="ov-color"></span></div>
          <div class="swatch-row" id="opt-color">
            ${p.colors.map((c, i) => `<button class="swatch ${i === 0 ? 'on' : ''}" data-i="${i}" title="${esc(c.name)}" style="padding:2px"><i style="background:${c.hex}"></i></button>`).join('')}
          </div>
        </div>` : ''}

        ${p.papers?.length ? `
        <div class="opt-block">
          <div class="opt-label"><b>纸张类型</b><span class="ov" id="ov-paper"></span></div>
          <div class="opt-row" id="opt-paper">
            ${p.papers.map((c, i) => `<button class="opt-btn ${i === 0 ? 'on' : ''}" data-i="${i}">${esc(c.name)}${c.add ? `<span class="add">${c.add > 0 ? '+' : ''}${fmt(c.add)}</span>` : ''}</button>`).join('')}
          </div>
        </div>` : ''}

        ${p.formats?.length ? `
        <div class="opt-block">
          <div class="opt-label"><b>内页格式 / 开本</b><span class="ov" id="ov-format"></span></div>
          <div class="opt-row" id="opt-format">
            ${p.formats.map((c, i) => `<button class="opt-btn ${i === 0 ? 'on' : ''}" data-i="${i}">${esc(c.name)}${c.add ? `<span class="add">${c.add > 0 ? '+' : ''}${fmt(c.add)}</span>` : ''}</button>`).join('')}
          </div>
        </div>` : ''}

        ${p.engraving ? `
        <div class="opt-block">
          <div class="opt-label"><b>刻字（压凹 / 箔押）</b><span class="ov">+${fmt(p.engraving.price)}</span></div>
          <div class="engrave-box">
            <input class="engrave-input" id="engrave-input" maxlength="${p.engraving.max}" placeholder="留空则不刻字 · 例：TOKYO NOTES">
            <span class="engrave-count" id="engrave-count">0 / ${p.engraving.max}</span>
          </div>
        </div>` : ''}

        <div class="buy-row">
          <div class="qty">
            <button id="q-minus" aria-label="减少数量">−</button>
            <output id="q-out">1</output>
            <button id="q-plus" aria-label="增加数量">＋</button>
          </div>
          <button class="btn btn-primary" id="pd-add" ${sb.cls === 'out' ? 'disabled' : ''}>${sb.cls === 'out' ? '暂时售罄 · 补货中' : '加入购物车'}</button>
        </div>
        <div class="stock-note"><span class="stock-dot ${sb.cls}"></span>${esc(sb.label)} — 出货含钴蓝封缄</div>

        <table class="spec-table">
          <caption>SPEC SHEET — 规格表</caption>
          <tbody>
            ${[['size', '尺寸'], ['paper', '纸张'], ['rule', '页型'], ['pages', '页数'], ['binding', '装订'], ['cover', '封面 / 材质']]
              .filter(([k]) => sp[k] && sp[k] !== '—')
              .map(([k, label]) => `<tr><th>${label}</th><td>${esc(sp[k])}</td></tr>`).join('')}
          </tbody>
        </table>

        ${p.details?.length ? `
        <ul class="pd-details">
          ${p.details.map((d) => `<li>${esc(d)}</li>`).join('')}
        </ul>` : ''}
      </div>
    </div>
  </div>`;
}

function initProductPage() {
  const p = byId(route.params.id);
  if (!p) return;
  const sel = {
    color: 0, paper: 0, format: 0,
    engrave: '',
    qty: 1,
  };

  const artOverrides = () => {
    const a = p.art || {};
    const hex = p.colors?.[sel.color]?.hex;
    const o = {};
    if (hex) { if (a.type === 'pen') o.body = hex; else o.cover = hex; }
    if (sel.engrave) o.engrave = sel.engrave;
    return o;
  };
  const drawArt = () => { $('#pd-art').innerHTML = renderProductArt(p, artOverrides()); };

  const unit = () => {
    let u = p.price;
    u += p.papers?.[sel.paper]?.add || 0;
    u += p.formats?.[sel.format]?.add || 0;
    if (sel.engrave) u += p.engraving?.price || 0;
    return u;
  };
  const refreshPrice = () => { $('#pd-price').textContent = Math.round(unit()).toLocaleString('en-US'); };

  const colorName = () => p.colors?.[sel.color]?.name;
  const refreshOv = () => {
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('#ov-color', colorName() || '');
    set('#ov-paper', p.papers?.[sel.paper]?.name || '');
    set('#ov-format', p.formats?.[sel.format]?.name || '');
  };

  const wire = (wrapId, key, onChange) => {
    const box = $(wrapId);
    if (!box) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      sel[key] = +b.dataset.i;
      $$('[data-i]', box).forEach((x) => x.classList.toggle('on', x === b));
      onChange?.();
    });
  };

  drawArt(); refreshPrice(); refreshOv();
  wire('#opt-color', 'color', () => { drawArt(); refreshOv(); });
  wire('#opt-paper', 'paper', () => { refreshPrice(); refreshOv(); });
  wire('#opt-format', 'format', () => { refreshPrice(); refreshOv(); });

  const inp = $('#engrave-input');
  inp?.addEventListener('input', () => {
    sel.engrave = inp.value.trim();
    $('#engrave-count').textContent = `${inp.value.length} / ${p.engraving.max}`;
    drawArt(); refreshPrice();
  });

  const qOut = $('#q-out');
  const maxQ = Math.max(1, stockOf(p.id));
  $('#q-minus').addEventListener('click', () => { sel.qty = clamp(sel.qty - 1, 1, maxQ); qOut.textContent = sel.qty; });
  $('#q-plus').addEventListener('click', () => { sel.qty = clamp(sel.qty + 1, 1, maxQ); qOut.textContent = sel.qty; });

  $('#pd-add')?.addEventListener('click', () => {
    const variant = [];
    if (colorName()) variant.push('颜色 · ' + colorName());
    if (p.papers?.[sel.paper]) variant.push(p.papers[sel.paper].name);
    if (p.formats?.[sel.format]) variant.push(p.formats[sel.format].name);
    if (sel.engrave) variant.push('刻字 · ' + sel.engrave);
    const key = [p.id, sel.color, sel.paper, sel.format, sel.engrave].join('|');
    addToCart({
      key, pid: p.id, name: p.name, img: p.img, unit: unit(), qty: sel.qty,
      variant, engrave: sel.engrave || '',
    });
  });
}

/* ============================================================
 * 定制工坊
 * ============================================================ */
function viewCustom() {
  const c = D.customizer;
  return `
  <section class="page-head">
    <div class="wrap">
      <span class="kicker">BESPOKE — ${esc(c.jp)}</span>
      <h1 class="ph-title disp">${esc(c.title)}</h1>
      <p class="ph-lead">${esc(c.lead)}</p>
    </div>
  </section>
  <div class="wrap custom-layout">
    <div>
      <div class="cstep reveal in">
        <div class="cstep-head"><span class="cstep-no">01</span><b>开本</b><span class="cs-en">SIZE</span></div>
        <div class="cstep-body">
          <div class="opt-row" id="cz-size">
            ${c.sizes.map((o, i) => `<button class="opt-btn ${i === 0 ? 'on' : ''}" data-i="${i}">${esc(o.name)}<span class="add">${esc(o.dim)}</span></button>`).join('')}
          </div>
        </div>
      </div>
      <div class="cstep reveal in">
        <div class="cstep-head"><span class="cstep-no">02</span><b>内页</b><span class="cs-en">PAPER / PAGES</span></div>
        <div class="cstep-body">
          <div class="opt-row" id="cz-paper" style="margin-bottom:12px">
            ${c.papers.map((o, i) => `<button class="opt-btn ${i === 0 ? 'on' : ''}" data-i="${i}">${esc(o.name)}${o.add ? `<span class="add">+${fmt(o.add)}</span>` : ''}</button>`).join('')}
          </div>
          <div class="opt-row" id="cz-pages">
            ${c.pageCounts.map((o, i) => `<button class="opt-btn ${i === 1 ? 'on' : ''}" data-i="${i}">${esc(o.name)}${o.add ? `<span class="add">+${fmt(o.add)}</span>` : ''}</button>`).join('')}
          </div>
          <p class="cstep-note">全部采用川内川纸 · 钢笔不洇不透</p>
        </div>
      </div>
      <div class="cstep reveal in">
        <div class="cstep-head"><span class="cstep-no">03</span><b>封面</b><span class="cs-en">COVER</span></div>
        <div class="cstep-body">
          <div class="opt-row" id="cz-cover" style="margin-bottom:12px">
            ${c.covers.map((o, i) => `<button class="opt-btn ${i === 1 ? 'on' : ''}" data-i="${i}">${esc(o.name)}${o.add ? `<span class="add">+${fmt(o.add)}</span>` : ''}</button>`).join('')}
          </div>
          <div class="swatch-row" id="cz-color"></div>
          <p class="cstep-note" id="cz-cover-note"></p>
        </div>
      </div>
      <div class="cstep reveal in">
        <div class="cstep-head"><span class="cstep-no">04</span><b>装订</b><span class="cs-en">BINDING</span></div>
        <div class="cstep-body">
          <div class="opt-row" id="cz-binding">
            ${c.bindings.map((o, i) => `<button class="opt-btn ${i === 0 ? 'on' : ''}" data-i="${i}">${esc(o.name)}${o.add ? `<span class="add">+${fmt(o.add)}</span>` : ''}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="cstep reveal in">
        <div class="cstep-head"><span class="cstep-no">05</span><b>配件</b><span class="cs-en">ACCESSORIES</span></div>
        <div class="cstep-body">
          <div class="opt-row" id="cz-acc">
            ${c.accessories.map((o) => `<button class="opt-btn" data-id="${o.id}">${esc(o.name)}<span class="add">+${fmt(o.add)}</span></button>`).join('')}
          </div>
          <p class="cstep-note" id="cz-acc-note"></p>
        </div>
      </div>
      <div class="cstep reveal in">
        <div class="cstep-head"><span class="cstep-no">06</span><b>刻字</b><span class="cs-en">ENGRAVING</span></div>
        <div class="cstep-body">
          <div class="engrave-box">
            <input class="engrave-input" id="cz-engrave" maxlength="${c.engraving.max}" placeholder="封面压凹文字 · 例：MY SYSTEM">
            <span class="engrave-count" id="cz-engrave-count">0 / ${c.engraving.max}</span>
          </div>
          <p class="cstep-note">活版压凹工艺 · +${fmt(c.engraving.price)}</p>
        </div>
      </div>
    </div>

    <aside class="custom-panel cm"><span class="cm2"></span>
      <div class="cp-preview">
        <span class="cp-live">LIVE PREVIEW</span>
        <div id="cz-preview"></div>
      </div>
      <h3 class="cp-name" id="cz-name"></h3>
      <div class="cp-config" id="cz-config"></div>
      <div class="price-lines" id="cz-lines"></div>
      <div class="cp-actions">
        <button class="btn btn-primary btn-full" id="cz-add">加入购物车 →</button>
        <button class="btn btn-full" id="cz-reset" style="border-color:rgba(244,239,227,.5);color:var(--paper);background:transparent">重置为推荐配置</button>
        <span class="cp-freeship">东京工房出货 · 7 个工作日内装订完成</span>
      </div>
    </aside>
  </div>`;
}

function initCustomizer() {
  const c = D.customizer;
  const sel = {
    size: 0, paper: 0, pages: 1, cover: 1, color: 0,
    binding: 0, acc: new Set(['band']), engrave: '',
  };

  const coverColors = () => c.covers[sel.cover].colors;
  const clampColor = () => { sel.color = clamp(sel.color, 0, Math.max(0, coverColors().length - 1)); };

  const drawColors = () => {
    const box = $('#cz-color');
    const colors = coverColors();
    box.innerHTML = colors.length
      ? colors.map((col, i) => `<button class="swatch ${i === sel.color ? 'on' : ''}" data-i="${i}" title="${esc(col.name)}"><i style="background:${col.hex}"></i></button>`).join('')
      : '<span class="cstep-note" style="margin:0">裸装无封面 — 无需选择颜色</span>';
    $('#cz-cover-note').textContent = colors[sel.color] ? `${c.covers[sel.cover].name} · ${colors[sel.color].name}` : c.covers[sel.cover].note;
  };

  const drawAcc = () => {
    const noCover = c.covers[sel.cover].id === 'naked';
    $$('#cz-acc .opt-btn').forEach((b) => {
      const id = b.dataset.id;
      const needCover = id === 'band' || id === 'penloop';
      b.disabled = noCover && needCover;
      b.classList.toggle('on', sel.acc.has(id));
      if (b.disabled) b.classList.remove('on');
    });
    $('#cz-acc-note').textContent = noCover ? '裸装无封面时，绑带与笔插带无法安装' : '可多选 · 随组合计入价格';
  };

  const cfg = () => ({
    size: c.sizes[sel.size].id,
    paper: c.papers[sel.paper].id,
    binding: c.bindings[sel.binding].id,
    cover: { material: c.covers[sel.cover].id, hex: coverColors()[sel.color]?.hex },
    accessories: { band: sel.acc.has('band'), penloop: sel.acc.has('penloop'), ribbon: sel.acc.has('ribbon'), tabs: sel.acc.has('tabs') },
    engrave: sel.engrave,
  });

  const unit = () => {
    let u = c.sizes[sel.size].base + c.papers[sel.paper].add + c.pageCounts[sel.pages].add
      + c.covers[sel.cover].add + c.bindings[sel.binding].add;
    for (const id of sel.acc) u += c.accessories.find((a) => a.id === id).add;
    if (sel.engrave) u += c.engraving.price;
    return u;
  };

  const refresh = () => {
    clampColor();
    $('#cz-preview').innerHTML = renderCustomArt('cz', cfg());
    const coverLabel = c.covers[sel.cover].id === 'naked'
      ? c.covers[sel.cover].name
      : `${c.covers[sel.cover].name} · ${coverColors()[sel.color]?.name || ''}`;
    $('#cz-name').textContent = `定制笔记本 — ${c.sizes[sel.size].name} ${c.papers[sel.paper].name}`;
    $('#cz-config').innerHTML =
      `${c.sizes[sel.size].dim} / ${c.pageCounts[sel.pages].name}<br>${coverLabel} / ${c.bindings[sel.binding].name}${sel.engrave ? '<br>刻字 · ' + esc(sel.engrave) : ''}`;
    const lines = [
      ['开本 ' + c.sizes[sel.size].name, c.sizes[sel.size].base],
      [c.papers[sel.paper].name, c.papers[sel.paper].add],
      ['页数 ' + c.pageCounts[sel.pages].name, c.pageCounts[sel.pages].add],
      [coverLabel, c.covers[sel.cover].add],
      [c.bindings[sel.binding].name, c.bindings[sel.binding].add],
    ];
    for (const id of sel.acc) {
      const a = c.accessories.find((x) => x.id === id);
      lines.push(['配件 · ' + a.name, a.add]);
    }
    if (sel.engrave) lines.push(['刻字 · ' + sel.engrave, c.engraving.price]);
    $('#cz-lines').innerHTML = lines.map(([k, v]) =>
      `<div class="pl"><span>${esc(k)}</span><span class="pv">${v ? (v > 0 ? '+' + fmt(v) : fmt(v)) : '含'}</span></div>`).join('')
      + `<div class="pl total"><span>合计</span><span class="pv">${fmt(unit())}</span></div>`;
    drawColors(); drawAcc();
  };

  const wireOpts = (id, key) => {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b || b.disabled) return;
      sel[key] = +b.dataset.i;
      $$('[data-i]', $(id)).forEach((x) => x.classList.toggle('on', x === b));
      refresh();
    });
  };
  wireOpts('#cz-size', 'size');
  wireOpts('#cz-paper', 'paper');
  wireOpts('#cz-pages', 'pages');
  wireOpts('#cz-cover', 'cover');
  wireOpts('#cz-binding', 'binding');

  $('#cz-color').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    sel.color = +b.dataset.i;
    refresh();
  });

  $('#cz-acc').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b || b.disabled) return;
    const id = b.dataset.id;
    sel.acc.has(id) ? sel.acc.delete(id) : sel.acc.add(id);
    refresh();
  });

  const inp = $('#cz-engrave');
  inp.addEventListener('input', () => {
    sel.engrave = inp.value.trim();
    $('#cz-engrave-count').textContent = `${inp.value.length} / ${c.engraving.max}`;
    refresh();
  });

  $('#cz-reset').addEventListener('click', () => {
    Object.assign(sel, { size: 0, paper: 0, pages: 1, cover: 1, color: 0, binding: 0, acc: new Set(['band']), engrave: '' });
    inp.value = '';
    $('#cz-engrave-count').textContent = `0 / ${c.engraving.max}`;
    ['#cz-size', '#cz-paper', '#cz-pages', '#cz-cover', '#cz-binding'].forEach((id, i) => {
      const def = [0, 0, 1, 1, 0][i];
      $$('[data-i]', $(id)).forEach((x, j) => x.classList.toggle('on', j === def));
    });
    refresh();
    toast('已重置为推荐配置');
  });

  $('#cz-add').addEventListener('click', () => {
    const svg = $('#cz-preview svg')?.outerHTML || '';
    const name = `定制笔记本 · ${c.sizes[sel.size].name} ${c.papers[sel.paper].name}`;
    const variant = [
      c.sizes[sel.size].dim, c.papers[sel.paper].name + ' · ' + c.pageCounts[sel.pages].name,
      (coverColors()[sel.color] ? coverColors()[sel.color].name + ' ' : '') + c.covers[sel.cover].name,
      c.bindings[sel.binding].name,
      ...[...sel.acc].map((id) => c.accessories.find((a) => a.id === id).name),
      sel.engrave ? '刻字 · ' + sel.engrave : null,
    ].filter(Boolean);
    addToCart({
      key: 'custom|' + variant.join('|'), pid: null, name,
      img: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
      unit: unit(), qty: 1, variant, custom: true,
    });
  });

  refresh();
}

/* ============================================================
 * 购物车抽屉
 * ============================================================ */
function cartLineHTML(i) {
  const variant = i.variant?.length ? `<div class="cl-variant">${i.variant.map(esc).join(' / ')}</div>` : '';
  return `
  <div class="cart-line" data-key="${esc(i.key)}">
    <div class="cl-thumb"><img src="${esc(i.img)}" alt=""></div>
    <div>
      <div class="cl-name">${esc(i.name)}</div>
      ${variant}
      <div class="cl-qtyrow">
        <div class="cl-qty">
          <button data-dec aria-label="减少">−</button><output>${i.qty}</output><button data-inc aria-label="增加">＋</button>
        </div>
        <button class="cl-remove" data-remove>移除</button>
      </div>
    </div>
    <div class="cl-price">${fmt(i.unit * i.qty)}<small>${fmt(i.unit)} × ${i.qty}</small></div>
  </div>`;
}

function renderCartDrawer() {
  const drawer = $('#cart-drawer');
  if (!drawer) return;
  const items = $('#cart-items');
  if (!cart.length) {
    items.innerHTML = `<div class="cart-empty"><div class="ce-mark">∅</div>购物车还是空的<br><span class="en-tag">CART — EMPTY</span><div style="margin-top:18px"><button class="btn btn-sm" data-goto="#/shop">去逛逛 →</button></div></div>`;
  } else {
    items.innerHTML = cart.map(cartLineHTML).join('');
  }
  $('#cart-count-2').textContent = cartCount();
  $('#cart-sub').textContent = fmt(cartSubtotal());
  $('#cart-sub2').textContent = fmt(cartSubtotal());
  bindCommon(items);
  $$('[data-inc]', items).forEach((b) => b.addEventListener('click', () => {
    const line = cart.find((x) => x.key === b.closest('[data-key]').dataset.key);
    const cap = line.pid ? stockOf(line.pid) + line.qty : 99;
    if (line.qty + 1 > cap) { toast('已达库存上限'); return; }
    line.qty++; cartSave(); renderCartDrawer(); renderCartCount();
  }));
  $$('[data-dec]', items).forEach((b) => b.addEventListener('click', () => {
    const key = b.closest('[data-key]').dataset.key;
    const line = cart.find((x) => x.key === key);
    if (line.qty <= 1) removeFromCart(key);
    else { line.qty--; cartSave(); renderCartDrawer(); renderCartCount(); }
  }));
  $$('[data-remove]', items).forEach((b) => b.addEventListener('click', () => removeFromCart(b.closest('[data-key]').dataset.key)));
}

function openCart() {
  renderCartDrawer();
  $('#cart-drawer').classList.add('show');
  $('#scrim').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  $('#cart-drawer')?.classList.remove('show');
  $('#scrim')?.classList.remove('show');
  document.body.style.overflow = '';
}

function renderCartCount() {
  $$('.cart-count').forEach((el) => { el.textContent = cartCount(); });
}

/* ============================================================
 * 结算（模拟）
 * ============================================================ */
function viewCheckout() {
  if (!cart.length) {
    setTimeout(() => { toast('购物车为空 — 先去挑几件文具吧'); nav('#/shop'); }, 60);
    return `<div class="wrap"><div class="empty-note" style="padding:120px 0">正在前往商品列表…</div></div>`;
  }
  const ship = D.shipping.find((s) => s.id === 'standard');
  return `
  <section class="page-head">
    <div class="wrap">
      <span class="kicker">CHECKOUT — DEMO</span>
      <h1 class="ph-title disp">模拟结算</h1>
      <p class="ph-lead">这是一个纯前端演示流程：不会向任何服务器发送数据，也不会产生真实扣款。</p>
    </div>
  </section>
  <div class="wrap checkout">
    <div class="co-steps">
      <div class="co-step on" data-step="1"><span class="n">1</span>收货信息</div>
      <div class="co-step" data-step="2"><span class="n">2</span>配送方式</div>
      <div class="co-step" data-step="3"><span class="n">3</span>确认支付</div>
    </div>
    <div class="co-grid">
      <div class="co-panel">
        <!-- 步骤 1 -->
        <div data-pane="1">
          <h3>收货信息</h3>
          <div class="field-row">
            <div class="field" data-f="name"><label>收件人</label><input id="f-name" placeholder="例：王纸见"><div class="ferr">请填写收件人姓名</div></div>
            <div class="field" data-f="phone"><label>手机号</label><input id="f-phone" inputmode="tel" placeholder="13 位手机号"><div class="ferr">请填写正确的手机号</div></div>
          </div>
          <div class="field-row">
            <div class="field" data-f="zip"><label>邮政编码</label><input id="f-zip" inputmode="numeric" placeholder="6 位邮编"><div class="ferr">请填写 6 位邮编</div></div>
            <div class="field" data-f="email"><label>电子邮箱（选填）</label><input id="f-email" type="email" placeholder="you@example.com"></div>
          </div>
          <div class="field" data-f="addr"><label>详细地址</label><textarea id="f-addr" rows="2" placeholder="省 / 市 / 区 + 街道门牌"></textarea><div class="ferr">请填写完整地址（至少 8 个字符）</div></div>
          <div class="field"><label>订单备注（选填）</label><input id="f-note" placeholder="例：礼盒包装，请附贺卡"></div>
          <div class="co-nav">
            <button class="btn" data-goto="#/shop">返回</button>
            <button class="btn btn-primary" id="co-next1">下一步：配送方式 →</button>
          </div>
        </div>
        <!-- 步骤 2 -->
        <div data-pane="2" style="display:none">
          <h3>配送方式</h3>
          <div id="ship-list">
            ${D.shipping.map((s, i) => `
            <label class="radio-card ${i === 0 ? 'on' : ''}" data-ship="${s.id}">
              <span class="rc-dot"></span>
              <span><b>${esc(s.name)}</b><small>${s.id === 'pickup' ? '下单后 2 天可取 · 東京都渋谷区（虚构）' : s.id === 'express' ? '当日 16:00 前下单次日送达' : '邮费已含 · 全国可达'}</small></span>
              <span class="rc-fee">${s.fee > 0 ? '+' + fmt(s.fee) : s.fee < 0 ? fmt(s.fee) : '免费'}</span>
            </label>`).join('')}
          </div>
          <div class="co-nav">
            <button class="btn" id="co-back2">← 上一步</button>
            <button class="btn btn-primary" id="co-next2">下一步：确认支付 →</button>
          </div>
        </div>
        <!-- 步骤 3 -->
        <div data-pane="3" style="display:none">
          <h3>支付方式（全部为模拟）</h3>
          <div id="pay-list">
            ${D.payments.map((m, i) => `
            <label class="radio-card ${i === 0 ? 'on' : ''}" data-pay="${m.id}">
              <span class="rc-dot"></span>
              <span><b>${esc(m.name)}</b><small>${esc(m.note || '演示选项，不会真实扣款')}</small></span>
            </label>`).join('')}
          </div>
          <div class="co-nav">
            <button class="btn" id="co-back3">← 上一步</button>
            <button class="btn btn-primary" id="co-place">模拟下单 · ${fmt(cartSubtotal() + ship.fee)}</button>
          </div>
        </div>
      </div>

      <aside class="co-panel cm"><span class="cm2"></span>
        <h3>订单摘要</h3>
        <div id="co-summary">
          ${cart.map((i) => `<div class="co-summary-line"><span>${esc(i.name)}${i.qty > 1 ? ' × ' + i.qty : ''}</span><b>${fmt(i.unit * i.qty)}</b></div>`).join('')}
          <div class="co-summary-line"><span>商品小计</span><b>${fmt(cartSubtotal())}</b></div>
          <div class="co-summary-line"><span id="co-ship-name">配送 · ${esc(ship.name)}</span><b id="co-ship-fee">${ship.fee > 0 ? '+' + fmt(ship.fee) : '免费'}</b></div>
          <div class="cf-row total"><span>应付总额</span><span id="co-total">${fmt(cartSubtotal() + ship.fee)}</span></div>
        </div>
        <p class="cf-note">DEMO CHECKOUT — NO REAL PAYMENT</p>
      </aside>
    </div>
  </div>
  <div style="height:60px"></div>`;
}

function initCheckout() {
  if (!cart.length) return;
  const state = { step: 1, ship: 'standard', pay: 'card' };
  const order = { name: '', phone: '', zip: '', addr: '', note: '', email: '' };

  const setStep = (n) => {
    state.step = n;
    $$('.co-step').forEach((s) => {
      const sn = +s.dataset.step;
      s.classList.toggle('on', sn === n);
      s.classList.toggle('done', sn < n);
    });
    $$('[data-pane]').forEach((p) => { p.style.display = +p.dataset.pane === n ? '' : 'none'; });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const shipFee = () => D.shipping.find((s) => s.id === state.ship).fee;
  const total = () => cartSubtotal() + shipFee();
  const refreshTotals = () => {
    const s = D.shipping.find((x) => x.id === state.ship);
    $('#co-ship-name').textContent = '配送 · ' + s.name;
    $('#co-ship-fee').textContent = s.fee > 0 ? '+' + fmt(s.fee) : s.fee < 0 ? fmt(s.fee) : '免费';
    $('#co-total').textContent = fmt(total());
    $('#co-place').textContent = '模拟下单 · ' + fmt(total());
  };

  const validateStep1 = () => {
    order.name = $('#f-name').value.trim();
    order.phone = $('#f-phone').value.trim();
    order.zip = $('#f-zip').value.trim();
    order.addr = $('#f-addr').value.trim();
    order.email = $('#f-email').value.trim();
    order.note = $('#f-note').value.trim();
    let ok = true;
    const mark = (f, good) => {
      $(`[data-f="${f}"]`).classList.toggle('err', !good);
      if (!good) ok = false;
    };
    mark('name', order.name.length >= 2);
    mark('phone', /^1\d{10}$/.test(order.phone) || /^\+?\d{8,14}$/.test(order.phone));
    mark('zip', /^\d{6}$/.test(order.zip) || /^\d{3}-?\d{4}$/.test(order.zip));
    mark('addr', order.addr.length >= 8);
    return ok;
  };

  $('#co-next1').addEventListener('click', () => { if (validateStep1()) setStep(2); else toast('请检查标红的字段'); });
  $('#co-back2').addEventListener('click', () => setStep(1));
  $('#co-next2').addEventListener('click', () => setStep(3));
  $('#co-back3').addEventListener('click', () => setStep(2));

  $('#ship-list').addEventListener('click', (e) => {
    const c = e.target.closest('[data-ship]');
    if (!c) return;
    state.ship = c.dataset.ship;
    $$('#ship-list .radio-card').forEach((x) => x.classList.toggle('on', x === c));
    refreshTotals();
  });
  $('#pay-list').addEventListener('click', (e) => {
    const c = e.target.closest('[data-pay]');
    if (!c) return;
    state.pay = c.dataset.pay;
    $$('#pay-list .radio-card').forEach((x) => x.classList.toggle('on', x === c));
  });

  $('#co-place').addEventListener('click', () => {
    /* 模拟下单：扣减库存、生成订单号、清空购物车 */
    const taken = {};
    cart.forEach((i) => { if (i.pid) taken[i.pid] = (taken[i.pid] || 0) + i.qty; });
    consumeStock(taken);
    const no = 'PS-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(Math.floor(1000 + Math.random() * 9000));
    const rec = {
      no, at: new Date().toLocaleString('zh-CN'), total: total(),
      ship: D.shipping.find((s) => s.id === state.ship).name,
      pay: D.payments.find((m) => m.id === state.pay).name,
      to: order.name, addr: order.addr,
      items: cart.map((i) => ({ name: i.name, qty: i.qty, unit: i.unit })),
    };
    const orders = store.get('ps-orders-v1', []);
    orders.unshift(rec);
    store.set('ps-orders-v1', orders.slice(0, 20));
    cart = []; cartSave(); renderCartCount(); renderCartDrawer();
    location.hash = '#/done?no=' + no;
  });
}

function viewDone() {
  const no = route.params.no;
  const rec = store.get('ps-orders-v1', []).find((o) => o.no === no);
  if (!rec) return `<div class="wrap"><div class="empty-note" style="padding:120px 0">未找到订单 — <a href="#/shop" style="text-decoration:underline">回到商店</a></div></div>`;
  return `
  <div class="wrap">
    <div class="order-done">
      <div class="od-mark">✓</div>
      <span class="kicker" style="justify-content:center">ORDER CONFIRMED</span>
      <h2 class="disp">下单成功，谢谢你的桌面系统。</h2>
      <div class="od-no">ORDER NO. — ${esc(rec.no)}</div>
      <div class="od-summary cm"><span class="cm2"></span>
        ${rec.items.map((i) => `<div class="co-summary-line"><span>${esc(i.name)} × ${i.qty}</span><b>${fmt(i.unit * i.qty)}</b></div>`).join('')}
        <div class="co-summary-line"><span>配送 — ${esc(rec.ship)}</span><b>${esc(rec.pay)}</b></div>
        <div class="co-summary-line"><span>收件 — ${esc(rec.to)}</span><b>${fmt(rec.total)}</b></div>
        <div class="co-summary-line"><span>${esc(rec.at)}</span><b>模拟订单</b></div>
      </div>
      <p class="od-note">这是一个纯前端演示站点：订单仅保存在你的浏览器本地，不会真的发货。<br>感谢体验 PAPER SYSTEM。</p>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:26px;flex-wrap:wrap">
        <button class="btn" data-goto="#/shop">继续选购</button>
        <button class="btn btn-primary" data-goto="#/custom">去定制一本 →</button>
      </div>
    </div>
  </div>`;
}

/* ============================================================
 * 启动
 * ============================================================ */
function buildShell() {
  $('#cart-btn').addEventListener('click', openCart);
  $('#scrim').addEventListener('click', () => { closeCart(); closeMenu(); });
  $('#cart-close').addEventListener('click', closeCart);
  $('#hamburger').addEventListener('click', () => document.body.classList.toggle('menu-open'));
  window.addEventListener('hashchange', render);
  renderCartCount();
  render();
}
function closeMenu() { document.body.classList.remove('menu-open'); }

buildShell();
