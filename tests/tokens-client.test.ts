import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { TokensSchemaError, tokensFetch } from "../lib/tokens-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Tokens client errors", () => {
  it("preserves an upstream not-found status without retrying", async () => {
    vi.stubEnv("TOKENS_XYZ_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => new Response("missing", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(tokensFetch("/missing", z.object({}), { retries: 2 })).rejects.toMatchObject({ status: 404, retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses a typed schema error and does not retry it", async () => {
    vi.stubEnv("TOKENS_XYZ_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => Response.json({ unexpected: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(tokensFetch("/invalid", z.object({ value: z.string() }), { retries: 2 })).rejects.toBeInstanceOf(TokensSchemaError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
