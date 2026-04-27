/**
 * Optional Playwright fallback for instance APIs when neither developer token
 * nor OAuth bearer is accepted. Mirrors dsl-beast/auth.py:_browser_session_client.
 *
 * Playwright is a peer dependency loaded lazily so that 99% of users who don't
 * need this path don't pay the install cost. We use structural types here so
 * we don't need `playwright` types installed at compile time.
 */

interface PlaywrightLocator {
  isVisible(): Promise<boolean>;
  click(): Promise<void>;
  first(): PlaywrightLocator;
}
interface PlaywrightPage {
  goto(url: string): Promise<unknown>;
  waitForSelector(sel: string, opts?: { timeout?: number }): Promise<unknown>;
  fill(sel: string, value: string): Promise<void>;
  click(sel: string): Promise<void>;
  locator(sel: string): PlaywrightLocator;
  waitForURL(predicate: (url: URL) => boolean, opts?: { timeout?: number }): Promise<unknown>;
}
interface PlaywrightContext {
  newPage(): Promise<PlaywrightPage>;
  cookies(): Promise<Array<{ name: string; value: string }>>;
}
interface PlaywrightBrowser {
  newContext(): Promise<PlaywrightContext>;
  close(): Promise<void>;
}

export interface BrowserCredentials {
  instance: string;
  username?: string | undefined;
  password?: string | undefined;
}

export interface BrowserSession {
  cookies: Record<string, string>;
  expiresAt: number | null;
}

export class BrowserAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserAuthError";
  }
}

const SESSION_TTL_MS = 30 * 60 * 1000;

export class BrowserSessionManager {
  private session: BrowserSession | null = null;

  constructor(private readonly creds: BrowserCredentials) {}

  async getSession(): Promise<BrowserSession> {
    const now = Date.now();
    if (this.session && (this.session.expiresAt ?? Number.POSITIVE_INFINITY) > now) {
      return this.session;
    }
    this.session = await this.login();
    return this.session;
  }

  invalidate(): void {
    this.session = null;
  }

  private async login(): Promise<BrowserSession> {
    let chromium: { launch: (opts: { headless: boolean }) => Promise<PlaywrightBrowser> };
    const moduleName = "playwright";
    try {
      const mod = (await import(moduleName).catch(() =>
        Promise.reject(new Error("not-installed")),
      )) as { chromium: typeof chromium };
      chromium = mod.chromium;
    } catch {
      throw new BrowserAuthError(
        "Playwright is required for browser auth fallback. Install it with `npm i playwright` " +
          "and run `npx playwright install chromium`.",
      );
    }

    const loginUrl = `https://${this.creds.instance}.domo.com/auth/index?followUpUrl=%2F`;
    const browser = await chromium.launch({ headless: false });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      if (this.creds.username && this.creds.password) {
        await page.goto(loginUrl);
        await page.waitForSelector("input[type='email'], input[name='username'], #username", {
          timeout: 15_000,
        });
        await page.fill(
          "input[type='email'], input[name='username'], #username",
          this.creds.username,
        );
        const nextBtn = page.locator("button:has-text('Next'), button[type='submit']").first();
        if (await nextBtn.isVisible().catch(() => false)) {
          await nextBtn.click();
        }
        await page.waitForSelector("input[type='password'], #password", { timeout: 10_000 });
        await page.fill("input[type='password'], #password", this.creds.password);
        await page.click(
          "button[type='submit'], button:has-text('Sign in'), button:has-text('Log in')",
        );
      } else {
        await page.goto(loginUrl);
      }

      try {
        await page.waitForURL(
          (url: URL) =>
            !url.pathname.startsWith("/auth/") && url.host.includes(this.creds.instance),
          { timeout: 120_000 },
        );
      } catch {
        throw new BrowserAuthError(
          "Timed out waiting for Domo login. Please log in within 2 minutes when using interactive mode.",
        );
      }

      const rawCookies = await context.cookies();
      const cookies: Record<string, string> = {};
      for (const c of rawCookies) {
        cookies[c.name] = c.value;
      }
      return { cookies, expiresAt: Date.now() + SESSION_TTL_MS };
    } finally {
      await browser.close();
    }
  }
}
