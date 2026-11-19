import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
await mkdir('design-reference/verification', { recursive: true });
try {
  for (const width of [1366, 1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: 1080 }, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5173/');
    const footer = page.locator('footer');
    await footer.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('footer')?.classList.contains('mrf-in'));
    await page.waitForTimeout(4200);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await footer.locator('a[href="#"]').count(), 0);
    assert.equal(await footer.locator('form').count(), 0);
    assert.match(await footer.innerText(), /BUNGKOK/);
    const before = await footer.locator('canvas').evaluate(canvas => canvas.toDataURL());
    await page.mouse.move(width * 0.8, 200);
    await page.waitForTimeout(300);
    const after = await footer.locator('canvas').evaluate(canvas => canvas.toDataURL());
    assert.notEqual(before, after);
    await footer.screenshot({ path: `design-reference/verification/footer-${width}.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(900);
    const still = await footer.locator('canvas').evaluate(canvas => canvas.toDataURL());
    await page.waitForTimeout(300);
    assert.ok(await footer.locator('canvas').evaluate(canvas => canvas.toDataURL()) === still, 'Reduced-motion canvas should stop changing');
    await footer.getByRole('link', { name: 'Mulai bersama BUNGKOK' }).click();
    await page.waitForURL('**/register');
    assert.deepEqual(errors, []);
    results.push({ width, noOverflow: true, animatedCanvas: true, reducedMotion: true, registrationLink: true, errors });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile('design-reference/verification/footer.json', JSON.stringify(results, null, 2));
console.log(results);
