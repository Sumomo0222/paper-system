/* ============================================================
 * PAPER SYSTEM — 商品插画渲染器（纯函数，浏览器 / Node 通用）
 * 生成与品牌三色一致的矢量商品图。
 * tools/render-assets.mjs 用它批量产出 assets/img/*.svg，
 * 浏览器端用它做商品详情与定制工坊的实时预览。
 * ============================================================ */

const C = {
  cream: '#F2ECDD',
  cream2: '#E7DFC9',
  page: '#FAF6EA',
  ink: '#26241F',
  ink2: '#4A463C',
  cobalt: '#0B49C0',
  cobaltD: '#083A96',
  line: '#D9D0BA',
  metal: '#C4BDAA',
  metalHi: '#E4DECC',
  metalDk: '#9B947F',
  shadow: 'rgba(38,36,31,.18)',
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* 按十六进制返回 rgba 叠层 */
function tint(hex, alpha) {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function isDark(hex) {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}
function shade(hex, k) { // k<0 变暗, k>0 变亮
  const n = hex.replace('#', '');
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (k > 0 ? (255 - v) * k : v * k))));
  const r = ch(parseInt(n.slice(0, 2), 16)), g = ch(parseInt(n.slice(2, 4), 16)), b = ch(parseInt(n.slice(4, 6), 16));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const MONO = `'IBM Plex Mono', ui-monospace, monospace`;
const SERIF = `Georgia, 'Times New Roman', serif`;

/* 内页规则纹样（页面边缘 / 预览内页共用） */
function ruleDefs(uid, rule) {
  const p = (id, fn) => `<pattern id="${uid}-${id}" width="${fn.w}" height="${fn.h}" patternUnits="userSpaceOnUse">${fn.body}</pattern>`;
  const map = {
    grid: { w: 10, h: 10, body: `<path d="M10 0H0V10" fill="none" stroke="${C.line}" stroke-width=".7"/>` },
    dot: { w: 10, h: 10, body: `<circle cx="5" cy="5" r=".9" fill="${C.line}"/>` },
    line: { w: 10, h: 16, body: `<line x1="0" y1="15" x2="10" y2="15" stroke="${C.line}" stroke-width=".8"/>` },
    blank: { w: 10, h: 10, body: '' },
    week: { w: 24, h: 16, body: `<line x1="0" y1="15" x2="24" y2="15" stroke="${C.line}" stroke-width=".8"/><line x1="12" y1="0" x2="12" y2="15" stroke="${C.line}" stroke-width=".5"/>` },
  };
  const r = map[rule] || map.grid;
  return p('rule', r);
}

function pageRuleRect(uid, x, y, w, h, rule, opacity = 1) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${uid}-rule)" opacity="${opacity}"/>`;
}

function base(uid, rule = 'grid') {
  return `<defs>${ruleDefs(uid, rule)}</defs>`;
}

/* 阴影椭圆 */
function shadowEl(cx, cy, rx, ry = rx * 0.18) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${C.shadow}"/>`;
}

/* 裁切标记（画在插画四角，呼应编辑设计） */
function cropMarks(w = 640, h = 480, m = 26, len = 14) {
  const s = [];
  const pts = [
    [m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1],
  ];
  for (const [x, y, dx, dy] of pts) {
    s.push(`<path d="M${x} ${y + dy * len}V${y}M${x} ${y}H${x + dx * len}" stroke="${C.ink}" stroke-opacity=".28" stroke-width="1" fill="none"/>`);
  }
  return s.join('');
}

/* 裸装锁线脊（外露线迹） */
function threadSpine(x, y, h, color = C.cobalt) {
  const groups = [];
  const n = 4;
  for (let i = 0; i < n; i++) {
    const gy = y + (h / (n + 1)) * (i + 1);
    groups.push(
      `<line x1="${x}" y1="${gy - 9}" x2="${x}" y2="${gy + 9}" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<line x1="${x + 6}" y1="${gy - 6}" x2="${x + 6}" y2="${gy + 6}" stroke="${C.ink}" stroke-opacity=".35" stroke-width="1.6" stroke-linecap="round"/>`,
    );
  }
  return groups.join('');
}

/* 六孔金属环 */
function ringsSpine(x, yc, h, count = 6, r = 11) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const cy = yc - h / 2 + ((count - i - 0.5) / count) * h;
    out.push(
      `<circle cx="${x}" cy="${cy}" r="${r}" fill="none" stroke="${C.metalDk}" stroke-width="4.6"/>` +
      `<circle cx="${x}" cy="${cy}" r="${r}" fill="none" stroke="${C.metalHi}" stroke-width="2.2" stroke-dasharray="9 14" transform="rotate(-40 ${x} ${cy})"/>`,
    );
  }
  return out.join('');
}

function punchHoles(x, yc, h, count = 6, r = 4) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const cy = yc - h / 2 + ((count - i - 0.5) / count) * h;
    out.push(`<circle cx="${x}" cy="${cy}" r="${r}" fill="${C.ink}" fill-opacity=".22"/>`);
  }
  return out.join('');
}

/* 品牌小标签 */
function brandChip(x, y, dark = false) {
  return `<g font-family="${MONO}" font-size="9.5" letter-spacing="1.4">
    <rect x="${x}" y="${y}" width="86" height="16" fill="${C.cobalt}"/>
    <text x="${x + 8}" y="${y + 11.5}" fill="${C.cream}">PAPER SYSTEM</text>
    <text x="${x}" y="${y + 30}" fill="${dark ? tint('#FFFFFF', .78) : tint(C.ink, .55)}">TOKYO — VOL.07</text>
  </g>`;
}

/* ---------------- 笔记本（封面视角 + 脊部细节） ---------------- */
function notebookArt(uid, cfg = {}) {
  const cover = cfg.cover || C.cream;
  const rule = cfg.rule || 'grid';
  const binding = cfg.binding || 'thread';
  const band = cfg.band !== false;
  const penloop = !!cfg.penloop;
  const ribbon = !!cfg.ribbon;
  const tabs = !!cfg.tabs;
  const engrave = cfg.engrave || '';
  const dark = isDark(cover);

  const W = 316, H = 428;
  const x0 = (640 - W) / 2 + 14, y0 = (480 - H) / 2 + 4;
  const spineW = binding === 'rings' ? 34 : 22;
  const cx = x0 + spineW;

  const s = [];
  s.push(base(uid, rule));
  s.push(shadowEl(320, 448, 210));

  s.push(`<g transform="rotate(-4 320 240)">`);
  /* 内页纸块（右、上边缘露出） */
  s.push(`<rect x="${cx + 7}" y="${y0 + 9}" width="${W - spineW - 4}" height="${H - 4}" rx="5" fill="${C.ink}" fill-opacity=".16"/>`);
  s.push(`<rect x="${cx + 5}" y="${y0 + 7}" width="${W - spineW - 4}" height="${H - 4}" rx="5" fill="${shade(cover, dark ? 0.16 : -0.5)}"/>`);
  s.push(pageRuleRect(uid, cx + 8, y0 + 10, W - spineW - 10, H - 10, rule, 0.9));

  /* 封面 */
  s.push(`<rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="7" fill="${cover}"/>`);
  s.push(`<rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="7" fill="none" stroke="${C.ink}" stroke-opacity=".28" stroke-width="1.4"/>`);
  s.push(`<rect x="${x0 + 3}" y="${y0 + 3}" width="${W - 6}" height="${H - 6}" rx="5" fill="none" stroke="${tint(dark ? '#FFFFFF' : '#000000', dark ? .1 : .1)}" stroke-width="1"/>`);
  /* 封面顶部微光 */
  s.push(`<rect x="${x0 + 3}" y="${y0 + 3}" width="${W - 6}" height="44" rx="5" fill="${tint(dark ? '#FFFFFF' : '#FFFFFF', dark ? .05 : .28)}"/>`);

  /* 脊部 */
  if (binding === 'thread') {
    s.push(`<rect x="${x0}" y="${y0}" width="${spineW + 8}" height="${H}" rx="7" fill="${tint(cover, .35)}"/>`);
    s.push(threadSpine(x0 + spineW / 2 + 3, y0 + 14, H - 28));
  } else if (binding === 'tape') {
    s.push(`<rect x="${x0}" y="${y0}" width="16" height="${H}" rx="7" fill="${dark ? '#141310' : C.ink}"/>`);
    s.push(`<rect x="${x0 + 16}" y="${y0}" width="6" height="${H}" fill="${C.ink}" fill-opacity=".55"/>`);
    s.push(`<text x="${x0 + 8}" y="${y0 + 26}" font-family="${MONO}" font-size="8" letter-spacing="2" fill="${tint(C.cream, .8)}" transform="rotate(90 ${x0 + 8} ${y0 + 26})">PS — BINDING CLOTH</text>`);
  } else if (binding === 'rings') {
    s.push(`<rect x="${x0}" y="${y0}" width="${spineW + 10}" height="${H}" rx="7" fill="${tint(cover, .3)}"/>`);
    s.push(punchHoles(x0 + 12, y0 + H / 2, H - 60));
    s.push(ringsSpine(x0 + 12, y0 + H / 2, H - 60));
  }

  /* 品牌标签 */
  s.push(brandChip(x0 + spineW + 26, y0 + 30, dark));

  /* 刻字（压凹效果） */
  if (engrave) {
    const ex = x0 + (W + spineW) / 2, ey = y0 + H * 0.52;
    const fill = dark ? tint('#FFFFFF', .5) : tint('#000000', .45);
    const halo = dark ? tint('#000000', .35) : tint('#FFFFFF', .7);
    s.push(`<text x="${ex + 1}" y="${ey + 1}" text-anchor="middle" font-family="${SERIF}" font-size="21" letter-spacing="4" fill="${halo}">${esc(engrave)}</text>`);
    s.push(`<text x="${ex}" y="${ey}" text-anchor="middle" font-family="${SERIF}" font-size="21" letter-spacing="4" fill="${fill}">${esc(engrave)}</text>`);
    s.push(`<text x="${ex}" y="${ey + 18}" text-anchor="middle" font-family="${MONO}" font-size="8" letter-spacing="2.4" fill="${fill}" fill-opacity=".75">ENGRAVED EDITION</text>`);
  }

  /* 配件 */
  if (band) s.push(`<rect x="${x0 + W - 34}" y="${y0 - 3}" width="11" height="${H + 6}" rx="5" fill="${C.ink}"/><rect x="${x0 + W - 32}" y="${y0 - 3}" width="3" height="${H + 6}" fill="${tint('#FFFFFF', .12)}"/>`);
  if (penloop) s.push(`<rect x="${x0 + spineW + 14}" y="${y0 + H - 64}" width="150" height="17" rx="8.5" fill="${shade(cover, dark ? 0.3 : -0.35)}"/><rect x="${x0 + spineW + 14}" y="${y0 + H - 64}" width="150" height="17" rx="8.5" fill="none" stroke="${C.ink}" stroke-opacity=".3"/>`);
  if (ribbon) s.push(`<path d="M${x0 + W / 2 - 8} ${y0 + H} h16 l-8 26 z" fill="${C.cobalt}"/>`);
  if (tabs) {
    for (let i = 0; i < 5; i++) {
      s.push(`<rect x="${x0 + W - 2}" y="${y0 + 60 + i * 30}" width="14" height="18" rx="2" fill="${C.cobalt}" fill-opacity="${1 - i * 0.16}"/>`);
    }
  }
  s.push(`</g>`);
  s.push(cropMarks());
  return wrapSvg(s.join(''));
}

/* ---------------- 六孔活页夹 ---------------- */
function binderArt(uid, cfg = {}) {
  const cover = cfg.cover || C.ink;
  const dark = isDark(cover);
  const W = 330, H = 420;
  const x0 = (640 - W) / 2 + 10, y0 = (480 - H) / 2 + 6;
  const s = [];
  s.push(base(uid, 'grid'));
  s.push(shadowEl(320, 452, 215));
  s.push(`<g transform="rotate(-3 320 240)">`);
  /* 后面探出的内页扇 */
  for (let i = 3; i >= 1; i--) {
    s.push(`<rect x="${x0 + 10 + i * 4}" y="${y0 + 8 + i * 4}" width="${W - 8}" height="${H - 10}" rx="6" fill="${C.page}" stroke="${C.line}" stroke-width="1"/>`);
  }
  s.push(pageRuleRect(uid, x0 + 44, y0 + 20, W - 60, H - 40, 'grid', 0.5));
  /* 封面 */
  s.push(`<rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="8" fill="${cover}"/>`);
  s.push(`<rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="8" fill="none" stroke="${C.ink}" stroke-opacity=".3" stroke-width="1.4"/>`);
  /* 环窗 */
  s.push(`<rect x="${x0 + 16}" y="${y0 + 92}" width="46" height="${H - 190}" rx="10" fill="${tint('#000000', .38)}"/>`);
  s.push(`<rect x="${x0 + 16}" y="${y0 + 92}" width="46" height="${H - 190}" rx="10" fill="none" stroke="${tint('#FFFFFF', .1)}"/>`);
  s.push(punchHoles(x0 + 39, y0 + 92 + (H - 190) / 2, H - 230));
  s.push(ringsSpine(x0 + 39, y0 + 92 + (H - 190) / 2, H - 230));
  s.push(brandChip(x0 + 82, y0 + 40, dark));
  s.push(`<text x="${x0 + 82}" y="${y0 + H - 52}" font-family="${MONO}" font-size="10" letter-spacing="3" fill="${tint(dark ? '#FFFFFF' : '#000000', .55)}">SYSTEM BINDER — 6R</text>`);
  s.push(`</g>`);
  s.push(cropMarks());
  return wrapSvg(s.join(''));
}

/* ---------------- 活页纸补充 ---------------- */
function refillArt(uid, cfg = {}) {
  const rule = cfg.rule || 'grid';
  const W = 300, H = 420;
  const x0 = (640 - W) / 2 - 8, y0 = (480 - H) / 2 + 8;
  const s = [];
  s.push(base(uid, rule));
  s.push(shadowEl(320, 450, 200));
  s.push(`<g transform="rotate(-3 320 240)">`);
  for (let i = 4; i >= 1; i--) {
    s.push(`<rect x="${x0 + i * 6}" y="${y0 + i * 5}" width="${W}" height="${H}" rx="4" fill="${i % 2 ? C.page : '#F4EFE1'}" stroke="${C.line}" stroke-width="1"/>`);
  }
  /* 最上一张带孔与纹样 */
  s.push(`<rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="4" fill="${C.page}"/>`);
  s.push(`<rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="4" fill="none" stroke="${C.line}" stroke-width="1.2"/>`);
  s.push(pageRuleRect(uid, x0 + 30, y0 + 18, W - 48, H - 36, rule, 0.9));
  s.push(punchHoles(x0 + 17, y0 + H / 2, H - 70));
  s.push(`<rect x="${x0 + W - 74}" y="${y0 + H - 42}" width="58" height="14" fill="${C.cobalt}"/>
          <text x="${x0 + W - 68}" y="${y0 + H - 31}" font-family="${MONO}" font-size="8" letter-spacing="1.2" fill="${C.cream}">REFILL</text>`);
  s.push(`</g>`);
  s.push(cropMarks());
  return wrapSvg(s.join(''));
}

/* ---------------- 皮革封套 ---------------- */
function sleeveArt(uid, cfg = {}) {
  const leather = cfg.cover || '#7A5232';
  const W = 322, H = 430;
  const x0 = (640 - W) / 2 + 10, y0 = (480 - H) / 2 + 4;
  const s = [];
  s.push(base(uid, 'grid'));
  s.push(shadowEl(320, 452, 212));
  s.push(`<g transform="rotate(-3 320 240)">`);
  s.push(`<rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="10" fill="${leather}"/>`);
  /* 皮革质感：细纹 */
  for (let i = 0; i < 5; i++) {
    s.push(`<path d="M${x0 + 20 + i * 64} ${y0 + 16} q6 40 -4 90" stroke="${tint('#000000', .12)}" fill="none" stroke-width="1.4"/>`);
  }
  s.push(`<rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="10" fill="none" stroke="${tint('#000000', .3)}" stroke-width="1.6"/>`);
  /* 外露六孔窗 */
  s.push(`<rect x="${x0 + 18}" y="${y0 + 60}" width="42" height="${H - 120}" rx="9" fill="${shade(leather, -0.55)}"/>`);
  s.push(punchHoles(x0 + 39, y0 + 60 + (H - 120) / 2, H - 170));
  s.push(ringsSpine(x0 + 39, y0 + 60 + (H - 120) / 2, H - 170));
  /* 手缝线 */
  const stitches = [];
  for (let i = 0; i < 22; i++) {
    stitches.push(`<line x1="${x0 + 10}" y1="${y0 + 18 + i * ((H - 36) / 22)}" x2="${x0 + 10}" y2="${y0 + 26 + i * ((H - 36) / 22)}" stroke="${C.cobalt}" stroke-width="2"/>`);
  }
  s.push(stitches.join(''));
  /* 黄铜扣 */
  s.push(`<rect x="${x0 + W - 66}" y="${y0 + 46}" width="26" height="34" rx="6" fill="${C.metal}"/><rect x="${x0 + W - 62}" y="${y0 + 50}" width="18" height="12" rx="3" fill="${C.metalHi}"/>`);
  s.push(brandChip(x0 + 76, y0 + 42, true));
  s.push(`<text x="${x0 + 76}" y="${y0 + H - 56}" font-family="${MONO}" font-size="9.5" letter-spacing="2.4" fill="${tint('#FFFFFF', .6)}">HAND STITCHED — TOCHIGI LEATHER</text>`);
  s.push(`</g>`);
  s.push(cropMarks());
  return wrapSvg(s.join(''));
}

/* ---------------- 钢笔 ---------------- */
function penArt(uid, cfg = {}) {
  const body = cfg.body || C.ink;
  const clip = cfg.clip || C.cobalt;
  const dark = isDark(body);
  const s = [];
  s.push(base(uid, 'grid'));
  s.push(shadowEl(320, 408, 250, 20));
  s.push(`<g transform="rotate(-24 320 240)">`);
  /* 笔杆 */
  s.push(`<rect x="130" y="222" width="252" height="30" rx="15" fill="${body}"/>`);
  s.push(`<rect x="130" y="226" width="252" height="6" rx="3" fill="${tint(dark ? '#FFFFFF' : '#FFFFFF', dark ? .12 : .4)}"/>`);
  s.push(`<rect x="130" y="222" width="252" height="30" rx="15" fill="none" stroke="${tint('#000000', .35)}"/>`);
  /* 笔环 */
  s.push(`<rect x="352" y="221" width="16" height="32" rx="4" fill="${C.metal}"/><rect x="352" y="224" width="16" height="5" fill="${C.metalHi}"/>`);
  /* 笔握 + 笔尖 */
  s.push(`<path d="M382 224 L412 228 L412 246 L382 250 Z" fill="${dark ? '#1A1815' : '#33302A'}"/>`);
  s.push(`<path d="M412 228 L452 236 Q462 237 462 240 Q462 243 452 244 L412 246 Z" fill="${C.metal}"/>`);
  s.push(`<path d="M412 231 L448 237.4 L448 242.6 L412 246 Z" fill="${C.metalHi}"/>`);
  s.push(`<path d="M428 237 L452 239 L452 241.5 L428 241.5 Z" fill="${C.metalDk}"/>`);
  s.push(`<circle cx="456" cy="238.6" r="2.1" fill="${C.ink}"/>`);
  /* 笔帽（平行放在下方） */
  s.push(`<rect x="150" y="300" width="240" height="34" rx="17" fill="${body}"/>`);
  s.push(`<rect x="150" y="304" width="240" height="7" rx="3.5" fill="${tint(dark ? '#FFFFFF' : '#FFFFFF', dark ? .12 : .4)}"/>`);
  s.push(`<rect x="150" y="300" width="240" height="34" rx="17" fill="none" stroke="${tint('#000000', .35)}"/>`);
  s.push(`<rect x="368" y="297" width="24" height="40" rx="7" fill="${clip}"/>`);
  s.push(`<path d="M382 300 L382 292 Q394 292 392 304 Z" fill="${clip}"/>`);
  s.push(`<text x="176" y="321" font-family="${MONO}" font-size="10" letter-spacing="2.6" fill="${tint(dark ? '#FFFFFF' : '#000000', .5)}">PS-14</text>`);
  s.push(`</g>`);
  s.push(cropMarks());
  return wrapSvg(s.join(''));
}

/* ---------------- 墨水胆 ---------------- */
function cartridgeArt(uid) {
  const s = [];
  s.push(base(uid, 'grid'));
  s.push(shadowEl(320, 430, 190));
  s.push(`<g transform="rotate(-3 320 240)">`);
  s.push(`<rect x="190" y="120" width="260" height="300" rx="8" fill="${C.cream}"/>`);
  s.push(`<rect x="190" y="120" width="260" height="300" rx="8" fill="none" stroke="${tint('#000000', .3)}" stroke-width="1.4"/>`);
  s.push(`<rect x="190" y="120" width="260" height="44" rx="8" fill="${C.ink}"/>`);
  s.push(`<text x="210" y="148" font-family="${MONO}" font-size="12" letter-spacing="3" fill="${C.cream}">INK CARTRIDGE — 06</text>`);
  /* 开窗 6 支墨水胆 */
  s.push(`<rect x="216" y="186" width="208" height="196" rx="6" fill="${C.cream2}"/>`);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const bx = 232 + i * 64, by = 202 + j * 96;
    s.push(`<rect x="${bx}" y="${by}" width="40" height="80" rx="9" fill="${C.cobalt}"/>`);
    s.push(`<rect x="${bx + 4}" y="${by + 8}" width="8" height="60" rx="4" fill="${tint('#FFFFFF', .28)}"/>`);
    s.push(`<rect x="${bx + 10}" y="${by - 4}" width="20" height="12" rx="3" fill="${C.metal}"/>`);
  }
  s.push(`<rect x="216" y="398" width="208" height="2" fill="${C.cobalt}"/>`);
  s.push(`</g>`);
  s.push(cropMarks());
  return wrapSvg(s.join(''));
}

/* ---------------- 贴纸 / 胶带 ---------------- */
function stickerIndexArt(uid) {
  const blues = ['#0B49C0', '#2F62CF', '#5A85DB', '#8AA9E6', '#B8CBF0', '#DCE6F7'];
  const s = [];
  s.push(base(uid, 'grid'));
  s.push(shadowEl(320, 442, 200));
  s.push(`<g transform="rotate(-3 320 240)">`);
  s.push(`<rect x="180" y="90" width="280" height="340" rx="8" fill="${C.page}" stroke="${C.line}" stroke-width="1.4"/>`);
  s.push(`<text x="206" y="132" font-family="${MONO}" font-size="12" letter-spacing="3" fill="${C.ink}">INDEX — BLUE SCALE</text>`);
  for (let i = 0; i < 6; i++) {
    const y = 158 + i * 42;
    s.push(`<rect x="${206 + i * 10}" y="${y}" width="150" height="26" rx="3" fill="${blues[i]}"/>`);
    s.push(`<text x="${220 + i * 10}" y="${y + 17}" font-family="${MONO}" font-size="9.5" letter-spacing="1.5" fill="${i < 3 ? C.cream : C.ink}">0${7 + i} —</text>`);
    s.push(`<line x1="${206 + i * 10}" y1="${y + 40}" x2="${356 + i * 10}" y2="${y + 40}" stroke="${C.line}" stroke-width="1"/>`);
  }
  s.push(`</g>`);
  s.push(cropMarks());
  return wrapSvg(s.join(''));
}

function washiArt(uid) {
  const cx = 252, cy = 250;
  const s = [];
  s.push(base(uid, 'grid'));
  s.push(shadowEl(320, 420, 220, 18));
  /* 胶带卷：外缘米白，环带露出方眼印刷 */
  s.push(`<circle cx="${cx}" cy="${cy}" r="112" fill="${C.page}" stroke="${tint('#000000', .22)}" stroke-width="1.6"/>`);
  s.push(`<circle cx="${cx}" cy="${cy}" r="86" fill="none" stroke="url(#${uid}-rule)" stroke-width="42"/>`);
  s.push(`<circle cx="${cx}" cy="${cy}" r="65" fill="${C.cream2}" stroke="${tint('#000000', .22)}" stroke-width="1.4"/>`);
  s.push(`<circle cx="${cx}" cy="${cy}" r="46" fill="${C.page}" stroke="${tint('#000000', .16)}" stroke-width="1"/>`);
  /* 拉出的直条，右端手撕锯齿 */
  const sx = 342, sy = 296, sl = 218, sh = 52;
  const strip = `M${sx} ${sy} h${sl} l-9 6 l9 6 l-9 6 l9 6 l-9 6 l9 6 l-9 6 l9 6 l-9 6 H${sx} Z`;
  s.push(`<path d="${strip}" fill="${C.page}" stroke="${tint('#000000', .22)}" stroke-width="1.4" transform="rotate(-5 ${sx} ${sy})"/>`);
  s.push(`<clipPath id="${uid}-strip"><path d="${strip}" transform="rotate(-5 ${sx} ${sy})"/></clipPath>`);
  s.push(`<g clip-path="url(#${uid}-strip)" transform="rotate(-5 ${sx} ${sy})">`);
  s.push(pageRuleRect(uid, sx + 2, sy + 2, sl - 2, sh - 4, 'grid', 1.7));
  s.push(`</g>`);
  s.push(`<text x="96" y="418" font-family="${MONO}" font-size="10" letter-spacing="2.2" fill="${tint(C.ink, .55)}">WASHI TAPE — GRID 15mm × 10m</text>`);
  s.push(cropMarks());
  return wrapSvg(s.join(''));
}

function stickerPressArt(uid) {
  const s = [];
  s.push(base(uid, 'grid'));
  s.push(shadowEl(320, 442, 200));
  s.push(`<g transform="rotate(-3 320 240)">`);
  for (let i = 3; i >= 0; i--) {
    s.push(`<rect x="${170 + i * 8}" y="${96 + i * 10}" width="300" height="330" rx="6" fill="${i % 2 ? C.page : '#F6F1E3'}" stroke="${C.line}" stroke-width="1"/>`);
  }
  const lx = 194, ly = 132;
  /* 活版压痕：深色字 + 微偏移 */
  const deboss = (x, y, w, h, label) =>
    `<rect x="${x + 1.6}" y="${y + 1.6}" width="${w}" height="${h}" rx="3" fill="${tint('#000000', .16)}"/>
     <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${C.page}" stroke="${tint('#000000', .25)}"/>
     <text x="${x + 12}" y="${y + h / 2 + 4}" font-family="${SERIF}" font-size="13" letter-spacing="2" fill="${C.cobalt}">${esc(label)}</text>`;
  s.push(deboss(lx, ly, 180, 40, 'TO — FROM'));
  s.push(deboss(lx, ly + 58, 180, 40, 'ARCHIVE No.'));
  s.push(deboss(lx, ly + 116, 130, 40, 'PROPERTY OF'));
  s.push(`<rect x="${lx}" y="${ly + 174}" width="52" height="52" rx="3" fill="none" stroke="${C.cobalt}" stroke-width="1.6" stroke-dasharray="5 4"/>`);
  s.push(`<text x="${lx + 10}" y="${ly + 206}" font-family="${MONO}" font-size="10" fill="${tint(C.ink, .6)}">DATE</text>`);
  s.push(`<text x="${lx + 210}" y="${ly + 300}" font-family="${MONO}" font-size="9" letter-spacing="2" fill="${tint(C.ink, .5)}">LETTERPRESS — 12 DESIGNS</text>`);
  s.push(`</g>`);
  s.push(cropMarks());
  return wrapSvg(s.join(''));
}

/* ---------------- 桌面收纳 ---------------- */
function trayArt(uid) {
  const s = [];
  s.push(base(uid, 'grid'));
  s.push(shadowEl(320, 392, 250, 16));
  const bx = 96, bw = 448;
  const ty = 226, oy = 282, fy = 356; /* 顶边 / 开口前缘 / 底边 */
  /* 开口内腔 */
  s.push(`<path d="M${bx} ${ty} h${bw} l-20 ${oy - ty} h-${bw - 40} Z" fill="#141310"/>`);
  s.push(`<path d="M${bx} ${ty} h${bw} l-4 12 h-${bw - 8} Z" fill="#3D3A32"/>`);
  /* 槽内的笔（露出上半截） */
  const pens = [
    [150, 200, 210, C.cobalt],
    [260, 194, 190, C.cream],
    [380, 202, 170, '#4A463C'],
  ];
  for (const [px, py, pw, pc] of pens) {
    const pd = isDark(pc);
    s.push(`<g transform="rotate(${px === 260 ? -1.2 : 1.4} ${px + pw / 2} ${py})">
      <rect x="${px}" y="${py}" width="${pw}" height="17" rx="8.5" fill="${pc}"/>
      <rect x="${px + 4}" y="${py + 2.5}" width="${pw - 8}" height="4" rx="2" fill="${tint('#FFFFFF', pd ? .14 : .5)}"/>
      <rect x="${px + pw - 26}" y="${py - 1.5}" width="10" height="20" rx="3" fill="${C.metal}"/>
    </g>`);
  }
  /* 前面板 */
  s.push(`<path d="M${bx + 20} ${oy} h${bw - 40} l-10 ${fy - oy} h-${bw - 60} Z" fill="#211F1A"/>`);
  s.push(`<path d="M${bx + 20} ${oy} h${bw - 40} l-2 10 h-${bw - 56} Z" fill="#4A463C"/>`);
  /* 观察孔 + 铭牌 */
  s.push(`<circle cx="${bx + 46}" cy="${(oy + fy) / 2 + 8}" r="5.5" fill="${C.cream}" stroke="${tint('#000000', .5)}" stroke-width="1.4"/>`);
  s.push(`<rect x="${bx + bw / 2 - 82}" y="${(oy + fy) / 2 - 2}" width="164" height="26" rx="2" fill="${C.cobalt}"/>
          <text x="${bx + bw / 2 - 66}" y="${(oy + fy) / 2 + 16}" font-family="${MONO}" font-size="11" letter-spacing="2.6" fill="${C.cream}">PAPER SYSTEM</text>`);
  s.push(`<text x="${bx}" y="${ty - 24}" font-family="${MONO}" font-size="10" letter-spacing="2.4" fill="${tint(C.ink, .55)}">PEN TROUGH — STEEL / 220mm</text>`);
  s.push(cropMarks());
  return wrapSvg(s.join(''));
}

function fileboxArt(uid, cfg = {}) {
  const box = cfg.cover || C.cream;
  const dark = isDark(box);
  const s = [];
  s.push(base(uid, 'grid'));
  s.push(shadowEl(320, 442, 200));
  const bx = 200, by = 120, bw = 240, bh = 310, bd = 58;
  s.push(`<g transform="rotate(-2 320 240)">`);
  /* 内页（露出的杂志） */
  s.push(`<rect x="${bx - 26}" y="${by - 46}" width="150" height="200" rx="4" fill="${C.page}" stroke="${C.line}" stroke-width="1.2" transform="rotate(-8 ${bx - 26} ${by - 46})"/>`);
  s.push(`<rect x="${bx - 16}" y="${by - 36}" width="130" height="180" rx="4" fill="none" stroke="${C.cobalt}" stroke-width="2" transform="rotate(-8 ${bx - 16} ${by - 36})"/>`);
  /* 盒体 */
  s.push(`<path d="M${bx} ${by} l${bd} ${-26} h${bw - bd} l${-bd} ${26} Z" fill="${shade(box, dark ? 0.25 : -0.18)}"/>`);
  s.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="${box}"/>`);
  s.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="none" stroke="${tint('#000000', .28)}" stroke-width="1.4"/>`);
  s.push(`<path d="M${bx + bw} ${by} v${bh} l-${bd} ${-26} v-${bh} Z" fill="${shade(box, dark ? -0.05 : -0.3)}"/>`);
  /* 标签窗 */
  s.push(`<rect x="${bx + 28}" y="${by + 92}" width="${bw - 56}" height="52" rx="3" fill="${C.page}" stroke="${tint('#000000', .22)}"/>`);
  s.push(`<line x1="${bx + 42}" y1="${by + 112}" x2="${bx + bw - 46}" y2="${by + 112}" stroke="${C.line}" stroke-width="2"/>`);
  s.push(`<line x1="${bx + 42}" y1="${by + 128}" x2="${bx + 160}" y2="${by + 128}" stroke="${C.line}" stroke-width="2"/>`);
  /* 钴蓝绳提手 */
  s.push(`<path d="M${bx + bw / 2 - 40} ${by + bh - 34} q40 26 80 0" fill="none" stroke="${C.cobalt}" stroke-width="7" stroke-linecap="round"/>`);
  s.push(`<text x="${bx + 28}" y="${by + 60}" font-family="${MONO}" font-size="11" letter-spacing="3" fill="${tint(dark ? '#FFFFFF' : '#000000', .6)}">DO-BOX / A4</text>`);
  s.push(`</g>`);
  s.push(cropMarks());
  return wrapSvg(s.join(''));
}

function clipArt(uid) {
  /* 长尾夹正视图：梯形夹体 + 上翘钢丝柄，三尺寸斜列 */
  const specs = [[188, 268, 92, 'L'], [318, 258, 74, 'M'], [434, 252, 58, 'S']];
  const s = [];
  s.push(base(uid, 'grid'));
  s.push(shadowEl(320, 400, 220, 16));
  for (const [x, y, w, label] of specs) {
    const h = w * 0.58;
    s.push(`<g transform="rotate(-4 ${x + w / 2} ${y})">`);
    /* 钢丝柄（上翘双环） */
    s.push(`<path d="M${x + w * 0.22} ${y + 6} q-6 -${h * 0.9} ${w * 0.16} -${h * 0.86}" fill="none" stroke="${C.metalDk}" stroke-width="5" stroke-linecap="round"/>
            <path d="M${x + w * 0.78} ${y + 6} q6 -${h * 0.9} -${w * 0.16} -${h * 0.86}" fill="none" stroke="${C.metalDk}" stroke-width="5" stroke-linecap="round"/>
            <path d="M${x + w * 0.24} ${y + 4} q-5 -${h * 0.8} ${w * 0.15} -${h * 0.76}" fill="none" stroke="${C.metalHi}" stroke-width="2" stroke-linecap="round"/>`);
    /* 夹体（梯形，上宽下窄） */
    s.push(`<path d="M${x} ${y} h${w} l${-w * 0.14} ${h} h-${w * 0.72} Z" fill="${C.metal}"/>
            <path d="M${x} ${y} h${w} l-2 12 h-${w - 4} Z" fill="${C.metalHi}"/>
            <path d="M${x} ${y} h${w} l${-w * 0.14} ${h} h-${w * 0.72} Z" fill="none" stroke="${C.metalDk}" stroke-width="1.6"/>`);
    /* 夹口 */
    s.push(`<line x1="${x + w * 0.16}" y1="${y + h - 4}" x2="${x + w * 0.84}" y2="${y + h - 4}" stroke="${C.metalDk}" stroke-width="2.4"/>`);
    s.push(`<text x="${x + w / 2}" y="${y + h * 0.62}" text-anchor="middle" font-family="${MONO}" font-size="${Math.max(9, w * 0.12)}" letter-spacing="2" fill="${tint('#000000', .45)}">${label}</text>`);
    s.push(`</g>`);
  }
  s.push(`<text x="150" y="150" font-family="${MONO}" font-size="10" letter-spacing="2.2" fill="${tint(C.ink, .55)}">BRASS BINDER CLIPS — S / M / L</text>`);
  s.push(cropMarks());
  return wrapSvg(s.join(''));
}

/* ---------------- 定制工坊：实时预览 ---------------- */
function customArt(uid, cfg = {}) {
  const coverOpt = cfg.cover || {};
  const material = coverOpt.material || 'naked';
  const coverHex = coverOpt.hex || C.cream;
  const rule = cfg.paper || 'grid';
  const binding = cfg.binding || 'thread';
  const sizeId = cfg.size || 'a5';
  const engrave = cfg.engrave || '';
  const acc = cfg.accessories || {};

  const ratioMap = { a5: [148, 210], b6: [128, 188], a6: [105, 148] };
  const [pw, ph] = ratioMap[sizeId] || ratioMap.a5;
  const scale = 380 / ph;
  const W = pw * scale, H = ph * scale;

  return notebookArt(uid, {
    cover: material === 'naked' ? C.cream : coverHex,
    rule, binding, band: !!acc.band,
    penloop: !!acc.penloop, ribbon: !!acc.ribbon, tabs: !!acc.tabs,
    engrave,
  });
}

function wrapSvg(inner, w = 640, h = 480) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">` + inner + `</svg>`;
}

/* ---------------- 分发 ---------------- */
export function renderProductArt(product, overrides = {}) {
  const a = { ...(product.art || {}), ...overrides };
  const uid = 'p' + product.id.replace(/[^a-z0-9]/gi, '');
  switch (a.type) {
    case 'notebook': return notebookArt(uid, a);
    case 'binder': return binderArt(uid, a);
    case 'refill': return refillArt(uid, a);
    case 'sleeve': return sleeveArt(uid, a);
    case 'pen': return penArt(uid, a);
    case 'cartridge': return cartridgeArt(uid);
    case 'sticker-index': return stickerIndexArt(uid);
    case 'washi': return washiArt(uid);
    case 'sticker-press': return stickerPressArt(uid);
    case 'tray': return trayArt(uid);
    case 'filebox': return fileboxArt(uid, a);
    case 'clip': return clipArt(uid);
    default: return notebookArt(uid, a);
  }
}

export { customArt as renderCustomArt };
