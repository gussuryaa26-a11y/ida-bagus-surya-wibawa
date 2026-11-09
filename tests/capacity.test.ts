import { describe, expect, it } from "vitest";
import { evaluateCapacity, getCapacityPercentage } from "@/lib/capacity";

function assess(participantCount: number, capacity: number | null) {
  return evaluateCapacity({
    participantCount,
    capacity,
    capacityVerified: true,
    allowDemoRoomData: false,
    isDemoData: false,
  });
}

describe("capacity policy", () => {
  it("uses participant / capacity × 100 and rounds to two decimals", () => {
    expect(getCapacityPercentage(55, 50)).toBe(110);
    expect(getCapacityPercentage(61, 50)).toBe(122);
    expect(getCapacityPercentage(1, 3)).toBe(33.33);
  });

  it("allows exactly 100% without a warning", () => {
    expect(assess(50, 50)).toMatchObject({
      status: "normal",
      allowed: true,
      requiresReview: false,
      warning: false,
      percentage: 100,
    });
  });

  it("allows 101–120% with a warning and Academic review flag", () => {
    expect(assess(55, 50)).toMatchObject({
      status: "warning",
      allowed: true,
      requiresReview: true,
      warning: true,
      percentage: 110,
    });
    expect(assess(60, 50)).toMatchObject({
      status: "warning",
      allowed: true,
      requiresReview: true,
      percentage: 120,
    });
  });

  it("rejects anything above 120%", () => {
    expect(assess(61, 50)).toMatchObject({
      status: "rejected",
      allowed: false,
      requiresReview: false,
      percentage: 122,
    });
    expect(assess(100, 50)).toMatchObject({
      status: "rejected",
      allowed: false,
      percentage: 200,
    });
  });

  it("fails safely for missing, zero, or invalid capacity", () => {
    for (const capacity of [null, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(assess(10, capacity)).toMatchObject({
        status: "unverified",
        allowed: false,
        requiresReview: false,
        percentage: null,
      });
    }
  });

  it("rejects unverified capacity unless demo data is explicitly allowed", () => {
    expect(
      evaluateCapacity({
        participantCount: 10,
        capacity: 50,
        capacityVerified: false,
        allowDemoRoomData: false,
        isDemoData: true,
      }).status,
    ).toBe("unverified");

    expect(
      evaluateCapacity({
        participantCount: 10,
        capacity: 50,
        capacityVerified: false,
        allowDemoRoomData: true,
        isDemoData: true,
      }).status,
    ).toBe("normal");
  });

  it("rejects invalid participant counts safely", () => {
    expect(assess(0, 50)).toMatchObject({ status: "unverified", allowed: false });
    expect(assess(Number.NaN, 50)).toMatchObject({ status: "unverified", allowed: false });
  });
});
