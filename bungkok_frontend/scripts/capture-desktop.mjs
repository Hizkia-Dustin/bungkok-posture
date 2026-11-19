import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: {width:1440,height:1024}, reducedMotion:'reduce' });
await mkdir('design-reference/verification', {recursive:true});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const results = [];
for (const [name, route] of [['landing','/'],['login','/login'],['register','/register'],['dashboard','/app/dashboard'],['history','/app/riwayat'],['progress','/app/perkembangan'],['challenges','/app/tantangan'],['rewards','/app/reward'],['profile','/app/profil'],['help','/app/bantuan']]) {
  await page.goto(`http://127.0.0.1:5173${route}`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => {image.loading='eager'; return image.decode().catch(() => {});}));
  });
  await page.screenshot({path:`design-reference/verification/${name}.png`,fullPage:true});
  results.push({name, ...await page.evaluate(() => ({overflow:document.documentElement.scrollWidth > innerWidth, broken:[...document.images].filter((image)=>!image.naturalWidth).map((image)=>image.src)}))});
}
await writeFile('design-reference/verification/initial-check.json', JSON.stringify({results,errors},null,2));
console.log(JSON.stringify({results,errors},null,2));
await browser.close();
