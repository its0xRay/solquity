import { describe, expect, it, vi } from "vitest";
import { checkSource, sourceText } from "../lib/issuer-source-check";
const source = {id:"test-unreviewed",label:"Test source",url:"https://docs.xstocks.fi/test"};
describe("source changes are not editorial verification", () => {
  it("strips scripts and document chrome before comparing source text", () => {
    expect(sourceText('<main><nav>Menu</nav><p>Shares &amp; tokens</p><script>secret()</script></main>')).toBe("Shares & tokens");
  });
  it("records a real check without inventing an approved baseline or new review date", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(`<main>${"Source content. ".repeat(40)}</main>`));
    const result = await checkSource(source,"2026-10-25",fetcher);
    expect(result.status).toBe("unreviewed");
    expect(result.contentHash).toHaveLength(64);
    expect(result.reviewedAt).toBe("2026-10-25");
    expect(fetcher.mock.calls[0][0]).toBe(source.url);
    expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  });
  it("treats failures and blocked responses as unavailable rather than unsupported", async () => {
    const failed = await checkSource(source,"2026-10-25",vi.fn().mockRejectedValue(new Error("secret should not escape")));
    expect(failed.status).toBe("unavailable");
    expect(JSON.stringify(failed)).not.toContain("secret");
    const blocked = await checkSource(source,"2026-10-25",vi.fn().mockResolvedValue(new Response("Access denied")));
    expect(blocked.status).toBe("unavailable");
  });
});
