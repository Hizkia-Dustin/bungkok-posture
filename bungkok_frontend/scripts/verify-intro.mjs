import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome" });
await mkdir("design-reference/verification", { recursive: true });
const results = [];
try {
  for (const width of [1366, 1440, 1920]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: "no-preference",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:5173/", {
      waitUntil: "domcontentloaded",
    });
    const intro = page.locator(".landing-intro");
    await expect(intro).toHaveAttribute("data-stage", "kelompok");
    assert.equal(await page.locator("main").evaluate((el) => el.inert), true);
    await page.waitForTimeout(900);
    await page.screenshot({
      path: `design-reference/verification/intro-group-${width}.png`,
    });
    await expect(intro).toHaveAttribute("data-stage", "bungkok");
    await page.waitForTimeout(650);
    await page.screenshot({
      path: `design-reference/verification/intro-brand-${width}.png`,
    });
    await expect(intro).toHaveAttribute("data-stage", "hero");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `design-reference/verification/intro-reveal-${width}.png`,
    });
    await expect(intro).toHaveCount(0);
    await page.waitForTimeout(500);
    assert.equal(await page.locator("main").evaluate((el) => el.inert), false);
    assert.notEqual(
      await page.evaluate(() => document.body.style.overflow),
      "hidden",
    );
    await expect(page.locator(".landing-nav")).toHaveCSS("opacity", "1");
    await page.mouse.wheel(0, 600);
    await page.waitForFunction(() => scrollY > 300);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      sequence: ["kelompok", "bungkok", "hero"],
      scrollingRestored: true,
      errors,
    });
    await page.close();
  }
  for (const mode of [
    "skip",
    "escape",
    "reduce",
    "hash",
    "preference-change",
  ]) {
    const page = await browser.newPage({
      reducedMotion: mode === "reduce" ? "reduce" : "no-preference",
    });
    await page.goto(`http://127.0.0.1:5173/${mode === "hash" ? "#about" : ""}`);
    if (mode === "skip")
      await page.getByRole("button", { name: "Lewati intro" }).click();
    if (mode === "escape") await page.keyboard.press("Escape");
    if (mode === "preference-change")
      await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".landing-intro")).toHaveCount(0);
    assert.equal(await page.locator("main").evaluate((el) => el.inert), false);
    assert.notEqual(
      await page.evaluate(() => document.body.style.overflow),
      "hidden",
    );
    results.push({ mode, passed: true });
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  "design-reference/verification/intro.json",
  JSON.stringify(results, null, 2),
);
console.log(results);
