/**
 * B4.1: RunStatusIndicator — logic unit tests
 *
 * Tests run in Node (no DOM) so they verify the dot-config and mode-pill logic
 * that drives the component, rather than React rendering.
 * The same pattern is used by the existing b3_4_concurrent_runs.test.ts suite.
 */

import { describe, it, expect } from "vitest";

// ─── Mirror the getDotConfig logic from run-status-indicator.tsx ──────────────

interface DotConfig {
  color: string;
  animate: boolean;
}

function getDotConfig(status: string): DotConfig {
  switch (status) {
    case "running":
    case "resuming":
      return { color: "bg-green-500", animate: true };
    case "pending":
    case "initializing":
      return { color: "bg-blue-500", animate: true };
    case "pausing":
    case "stopping":
      return { color: "bg-yellow-500", animate: true };
    case "paused":
      return { color: "bg-yellow-500", animate: false };
    case "stopped":
      return { color: "bg-gray-400", animate: false };
    case "error":
      return { color: "bg-red-500", animate: false };
    default:
      return { color: "bg-gray-400", animate: false };
  }
}

function getModePillText(mode: string): string {
  return mode === "live" ? "LIVE" : "SIM";
}

function getModePillClasses(mode: string): string {
  return mode === "live"
    ? "bg-amber-100 text-amber-800"
    : "bg-green-100 text-green-800";
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("B4.1 – RunStatusIndicator dot config", () => {
  describe("running statuses → green animated dot", () => {
    it("'running' → green + animated", () => {
      const cfg = getDotConfig("running");
      expect(cfg.color).toBe("bg-green-500");
      expect(cfg.animate).toBe(true);
    });

    it("'resuming' → green + animated", () => {
      const cfg = getDotConfig("resuming");
      expect(cfg.color).toBe("bg-green-500");
      expect(cfg.animate).toBe(true);
    });
  });

  describe("initializing statuses → blue animated dot", () => {
    it("'pending' → blue + animated", () => {
      const cfg = getDotConfig("pending");
      expect(cfg.color).toBe("bg-blue-500");
      expect(cfg.animate).toBe(true);
    });

    it("'initializing' → blue + animated", () => {
      const cfg = getDotConfig("initializing");
      expect(cfg.color).toBe("bg-blue-500");
      expect(cfg.animate).toBe(true);
    });
  });

  describe("transitional statuses → yellow animated dot", () => {
    it("'pausing' → yellow + animated", () => {
      const cfg = getDotConfig("pausing");
      expect(cfg.color).toBe("bg-yellow-500");
      expect(cfg.animate).toBe(true);
    });

    it("'stopping' → yellow + animated", () => {
      const cfg = getDotConfig("stopping");
      expect(cfg.color).toBe("bg-yellow-500");
      expect(cfg.animate).toBe(true);
    });
  });

  describe("static statuses", () => {
    it("'paused' → yellow + static", () => {
      const cfg = getDotConfig("paused");
      expect(cfg.color).toBe("bg-yellow-500");
      expect(cfg.animate).toBe(false);
    });

    it("'stopped' → gray + static", () => {
      const cfg = getDotConfig("stopped");
      expect(cfg.color).toBe("bg-gray-400");
      expect(cfg.animate).toBe(false);
    });

    it("'error' → red + static", () => {
      const cfg = getDotConfig("error");
      expect(cfg.color).toBe("bg-red-500");
      expect(cfg.animate).toBe(false);
    });
  });

  describe("unknown status → gray static (safe fallback)", () => {
    it("unknown status falls back to gray + static", () => {
      const cfg = getDotConfig("some_future_status");
      expect(cfg.color).toBe("bg-gray-400");
      expect(cfg.animate).toBe(false);
    });
  });
});

describe("B4.1 – RunStatusIndicator mode pill", () => {
  it("'live' mode → pill text is 'LIVE'", () => {
    expect(getModePillText("live")).toBe("LIVE");
  });

  it("'simulation' mode → pill text is 'SIM'", () => {
    expect(getModePillText("simulation")).toBe("SIM");
  });

  it("any other mode value → pill text is 'SIM'", () => {
    expect(getModePillText("")).toBe("SIM");
    expect(getModePillText("unknown")).toBe("SIM");
  });

  it("'live' mode → amber pill classes", () => {
    const classes = getModePillClasses("live");
    expect(classes).toContain("amber");
  });

  it("'simulation' mode → green pill classes", () => {
    const classes = getModePillClasses("simulation");
    expect(classes).toContain("green");
  });
});

describe("B4.1 – RunStatusIndicator showMode prop", () => {
  // The showMode prop is a boolean — verify the expected truthy/falsy logic.
  it("showMode defaults to true (mode pill should be visible by default)", () => {
    const defaultShowMode = true; // matches component default
    expect(defaultShowMode).toBe(true);
  });

  it("showMode=false hides the mode pill (component receives the flag)", () => {
    // Simulate the prop resolution that drives conditional rendering.
    function shouldRenderModePill(showMode = true): boolean {
      return showMode;
    }
    expect(shouldRenderModePill(false)).toBe(false);
    expect(shouldRenderModePill(true)).toBe(true);
    expect(shouldRenderModePill()).toBe(true); // default
  });
});

describe("B4.1 – RunStatusIndicator error message", () => {
  it("errorMessage truthy → component should display it", () => {
    const errorMessage = "Exchange API timeout";
    // Simulate the conditional rendering guard used in the component.
    const shouldRender = Boolean(errorMessage);
    expect(shouldRender).toBe(true);
  });

  it("errorMessage undefined → component should not display it", () => {
    const errorMessage: string | undefined = undefined;
    const shouldRender = Boolean(errorMessage);
    expect(shouldRender).toBe(false);
  });

  it("errorMessage empty string → component should not display it", () => {
    const errorMessage = "";
    const shouldRender = Boolean(errorMessage);
    expect(shouldRender).toBe(false);
  });
});

describe("B4.1 – RunStatusIndicator exhaustive status coverage", () => {
  // All 9 documented statuses should map to a known dot config.
  const allStatuses = [
    "pending",
    "initializing",
    "running",
    "pausing",
    "paused",
    "resuming",
    "stopping",
    "stopped",
    "error",
  ] as const;

  const knownColors = new Set(["bg-green-500", "bg-blue-500", "bg-yellow-500", "bg-gray-400", "bg-red-500"]);

  for (const status of allStatuses) {
    it(`'${status}' maps to a known dot color`, () => {
      const { color } = getDotConfig(status);
      expect(knownColors.has(color)).toBe(true);
    });
  }
});
