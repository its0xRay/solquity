import { describe, expect, it } from "vitest";
import { sourceData, sourceFailure, sourcePartial, sourceStale, sourceSuccess } from "../lib/source-result";

describe("source outcomes", () => {
  it("does not turn failure into a successful empty response", () => {
    const empty = sourceSuccess<string[]>([]);
    const failed = sourceFailure<string[]>(new Error("timeout"));
    expect(empty.status).toBe("success");
    expect(failed.status).toBe("failed");
    expect(sourceData(failed, [])).toEqual([]);
    expect(failed).toHaveProperty("error.code", "SOURCE_REQUEST_FAILED");
  });

  it("preserves a prior observation as explicitly stale", () => {
    const stale = sourceStale(["prior"], 100, new Error("timeout"), 200);
    expect(sourceData(stale, [])).toEqual(["prior"]);
    expect(stale).toMatchObject({ status: "stale", observedAt: 100, fetchedAt: 200, error: { code: "SOURCE_STALE" } });
  });

  it("keeps verified records while marking a provider response as partial", () => {
    const partial = sourcePartial(["verified"], 2, 300);
    expect(partial).toMatchObject({ status: "success", data: ["verified"], fetchedAt: 300, partial: { failedItems: 2 } });
  });
});
