import { z } from "zod";
import { log } from "./logger";

const API_BASE = "https://api.tokens.xyz/v1";
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export class TokensHttpError extends Error {
  constructor(readonly status: number, message: string, readonly retryable: boolean) {
    super(message);
    this.name = "TokensHttpError";
  }
}

export class TokensSchemaError extends Error {
  constructor() {
    super("Tokens API response did not match the expected schema");
    this.name = "TokensSchemaError";
  }
}

export function isTokensNotFoundError(error: unknown): error is TokensHttpError {
  return (
    error instanceof Error &&
    error.name === "TokensHttpError" &&
    "status" in error &&
    error.status === 404
  );
}

export type TokensRequestOptions = { revalidate?: number; timeoutMs?: number; retries?: number };

function apiKey() {
  const value = process.env.TOKENS_XYZ_API_KEY;
  if (!value) throw new Error("TOKENS_XYZ_API_KEY is not configured");
  return value;
}

export async function tokensFetch<T>(path: string, schema: z.ZodType<T>, options: TokensRequestOptions = {}): Promise<T> {
  const { revalidate = 120, timeoutMs = 8_000, retries = 2 } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: { "x-api-key": apiKey(), "content-type": "application/json" },
        next: { revalidate },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const requestId = response.headers.get("x-request-id");
        await response.body?.cancel().catch(() => undefined);
        const error = new TokensHttpError(response.status, `Tokens API returned ${response.status}${requestId ? ` (${requestId})` : ""}`, RETRYABLE.has(response.status));
        if (!RETRYABLE.has(response.status) || attempt === retries) throw error;
        lastError = error;
      } else {
        const parsed = schema.safeParse(await response.json());
        if (!parsed.success) {
          log("error", "tokens.schema_invalid", { path, issues: parsed.error.issues.slice(0, 5) });
          throw new TokensSchemaError();
        }
        return parsed.data;
      }
    } catch (error) {
      lastError = error;
      if (attempt === retries || error instanceof TokensHttpError && !error.retryable || error instanceof TokensSchemaError) break;
    }
    log("warn", "tokens.request_retry", { path, attempt: attempt + 1, durationMs: Date.now() - startedAt });
    await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
  }

  log("error", "tokens.request_failed", { path, message: lastError instanceof Error ? lastError.message : "Unknown error" });
  throw lastError instanceof Error ? lastError : new Error("Tokens API request failed");
}
