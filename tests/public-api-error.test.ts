import { describe, expect, it } from "vitest";
import { publicAssetError } from "../lib/public-api-error";

describe("public API errors", () => {
  it("maps an upstream asset 404 to a user-facing 404", () => {
    const error = Object.assign(new Error("Tokens API returned 404"), {
      name: "TokensHttpError",
      status: 404,
    });
    expect(publicAssetError(error, "Unavailable")).toEqual({
      status: 404,
      error: "This asset does not exist",
    });
  });

  it("keeps other failures generic", () => {
    expect(publicAssetError(new Error("upstream request ID"), "Unavailable")).toEqual({
      status: 502,
      error: "Unavailable",
    });
  });
});
