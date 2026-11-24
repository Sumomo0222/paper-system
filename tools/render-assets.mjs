#!/usr/bin/env node
/* 批量渲染 assets/img/*.svg 商品插画（与 js/data.js 一一对应）
 *   node tools/render-assets.mjs
 * 商品图片路径集中在 js/data.js；把这里的 .svg 换成同名照片即可无缝替换。 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderProductArt } from '../js/art.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// data.js 是经典脚本（挂 window.PS_DATA），这里手动求值
const fs = await import('node:fs');
const src = fs.readFileSync(join(root, 'js', 'data.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const list = window.PS_DATA.products;

const outDir = join(root, 'assets', 'img');
mkdirSync(outDir, { recursive: true });
for (const p of list) {
  const svg = renderProductArt(p);
  const file = join(root, p.img.replace(/^assets\//, 'assets/'));
  writeFileSync(file, svg, 'utf8');
  console.log('✓', p.img, `${(svg.length / 1024).toFixed(1)} KB`);
}
console.log(`\n共渲染 ${list.length} 张商品插画 → assets/img/`);
