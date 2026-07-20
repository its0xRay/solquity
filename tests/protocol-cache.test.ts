import { describe, expect, it } from "vitest";
import { isProtocolCacheFresh, PROTOCOL_CAPABILITY_TTL_MS } from "../lib/protocol-cache";

const response = { capabilities: [], providers: {}, fetchedAt: 1 };

describe("protocol capability browser cache", () => {
  it("refreshes after the protocol TTL", () => {
    const entry = { response, cachedAt: 1_000 };
    expect(isProtocolCacheFresh(entry, 1_000 + PROTOCOL_CAPABILITY_TTL_MS - 1)).toBe(true);
    expect(isProtocolCacheFresh(entry, 1_000 + PROTOCOL_CAPABILITY_TTL_MS)).toBe(false);
  });
});
