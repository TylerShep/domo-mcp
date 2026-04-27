import pRetry, { AbortError } from "p-retry";
import type { AuthManager } from "../auth/manager.js";
import { type DomoMcpConfig, instanceBaseUrl, platformBaseUrl } from "../config.js";
import type { DomoHost } from "../types/domo.js";
import { logger } from "../utils/logger.js";

export class DomoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = "DomoApiError";
  }
}

class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}

export interface DomoRequestOptions {
  host: DomoHost;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  accept?: string;
  timeoutMs?: number;
}

export interface DomoRawResponse {
  status: number;
  headers: Headers;
  body: ArrayBuffer;
  url: string;
}

export class DomoClient {
  constructor(
    private readonly auth: AuthManager,
    private readonly config: DomoMcpConfig,
  ) {}

  /** Throws DomoApiError on 4xx, retries on 429/5xx/401-after-refresh. */
  async request<T>(opts: DomoRequestOptions): Promise<T> {
    const raw = await this.requestRaw(opts);
    const text = new TextDecoder().decode(raw.body);
    if (!text.length) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new DomoApiError(
        `Failed to parse JSON response from ${raw.url}: ${(cause as Error).message}`,
        raw.status,
        text.slice(0, 500),
        raw.url,
      );
    }
  }

  /** Returns the raw bytes - used for CSV exports and PNG renders. */
  async requestBytes(
    opts: DomoRequestOptions,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const raw = await this.requestRaw(opts);
    return {
      bytes: new Uint8Array(raw.body),
      contentType: raw.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  /** Returns the raw text - used for CSV exports when caller wants a string. */
  async requestText(opts: DomoRequestOptions): Promise<string> {
    const raw = await this.requestRaw(opts);
    return new TextDecoder().decode(raw.body);
  }

  private async requestRaw(opts: DomoRequestOptions): Promise<DomoRawResponse> {
    const url = this.buildUrl(opts);
    const maxRetries = this.config.domoMaxRetries;

    return pRetry(
      async () => {
        const auth = await this.auth.authForHost(opts.host);
        const headers: Record<string, string> = {
          ...(opts.accept ? { Accept: opts.accept } : { Accept: "application/json" }),
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...auth.headers,
          ...(opts.headers ?? {}),
        };
        if (auth.cookies) {
          headers.Cookie = Object.entries(auth.cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join("; ");
        }

        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          opts.timeoutMs ?? this.config.domoTimeoutMs,
        );

        let response: Response;
        try {
          response = await fetch(url, {
            method: opts.method ?? "GET",
            headers,
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
            signal: controller.signal,
          });
        } catch (cause) {
          throw new RetryableError(
            `${opts.method ?? "GET"} ${url} failed: ${(cause as Error).message}`,
          );
        } finally {
          clearTimeout(timer);
        }

        if (response.status === 401) {
          this.auth.invalidateOAuth();
          throw new RetryableError(`${opts.method ?? "GET"} ${url} returned 401 (token expired)`);
        }
        if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
          const body = await safeText(response);
          throw new RetryableError(
            `${opts.method ?? "GET"} ${url} returned ${response.status}: ${body.slice(0, 300)}`,
          );
        }
        if (!response.ok) {
          const body = await safeText(response);
          throw new AbortError(
            new DomoApiError(
              `${opts.method ?? "GET"} ${url} returned ${response.status}: ${body.slice(0, 500)}`,
              response.status,
              body,
              url,
            ),
          );
        }

        const buffer = await response.arrayBuffer();
        return {
          status: response.status,
          headers: response.headers,
          body: buffer,
          url,
        };
      },
      {
        retries: maxRetries,
        minTimeout: 1_000,
        maxTimeout: 15_000,
        factor: 2,
        onFailedAttempt: (err) => {
          logger.debug(
            `Retry ${err.attemptNumber}/${err.attemptNumber + err.retriesLeft} for ${url}: ${err.message}`,
          );
        },
      },
    );
  }

  private buildUrl(opts: DomoRequestOptions): string {
    const base =
      opts.host === "platform" ? platformBaseUrl(this.config) : instanceBaseUrl(this.config);
    const path = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;
    const url = new URL(`${base}${path}`);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  /**
   * Generic offset/limit pagination helper. Calls the endpoint repeatedly with
   * limit+offset query params and concatenates the array responses until one
   * returns < limit items.
   */
  async paginate<T>(
    opts: Omit<DomoRequestOptions, "query"> & {
      limit?: number;
      extraQuery?: DomoRequestOptions["query"];
    },
  ): Promise<T[]> {
    const limit = opts.limit ?? 50;
    let offset = 0;
    const results: T[] = [];
    while (true) {
      const batch = await this.request<T[]>({
        ...opts,
        query: { ...(opts.extraQuery ?? {}), limit, offset },
      });
      if (!Array.isArray(batch) || batch.length === 0) break;
      results.push(...batch);
      if (batch.length < limit) break;
      offset += limit;
      if (offset > 100_000) {
        // Hard safety cap to avoid runaway pagination.
        logger.warn(`Pagination safety cap hit at offset=${offset} for ${opts.path}`);
        break;
      }
    }
    return results;
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable>";
  }
}
