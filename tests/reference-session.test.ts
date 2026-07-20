import { describe, expect, it } from "vitest";
import { referenceSession } from "../lib/reference-session";

describe("US reference session", () => {
  it("recognizes a regular open session and a holiday", () => {
    expect(referenceSession(new Date("2026-07-13T14:00:00Z"))).toEqual({ supported: true, isOpen: true });
    expect(referenceSession(new Date("2026-12-25T16:00:00Z"))).toEqual({ supported: true, isOpen: false });
  });

  it("omits claims for calendar years without reviewed dates", () => {
    expect(referenceSession(new Date("2028-07-10T14:00:00Z"))).toEqual({ supported: false, isOpen: false });
  });
});
