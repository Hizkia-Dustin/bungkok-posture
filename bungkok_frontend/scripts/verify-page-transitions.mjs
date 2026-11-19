import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "no-preference",
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const idle = () =>
  expect(page.locator(".page-transition")).toHaveAttribute(
    "data-phase",
    "idle",
  );
const results = [];
try {
  await page.goto("http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "Lewati intro" }).click();
  await page.getByRole("link", { name: "LET’S START" }).click();
  await expect(page.locator(".page-transition")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  assert.equal(await page.locator(".landing-hero").count(), 1);
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "design-reference/verification/page-transition-cover.png",
  });
  await expect(page.locator(".page-transition")).toHaveAttribute(
    "data-phase",
    "reveal",
  );
  await page.screenshot({
    path: "design-reference/verification/page-transition-reveal.png",
  });
  await idle();
  assert.match(page.url(), /register$/);
  await page.goBack();
  await idle();
  await expect(page.locator(".landing-hero")).toBeVisible();
  assert.equal(await page.locator(".landing-intro").count(), 0);
  await page.goForward();
  await idle();
  assert.match(page.url(), /register$/);
  results.push("Landing → register, back, forward; intro does not replay");

  await page.goto("http://127.0.0.1:5173/app/dashboard");
  await page
    .getByRole("link", { name: "Riwayat Latihan", exact: true })
    .click();
  await idle();
  assert.match(page.url(), /riwayat$/);
  await expect(page.locator(".app-page")).toBeVisible();
  await page.getByRole("link", { name: "Perkembangan", exact: true }).click();
  await idle();
  assert.match(page.url(), /perkembangan$/);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(100);
  assert.notEqual(
    await page.evaluate(() => document.body.style.overflow),
    "hidden",
  );
  results.push("Sidebar routes and scrolling remain usable");

  await page.goto("http://127.0.0.1:5173/#top");
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page
    .locator("footer")
    .getByRole("link", { name: "Masuk", exact: true })
    .click();
  await page.waitForURL("**/login");
  await idle();
  assert.match(page.url(), /login$/);
  results.push("Native footer anchor uses client-side transition");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goBack();
  await idle();
  assert.equal(await page.locator(".page-transition").isVisible(), false);
  assert.equal(await page.locator(".landing-intro").count(), 0);
  results.push("Reduced motion bypasses transition");
  assert.deepEqual(errors, []);
  await writeFile(
    "design-reference/verification/page-transitions.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log({ results, errors });
} finally {
  await browser.close();
}
