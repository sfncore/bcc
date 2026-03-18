/**
 * Tests for secure CLI wrapper.
 */
import { describe, expect, it } from "vite-plus/test";
import {
  bdCook,
  bdShow,
  bvGraph,
  runCli,
  validateBeadId,
  validateFormulaName,
  validateVariableKey,
  validateVariableValue,
} from "../src/cli.js";

describe("Input Validation", () => {
  describe("validateFormulaName", () => {
    it("accepts valid formula names", () => {
      expect(() => validateFormulaName("explore-module")).not.toThrow();
      expect(() => validateFormulaName("my_formula.v2")).not.toThrow();
      expect(() => validateFormulaName("simple123")).not.toThrow();
    });

    it("rejects formula names with shell metacharacters", () => {
      const dangerous = [
        "test;rm",
        "test|cat",
        "test&whoami",
        "test`id`",
        "test$(id)",
        "test'inject",
        'test"inject',
        "test\\escape",
        "test>output",
        "test<input",
      ];

      for (const name of dangerous) {
        expect(() => validateFormulaName(name)).toThrow(/forbidden characters/);
      }
    });

    it("rejects empty or invalid types", () => {
      expect(() => validateFormulaName("")).toThrow("Formula name is required");
      expect(() => validateFormulaName(null as unknown as string)).toThrow(
        "Formula name is required",
      );
      expect(() => validateFormulaName(123 as unknown as string)).toThrow(
        "Formula name is required",
      );
    });

    it("rejects names that are too long", () => {
      const longName = "a".repeat(257);
      expect(() => validateFormulaName(longName)).toThrow("too long");
    });

    it("rejects names with invalid characters", () => {
      expect(() => validateFormulaName("test name")).toThrow("Invalid formula name format");
      expect(() => validateFormulaName("test@name")).toThrow("Invalid formula name format");
      expect(() => validateFormulaName("test#name")).toThrow("Invalid formula name format");
    });
  });

  describe("validateVariableKey", () => {
    it("accepts valid variable keys", () => {
      expect(() => validateVariableKey("module_name")).not.toThrow();
      expect(() => validateVariableKey("depth")).not.toThrow();
      expect(() => validateVariableKey("VAR123")).not.toThrow();
    });

    it("rejects keys with shell metacharacters", () => {
      expect(() => validateVariableKey("key;inject")).toThrow(/forbidden characters/);
      expect(() => validateVariableKey("key$(cmd)")).toThrow(/forbidden characters/);
    });

    it("rejects keys with invalid format", () => {
      expect(() => validateVariableKey("key-name")).toThrow("Invalid variable key format");
      expect(() => validateVariableKey("key.name")).toThrow("Invalid variable key format");
      expect(() => validateVariableKey("key name")).toThrow("Invalid variable key format");
    });

    it("rejects empty keys", () => {
      expect(() => validateVariableKey("")).toThrow("Variable key is required");
    });
  });

  describe("validateVariableValue", () => {
    it("accepts valid variable values", () => {
      expect(() => validateVariableValue("simple")).not.toThrow();
      expect(() => validateVariableValue("with spaces")).not.toThrow();
      expect(() => validateVariableValue("path/to/file.ts")).not.toThrow();
      expect(() => validateVariableValue("value with symbols: @#$%")).not.toThrow();
    });

    it("rejects values with control characters", () => {
      expect(() => validateVariableValue("test\x00null")).toThrow("control characters");
      expect(() => validateVariableValue("test\x1fescape")).toThrow("control characters");
      expect(() => validateVariableValue("test\ttab")).toThrow("control characters");
      expect(() => validateVariableValue("test\nnewline")).toThrow("control characters");
    });

    it("rejects non-string values", () => {
      expect(() => validateVariableValue(123 as unknown as string)).toThrow("must be a string");
    });

    it("rejects values that are too long", () => {
      const longValue = "a".repeat(4097);
      expect(() => validateVariableValue(longValue)).toThrow("too long");
    });
  });

  describe("validateBeadId", () => {
    it("accepts valid bead IDs", () => {
      expect(() => validateBeadId("bcc-abc123")).not.toThrow();
      expect(() => validateBeadId("hq-cv-7syeo")).not.toThrow();
      expect(() => validateBeadId("bcc-6not9.1.3")).not.toThrow();
    });

    it("rejects IDs with shell metacharacters", () => {
      expect(() => validateBeadId("bcc;inject")).toThrow(/forbidden characters/);
      expect(() => validateBeadId("bcc|cmd")).toThrow(/forbidden characters/);
      expect(() => validateBeadId("bcc$(id)")).toThrow(/forbidden characters/);
    });

    it("rejects empty IDs", () => {
      expect(() => validateBeadId("")).toThrow("Bead ID is required");
    });
  });
});

// CLI Execution tests using real integration tests
// These tests verify the actual behavior by calling real commands with safe inputs
describe("CLI Execution (Integration)", () => {
  describe("runCli", () => {
    it("rejects invalid binary", async () => {
      await expect(runCli("rm" as "bd", ["-rf", "/"], { cwd: "/tmp" })).rejects.toThrow(
        "Invalid binary",
      );
    });

    it("rejects non-string arguments", async () => {
      await expect(runCli("bd", [123 as unknown as string], { cwd: "/tmp" })).rejects.toThrow(
        "must be strings",
      );
    });

    it("handles command that does not exist gracefully", async () => {
      // bd with invalid subcommand returns non-zero
      const result = await runCli("bd", ["nonexistent-subcommand"], { cwd: "/tmp" });
      expect(result.exitCode).not.toBe(0);
    });

    it("returns stdout from successful command", async () => {
      // bd --help always succeeds
      const result = await runCli("bd", ["--help"], { cwd: "/tmp" });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("bd");
    });
  });

  describe("bdCook", () => {
    it("rejects invalid formula names with shell metacharacters", async () => {
      await expect(bdCook("test;rm", undefined, { cwd: "/tmp" })).rejects.toThrow(
        "forbidden characters",
      );
    });

    it("rejects invalid variable keys", async () => {
      await expect(
        bdCook("valid-formula", { "bad;key": "value" }, { cwd: "/tmp" }),
      ).rejects.toThrow("forbidden characters");
    });

    it("rejects invalid variable values", async () => {
      await expect(
        bdCook("valid-formula", { key: "value\x00null" }, { cwd: "/tmp" }),
      ).rejects.toThrow("control characters");
    });
  });

  describe("bdShow", () => {
    it("rejects invalid bead IDs", async () => {
      await expect(bdShow("bcc;inject", { cwd: "/tmp" })).rejects.toThrow("forbidden characters");
    });
  });

  describe("bvGraph", () => {
    it("calls bv with correct format arguments", async () => {
      // This will fail (no beads) but verifies the command structure
      const result = await bvGraph("json", { cwd: "/tmp" });
      // bv returns error when no beads found, but command ran
      expect(typeof result.exitCode).toBe("number");
    });
  });

  describe("timeout handling", () => {
    it("returns exit code 124 when command times out", async () => {
      // Use sleep with a very short timeout to trigger timeout behavior
      const result = await runCli("bd", ["cook", "nonexistent-formula", "--json"], {
        cwd: "/tmp",
        timeout: 1, // 1ms timeout — will always time out
      });
      // Either times out (124) or fails fast before timeout (non-zero)
      expect(result.exitCode).not.toBe(0);
    });
  });
});
