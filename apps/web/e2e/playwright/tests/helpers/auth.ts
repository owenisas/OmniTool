import { expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@omnitool.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123!";

export async function login(page: Page) {
  await page.goto("/login", { waitUntil: "load" });

  const emailInput = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitButton = page.locator('form button[type="submit"]').first();

  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(submitButton).toBeEnabled();

  // The login page is a client component with controlled inputs. In dev mode,
  // tests can reach DOMContentLoaded before React has attached; filling too
  // early leaves the values vulnerable to being reset by hydration.
  for (let attempt = 0; attempt < 3; attempt++) {
    await emailInput.fill(ADMIN_EMAIL);
    await passwordInput.fill(ADMIN_PASSWORD);
    await expect(emailInput).toHaveValue(ADMIN_EMAIL);
    await expect(passwordInput).toHaveValue(ADMIN_PASSWORD);
    await page.waitForTimeout(250);

    if (
      (await emailInput.inputValue()) === ADMIN_EMAIL &&
      (await passwordInput.inputValue()) === ADMIN_PASSWORD
    ) {
      break;
    }
  }

  await submitButton.click();

  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 20_000,
    });
  } catch (err) {
    const loginError = await page
      .locator(".text-destructive")
      .first()
      .textContent()
      .catch(() => null);
    throw new Error(
      `Login did not leave /login${loginError ? `: ${loginError.trim()}` : ""}`,
      { cause: err },
    );
  }
}
