import { describe, it, expect } from "vitest";
import { describeRankChange } from "./rankChange";

// rankChange7d = rank now minus rank seven days ago, so NEGATIVE means the person moved UP.
describe("describeRankChange (B-053)", () => {
  it("a negative number is an up arrow with the places gained", () => {
    const view = describeRankChange(-3);
    expect(view).toMatchObject({ direction: "up", arrow: "▲", figure: "3" });
    expect(view.label).toBe("Up 3 places over the last 7 days");
  });

  it("a positive number is a down arrow with the places lost", () => {
    const view = describeRankChange(2);
    expect(view).toMatchObject({ direction: "down", arrow: "▼", figure: "2" });
    expect(view.label).toBe("Down 2 places over the last 7 days");
  });

  it("zero has no arrow and is a real zero, not a dash", () => {
    expect(describeRankChange(0)).toMatchObject({ direction: "same", arrow: null, figure: "0" });
  });

  it("null (not on the board seven days ago) has no arrow and shows a dash, never 0", () => {
    const view = describeRankChange(null);
    expect(view).toMatchObject({ direction: "none", arrow: null, figure: "—" });
    expect(describeRankChange(undefined)).toMatchObject({ direction: "none", arrow: null, figure: "—" });
  });

  it("uses the singular for one place", () => {
    expect(describeRankChange(-1).label).toBe("Up 1 place over the last 7 days");
    expect(describeRankChange(1).label).toBe("Down 1 place over the last 7 days");
  });
});
