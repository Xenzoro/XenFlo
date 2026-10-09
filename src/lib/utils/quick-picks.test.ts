import { describe, expect, it } from "vitest";
import { QUICK_PICKS, pickAction } from "./quick-picks";

describe("pickAction", () => {
  it("stores a pick as the value", () => {
    expect(pickAction("LLC")).toEqual({ set: "LLC" });
    expect(pickAction("11 to 50")).toEqual({ set: "11 to 50" });
    expect(pickAction("$1M to $5M")).toEqual({ set: "$1M to $5M" });
  });

  it("'Prefer not to say' and 'Not sure' count as Not applicable", () => {
    expect(pickAction("Prefer not to say")).toEqual({ notApplicable: true });
    expect(pickAction("Not sure")).toEqual({ notApplicable: true });
  });

  it("revenue offers 'Prefer not to say'", () => {
    expect(QUICK_PICKS["company.revenue"]).toContain("Prefer not to say");
  });
});
