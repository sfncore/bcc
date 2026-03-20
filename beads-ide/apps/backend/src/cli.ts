/**
 * Secure CLI wrapper for bd, gt, and bv commands.
 * Uses execFile (not exec) to prevent shell injection vulnerabilities.
 */
import { type ExecFileOptions, execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { getWorkspaceRoot } from "./config.js";

const execFileAsync = promisify(execFile);

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CliOptions {
  /** Working directory (defaults to resolved project root via .beads/redirect) */
  cwd?: string;
  /** Timeout in milliseconds (default: 30000, cook: 60000) */
  timeout?: number;
  /** Environment variables to pass */
  env?: Record<string, string>;
}

/** Valid CLI binaries */
const ALLOWED_BINARIES = ["bd", "gt", "bv"] as const;
type AllowedBinary = (typeof ALLOWED_BINARIES)[number];

/** Validation patterns */
const PATTERNS = {
  /** Formula names: alphanumeric, underscore, dash, dot */
  formulaName: /^[a-zA-Z0-9_.-]+$/,
  /** Variable keys: alphanumeric, underscore */
  variableKey: /^[a-zA-Z0-9_]+$/,
  /** Variable values: no control characters (allow printable + common whitespace) */
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional - validating against control chars
  variableValue: /^[^\x00-\x1f]+$/,
  /** Shell metacharacters that should never appear in user input */
  shellMetachars: /[;|&`$(){}[\]<>\\'"]/,
} as const;

/** Default timeouts */
const TIMEOUTS = {
  default: 30_000,
  cook: 60_000,
} as const;

/**
 * Validates a formula name is safe for CLI usage.
 * @throws Error if validation fails
 */
export function validateFormulaName(name: string): void {
  if (!name || typeof name !== "string") {
    throw new Error("Formula name is required");
  }
  if (name.length > 256) {
    throw new Error("Formula name too long (max 256 characters)");
  }
  if (PATTERNS.shellMetachars.test(name)) {
    throw new Error(`Formula name contains forbidden characters: ${name}`);
  }
  if (!PATTERNS.formulaName.test(name)) {
    throw new Error(`Invalid formula name format: ${name}`);
  }
}

/**
 * Validates a variable key is safe for CLI usage.
 * @throws Error if validation fails
 */
export function validateVariableKey(key: string): void {
  if (!key || typeof key !== "string") {
    throw new Error("Variable key is required");
  }
  if (key.length > 128) {
    throw new Error("Variable key too long (max 128 characters)");
  }
  if (PATTERNS.shellMetachars.test(key)) {
    throw new Error(`Variable key contains forbidden characters: ${key}`);
  }
  if (!PATTERNS.variableKey.test(key)) {
    throw new Error(`Invalid variable key format: ${key}`);
  }
}

/**
 * Validates a variable value is safe for CLI usage.
 * @throws Error if validation fails
 */
export function validateVariableValue(value: string): void {
  if (typeof value !== "string") {
    throw new Error("Variable value must be a string");
  }
  if (value.length > 4096) {
    throw new Error("Variable value too long (max 4096 characters)");
  }
  if (!PATTERNS.variableValue.test(value)) {
    throw new Error("Variable value contains control characters");
  }
}

/**
 * Validates a bead ID is safe for CLI usage.
 * Bead IDs follow pattern: prefix-id (e.g., bcc-abc123)
 * @throws Error if validation fails
 */
export function validateBeadId(id: string): void {
  if (!id || typeof id !== "string") {
    throw new Error("Bead ID is required");
  }
  if (id.length > 128) {
    throw new Error("Bead ID too long (max 128 characters)");
  }
  if (PATTERNS.shellMetachars.test(id)) {
    throw new Error(`Bead ID contains forbidden characters: ${id}`);
  }
  // Bead IDs: prefix-identifier with dots for hierarchy
  if (!/^[a-zA-Z0-9_-]+(-[a-zA-Z0-9_.-]+)*$/.test(id)) {
    throw new Error(`Invalid bead ID format: ${id}`);
  }
}

/**
 * Resolves the project root by following .beads/redirect if present.
 */
export function resolveProjectRoot(startDir: string): string {
  let dir = resolve(startDir);
  const maxDepth = 10;
  let depth = 0;

  while (depth < maxDepth) {
    const beadsDir = resolve(dir, ".beads");
    const redirectFile = resolve(beadsDir, "redirect");

    if (existsSync(redirectFile)) {
      const redirectTarget = readFileSync(redirectFile, "utf-8").trim();
      if (redirectTarget) {
        dir = resolve(dirname(redirectFile), redirectTarget);
        depth++;
        continue;
      }
    }

    if (existsSync(beadsDir)) {
      return dir;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
    depth++;
  }

  return startDir;
}

/**
 * Execute a CLI command securely using execFile.
 * @param binary - The CLI binary to execute (bd, gt, or bv)
 * @param args - Arguments to pass to the binary
 * @param options - Execution options
 * @returns Promise resolving to stdout, stderr, and exit code
 */
export async function runCli(
  binary: AllowedBinary,
  args: string[],
  options: CliOptions = {},
): Promise<CliResult> {
  // Validate binary
  if (!ALLOWED_BINARIES.includes(binary)) {
    throw new Error(`Invalid binary: ${binary}. Allowed: ${ALLOWED_BINARIES.join(", ")}`);
  }

  // Validate all arguments don't contain shell metacharacters in dangerous positions
  for (const arg of args) {
    if (typeof arg !== "string") {
      throw new Error("All arguments must be strings");
    }
  }

  // Resolve working directory
  const cwd = options.cwd
    ? resolveProjectRoot(options.cwd)
    : resolveProjectRoot(getWorkspaceRoot());

  // Determine timeout
  const isCookCommand = binary === "bd" && args.includes("cook");
  const timeout = options.timeout ?? (isCookCommand ? TIMEOUTS.cook : TIMEOUTS.default);

  const execOptions: ExecFileOptions = {
    cwd,
    timeout,
    maxBuffer: 10 * 1024 * 1024, // 10MB
    encoding: "utf-8",
    env: {
      ...process.env,
      ...options.env,
    },
  };

  try {
    const { stdout, stderr } = await execFileAsync(binary, args, execOptions);
    return {
      stdout: String(stdout ?? ""),
      stderr: String(stderr ?? ""),
      exitCode: 0,
    };
  } catch (error: unknown) {
    // Handle execFile errors (includes non-zero exit codes)
    if (error && typeof error === "object" && "code" in error) {
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number | string;
        killed?: boolean;
        signal?: string;
      };

      // Timeout
      if (execError.killed || execError.signal === "SIGTERM") {
        return {
          stdout: execError.stdout ?? "",
          stderr: `Command timed out after ${timeout}ms`,
          exitCode: 124, // Standard timeout exit code
        };
      }

      // Non-zero exit
      const exitCode = typeof execError.code === "number" ? execError.code : 1;
      return {
        stdout: execError.stdout ?? "",
        stderr: execError.stderr ?? "",
        exitCode,
      };
    }

    // Unknown error
    throw error;
  }
}

/**
 * Run bd cook command with validated inputs.
 */
export async function bdCook(
  formulaPath: string,
  vars?: Record<string, string>,
  options?: CliOptions,
): Promise<CliResult> {
  validateFormulaName(formulaPath.replace(/\.formula\.(toml|json)$/, "").replace(/^.*\//, ""));

  const args = ["cook", formulaPath, "--json"];

  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      validateVariableKey(key);
      validateVariableValue(value);
      args.push("--var", `${key}=${value}`);
    }
  }

  return runCli("bd", args, {
    ...options,
    timeout: options?.timeout ?? TIMEOUTS.cook,
  });
}

/**
 * Run bd show command with validated bead ID.
 */
export async function bdShow(beadId: string, options?: CliOptions): Promise<CliResult> {
  validateBeadId(beadId);
  return runCli("bd", ["show", beadId], options);
}

/**
 * Run bv robot-graph command for JSON graph output.
 */
export async function bvGraph(
  format: "json" | "dot" | "mermaid" = "json",
  options?: CliOptions,
): Promise<CliResult> {
  return runCli("bv", ["--robot-graph", "--graph-format", format, "--dolt"], options);
}

/**
 * Run bv robot-insights command for JSON insights.
 */
export async function bvInsights(options?: CliOptions): Promise<CliResult> {
  return runCli("bv", ["--robot-insights", "--dolt"], options);
}

/**
 * Run gt hook command to check hooked work.
 */
export async function gtHook(options?: CliOptions): Promise<CliResult> {
  return runCli("gt", ["hook"], options);
}

/**
 * Validates a sling target is safe for CLI usage.
 * Target format: rig/polecats/name or rig/crew/name
 * @throws Error if validation fails
 */
export function validateSlingTarget(target: string): void {
  if (!target || typeof target !== "string") {
    throw new Error("Sling target is required");
  }
  if (target.length > 256) {
    throw new Error("Sling target too long (max 256 characters)");
  }
  if (PATTERNS.shellMetachars.test(target)) {
    throw new Error(`Sling target contains forbidden characters: ${target}`);
  }
  // Target format: rig/polecats/name or rig/crew/name
  if (!/^[a-zA-Z0-9_-]+\/(polecats|crew)\/[a-zA-Z0-9_-]+$/.test(target)) {
    throw new Error(
      `Invalid sling target format: ${target}. Expected: rig/polecats/name or rig/crew/name`,
    );
  }
}

/**
 * Run gt sling command to dispatch a formula to a target.
 */
export async function gtSling(
  formulaPath: string,
  target: string,
  vars?: Record<string, string>,
  options?: CliOptions,
): Promise<CliResult> {
  validateFormulaName(formulaPath.replace(/\.formula\.(toml|json)$/, "").replace(/^.*\//, ""));
  validateSlingTarget(target);

  const args = ["sling", formulaPath, "--to", target];

  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      validateVariableKey(key);
      validateVariableValue(value);
      args.push("--var", `${key}=${value}`);
    }
  }

  return runCli("gt", args, {
    ...options,
    timeout: options?.timeout ?? TIMEOUTS.cook, // Use cook timeout for sling
  });
}

/**
 * Validate a proto ID for CLI usage.
 * Proto IDs can be formula names or bead IDs.
 * @throws Error if validation fails
 */
export function validateProtoId(protoId: string): void {
  if (!protoId || typeof protoId !== "string") {
    throw new Error("Proto ID is required");
  }
  if (protoId.length > 256) {
    throw new Error("Proto ID too long (max 256 characters)");
  }
  if (PATTERNS.shellMetachars.test(protoId)) {
    throw new Error(`Proto ID contains forbidden characters: ${protoId}`);
  }
  // Allow formula names (alphanumeric, underscore, dash, dot) or bead IDs
  if (!/^[a-zA-Z0-9_.-]+(-[a-zA-Z0-9_.-]+)*$/.test(protoId)) {
    throw new Error(`Invalid proto ID format: ${protoId}`);
  }
}

/**
 * Run bd mol pour command with validated inputs.
 */
export async function bdPour(
  protoId: string,
  vars?: Record<string, string>,
  options?: {
    assignee?: string;
    dryRun?: boolean;
  } & CliOptions,
): Promise<CliResult> {
  validateProtoId(protoId);

  const args = ["mol", "pour", protoId, "--json"];

  if (options?.assignee) {
    // Validate assignee (similar to variable key)
    if (PATTERNS.shellMetachars.test(options.assignee)) {
      throw new Error(`Assignee contains forbidden characters: ${options.assignee}`);
    }
    args.push("--assignee", options.assignee);
  }

  if (options?.dryRun) {
    args.push("--dry-run");
  }

  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      validateVariableKey(key);
      validateVariableValue(value);
      args.push("--var", `${key}=${value}`);
    }
  }

  return runCli("bd", args, {
    ...options,
    timeout: options?.timeout ?? TIMEOUTS.cook, // Same timeout as cook
  });
}

/**
 * Run bd mol burn command with validated inputs.
 */
export async function bdBurn(
  moleculeId: string,
  options?: {
    force?: boolean;
    dryRun?: boolean;
  } & CliOptions,
): Promise<CliResult> {
  validateBeadId(moleculeId);

  const args = ["mol", "burn", moleculeId, "--json"];

  if (options?.force) {
    args.push("--force");
  }

  if (options?.dryRun) {
    args.push("--dry-run");
  }

  return runCli("bd", args, options);
}
