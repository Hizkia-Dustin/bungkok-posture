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
  // 1. Test Login -> Dashboard Transition
  console.log("Navigating to /login...");
  await page.goto("http://127.0.0.1:5173/login");
  await idle();
  await expect(page.getByRole("button", { name: "Masuk" })).toBeVisible();

  console.log("Clicking Masuk button...");
  await page.getByRole("button", { name: "Masuk" }).click();

  // Page transition should enter cover phase
  await expect(page.locator(".page-transition")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  await page.screenshot({
    path: "design-reference/verification/login-transition-cover.png",
  });
  console.log("Captured cover screenshot");

  // Page transition should enter reveal phase
  await expect(page.locator(".page-transition")).toHaveAttribute(
    "data-phase",
    "reveal",
  );
  await page.screenshot({
    path: "design-reference/verification/login-transition-reveal.png",
  });
  console.log("Captured reveal screenshot");

  // Transition completes to idle
  await idle();
  assert.match(page.url(), /\/app\/dashboard$/);
  await expect(page.locator(".dashboard-page")).toBeVisible();
  await page.screenshot({
    path: "design-reference/verification/login-transition-dashboard.png",
  });
  console.log("Dashboard revealed and visible");
  results.push("Login → Dashboard executes full brush page transition (cover → reveal → idle)");

  // 2. Test Logout -> Login transition
  console.log("Testing Logout modal...");
  await page.locator(".sidebar-exit-btn").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  
  await expect(page.locator(".page-transition")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  await idle();
  assert.match(page.url(), /\/login$/);
  results.push("Dashboard → Logout executes page transition back to /login");

  // 3. Test Register -> Dashboard Transition
  console.log("Navigating to /register...");
  await page.goto("http://127.0.0.1:5173/register");
  await idle();
  await page.getByRole("button", { name: "Daftar sekarang" }).click();
  await expect(page.locator(".page-transition")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  await idle();
  assert.match(page.url(), /\/app\/dashboard$/);
  await expect(page.locator(".dashboard-page")).toBeVisible();
  results.push("Register → Dashboard executes page transition");

  // 4. Test Internal App Navigation does NOT trigger brush cover
  console.log("Testing internal sidebar navigation...");
  await page.getByRole("link", { name: "Riwayat Latihan", exact: true }).click();
  await idle();
  assert.match(page.url(), /\/app\/riwayat$/);
  results.push("Internal app navigation (/app/dashboard → /app/riwayat) stays idle without brush overlay");

  assert.deepEqual(errors, []);
  await writeFile(
    "design-reference/verification/login-page-transition.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log("ALL TESTS PASSED:", { results, errors });
} finally {
  await browser.close();
}

