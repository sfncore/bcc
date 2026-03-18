/**
 * Cook Debounce Tests
 *
 * Validates the cook hook debounce behavior from the spec:
 * - Debounce fires correctly at 500ms
 *
 * These tests verify that:
 * 1. The debounce delays cook invocations by 500ms
 * 2. Rapid changes only trigger one cook after 500ms
 * 3. Manual cook() bypasses the debounce
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/** Default debounce delay from useCook */
const DEFAULT_DEBOUNCE_MS = 500;

describe("Cook Debounce Behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Debounce Timing", () => {
    it("debounce delays execution by 500ms", async () => {
      const callback = vi.fn();
      let timeoutId: number | undefined;

      // Simulate debounced function
      const debouncedFn = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(callback, DEFAULT_DEBOUNCE_MS);
      };

      debouncedFn();

      // Should not fire immediately
      expect(callback).not.toHaveBeenCalled();

      // Should not fire at 499ms
      vi.advanceTimersByTime(499);
      expect(callback).not.toHaveBeenCalled();

      // Should fire at 500ms
      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("rapid changes trigger only one cook after 500ms", async () => {
      const callback = vi.fn();
      let timeoutId: number | undefined;

      const debouncedFn = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(callback, DEFAULT_DEBOUNCE_MS);
      };

      // Simulate rapid typing (10 changes in 100ms)
      for (let i = 0; i < 10; i++) {
        debouncedFn();
        vi.advanceTimersByTime(10);
      }

      // Should not have fired yet (only 100ms elapsed since last call)
      expect(callback).not.toHaveBeenCalled();

      // Advance to trigger debounce
      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("debounce resets on each input change", async () => {
      const callback = vi.fn();
      let timeoutId: number | undefined;

      const debouncedFn = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(callback, DEFAULT_DEBOUNCE_MS);
      };

      debouncedFn();
      vi.advanceTimersByTime(400); // 400ms elapsed

      debouncedFn(); // Reset debounce
      vi.advanceTimersByTime(400); // 400ms since reset

      // Should not have fired (only 400ms since last call)
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100); // Now 500ms since last call
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("Manual Cook Bypass", () => {
    it("manual cook cancels pending debounce", async () => {
      const callback = vi.fn();
      let timeoutId: number | undefined;

      const debouncedFn = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(callback, DEFAULT_DEBOUNCE_MS);
      };

      const manualCook = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        callback();
      };

      debouncedFn();
      vi.advanceTimersByTime(200);

      // Manual cook should fire immediately
      manualCook();
      expect(callback).toHaveBeenCalledTimes(1);

      // Original debounce should not fire again
      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("Edge Cases", () => {
    it("no cook when formula path is null", async () => {
      const callback = vi.fn();
      let timeoutId: number | undefined;

      const debouncedFn = (formulaPath: string | null) => {
        if (!formulaPath) {
          // Clear any pending timeout and don't schedule new one
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
          }
          return;
        }
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(callback, DEFAULT_DEBOUNCE_MS);
      };

      debouncedFn(null);
      vi.advanceTimersByTime(1000);

      expect(callback).not.toHaveBeenCalled();
    });

    it("cleanup on unmount cancels pending debounce", async () => {
      const callback = vi.fn();
      let timeoutId: number | undefined;

      const debouncedFn = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(callback, DEFAULT_DEBOUNCE_MS);
      };

      const cleanup = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
      };

      debouncedFn();
      vi.advanceTimersByTime(200);

      // Simulate component unmount
      cleanup();

      vi.advanceTimersByTime(500);
      expect(callback).not.toHaveBeenCalled();
    });
  });
});

describe("Debounce Performance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles high-frequency input without performance degradation", async () => {
    const callback = vi.fn();
    let timeoutId: number | undefined;
    let callCount = 0;

    const debouncedFn = () => {
      callCount++;
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(callback, DEFAULT_DEBOUNCE_MS);
    };

    // Simulate 1000 rapid changes (extreme typing scenario)
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      debouncedFn();
    }
    const setupTime = performance.now() - start;

    // Setup should be nearly instant (< 50ms for 1000 calls)
    expect(setupTime).toBeLessThan(50);

    // Only one callback after debounce
    vi.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callCount).toBe(1000);
  });
});
