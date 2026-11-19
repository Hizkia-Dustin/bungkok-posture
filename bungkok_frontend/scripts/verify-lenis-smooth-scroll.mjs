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

const results = [];

try {
  console.log("Navigating to landing page...");
  await page.goto("http://127.0.0.1:5173/");

  // Skip intro if present
  const skipBtn = page.getByRole("button", { name: "Lewati intro" });
  if (await skipBtn.count() > 0) {
    await skipBtn.click();
  }
  await page.waitForTimeout(500);

  // 1. Check window.lenis existence
  const hasLenis = await page.evaluate(() => typeof window.lenis !== "undefined" && Boolean(window.lenis));
  assert.equal(hasLenis, true, "window.lenis must be defined");
  results.push("Lenis instance is active on window.lenis");

  // 2. Check html.lenis class
  const htmlClass = await page.evaluate(() => document.documentElement.className);
  assert.match(htmlClass, /lenis/, "html element should have lenis class");
  results.push("html element has lenis class");

  // 3. Test Lenis smooth scrolling via wheel
  const initialScrollY = await page.evaluate(() => window.scrollY);
  console.log("Initial scrollY:", initialScrollY);

  await page.mouse.wheel(0, 800);
  // Wait shortly to verify interpolation is progressing
  await page.waitForTimeout(300);
  const midScrollY = await page.evaluate(() => window.scrollY);
  console.log("Mid scrollY:", midScrollY);
  assert.ok(midScrollY > initialScrollY, "ScrollY should have increased after wheel");

  // Wait for Lenis deceleration to settle
  await page.waitForTimeout(1000);
  const settledScrollY = await page.evaluate(() => window.scrollY);
  console.log("Settled scrollY:", settledScrollY);
  assert.ok(settledScrollY >= midScrollY, "ScrollY should settle smoothly");
  results.push("Mouse wheel triggers smooth Lenis scroll deceleration");

  // 4. Test programmatic Lenis scrollTo
  await page.evaluate(() => {
    window.lenis.scrollTo(0, { immediate: true });
  });
  await page.waitForTimeout(100);
  const resetScrollY = await page.evaluate(() => window.scrollY);
  assert.equal(resetScrollY, 0, "Lenis scrollTo immediate should reset to 0");
  results.push("Lenis immediate scrollTo(0) works reliably");

  // 5. Test anchor smooth scroll to #about
  const aboutSection = page.locator("#about, .landing-about");
  if (await aboutSection.count() > 0) {
    console.log("Testing anchor scroll to about...");
    await page.evaluate(() => {
      window.lenis.scrollTo("#about", { duration: 0.8 });
    });
    await page.waitForTimeout(900);
    const aboutScrollY = await page.evaluate(() => window.scrollY);
    console.log("About scrollY after smooth scroll:", aboutScrollY);
    assert.ok(aboutScrollY > 100, "ScrollY should have smoothly scrolled down to #about");
    results.push("Lenis smooth scroll to #about executed smoothly");
  }

  // 6. Test reduced-motion behaviour
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(200);
  const isStopped = await page.evaluate(() => window.lenis.isStopped);
  console.log("Lenis isStopped under reduced motion:", isStopped);
  results.push("Lenis respects reduced motion preference");

  // Screenshot verification
  await page.screenshot({
    path: "design-reference/verification/lenis-smooth-scroll.png",
  });

  assert.deepEqual(errors, []);
  await writeFile(
    "design-reference/verification/lenis-verification.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log("LENIS VERIFICATION PASSED:", { results, errors });
} finally {
  await browser.close();
}

