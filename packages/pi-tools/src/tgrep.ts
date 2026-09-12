import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

export const TGREP_BIN_ENV = "TGREP_BIN";
export const TGREP_TIME_BUDGET_ENV = "TGREP_TIME_BUDGET_MS";
export const TGREP_TOOL_NAME = "tgrep";
export const TGREP_INDEX_DIR = ".tgrep";
export const TGREP_TIME_BUDGET_MS = 30_000;
export const TGREP_OUTPUT_MAX_BYTES = 200_000;
export const TGREP_CONTEXT_MAX = 20;

export interface TgrepSearchOptions {
  pattern: string;
  root: string;
  literal?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  fileType?: string | string[];
  glob?: string | string[];
  filesOnly?: boolean;
  count?: boolean;
  context?: number;
  maxCount?: number;
}

export interface TgrepResult {
  exit: number;
  stdout: string;
  stderr: string;
}

export interface TgrepExecOptions {
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

type ExecFn = (
  bin: string,
  args: string[],
  opts: TgrepExecOptions,
) => Promise<TgrepResult>;

/** Normalizes an optional scalar or list into an iterable array. */
function repeatAll(values: string | string[] | undefined): string[] {
  if (!values) return [];
  return Array.isArray(values) ? values : [values];
}

/**
 * Builds tgrep arguments for vimgrep output with literal, smart-case matching by default.
 * Clamps context and per-file limits and separates the pattern and root from options.
 */
export function buildTgrepArgs(options: TgrepSearchOptions): string[] {
  const args = ["--vimgrep"];
  args.push(options.caseSensitive ? "--case-sensitive" : "--smart-case");
  if (options.literal !== false) args.push("--fixed-strings");
  if (options.wholeWord) args.push("--word-regexp");
  for (const t of repeatAll(options.fileType)) args.push("--type", t);
  for (const g of repeatAll(options.glob)) args.push("--glob", g);
  if (options.filesOnly) args.push("--files-with-matches");
  if (options.count) args.push("--count");
  const context = clampContext(options.context);
  if (context > 0) args.push("-A", String(context), "-B", String(context));
  if (options.maxCount !== undefined)
    args.push("--max-count", String(Math.max(1, Math.floor(options.maxCount))));
  // Separator keeps patterns like "serve" or "-x" from parsing as subcommands.
  args.push("--", options.pattern, options.root);
  return args;
}

/**
 * Resolves a file or directory to a normalized path relative to the workspace.
 * Throws when the input contains glob syntax or resolves outside the workspace.
 */
export function resolveSearchRoot(pathParam: string | undefined, cwd: string): string {
  const raw = (pathParam ?? ".").trim() || ".";
  if (/[*?[{]/.test(raw))
    throw new Error(`tgrep path must be a directory or file, not a glob: ${raw}`);
  const resolved = path.resolve(cwd, raw);
  const relative = path.relative(cwd, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error(`tgrep path must stay inside the workspace: ${raw}`);
  return relative === "" ? "." : relative.split(path.sep).join("/");
}

/** Checks whether a path points to an executable regular file. */
function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Returns an explicit executable or the first executable named tgrep on the search path.
 * A nonempty but unusable explicit path returns undefined without searching the path.
 */
export function resolveTgrepBinary(explicit?: string, pathEnv = ""): string | undefined {
  const trimmed = explicit?.trim();
  if (trimmed) return isExecutable(trimmed) ? trimmed : undefined;
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, "tgrep");
    if (isExecutable(candidate)) return candidate;
  }
  return undefined;
}

/** True when the session cwd has a `.tgrep` directory (default tgrep index location). */
export function hasTgrepIndex(cwd: string): boolean {
  try {
    return fs.statSync(path.join(cwd, TGREP_INDEX_DIR)).isDirectory();
  } catch {
    return false;
  }
}

const execFileAsync = promisify(execFile);

/** Runs tgrep with bounded time and output, preserving output from normal process exits. */
async function defaultExec(
  bin: string,
  args: string[],
  opts: TgrepExecOptions,
): Promise<TgrepResult> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      cwd: opts.cwd,
      signal: opts.signal,
      timeout: opts.timeoutMs ?? TGREP_TIME_BUDGET_MS,
      maxBuffer: TGREP_OUTPUT_MAX_BYTES * 2,
    });
    return { exit: 0, stdout, stderr };
  } catch (error: unknown) {
    if (isAbortError(error) || opts.signal?.aborted) throw new Error("Operation aborted");
    const execError = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    if (execError.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER")
      return { exit: 0, stdout: execError.stdout ?? "", stderr: execError.stderr ?? "" };
    if (typeof execError.code === "number")
      return {
        exit: execError.code,
        stdout: execError.stdout ?? "",
        stderr: execError.stderr ?? "",
      };
    throw new Error(`tgrep failed to run: ${execError.message ?? String(error)}`);
  }
}

/**
 * Executes tgrep and formats its output for a tool response.
 * Rejects an already-aborted call; execution and formatting errors propagate.
 */
export async function runTgrep(
  bin: string,
  args: string[],
  opts: TgrepExecOptions,
  exec: ExecFn = defaultExec,
): Promise<string> {
  if (opts.signal?.aborted) throw new Error("Operation aborted");
  const result = await runTgrepRaw(bin, args, opts, exec);
  return formatTgrepResult(result);
}

/**
 * Executes tgrep and returns its unformatted exit code and output streams.
 * The optional executor replaces the default child-process invocation.
 */
export async function runTgrepRaw(
  bin: string,
  args: string[],
  opts: TgrepExecOptions,
  exec: ExecFn = defaultExec,
): Promise<TgrepResult> {
  return exec(bin, args, opts);
}

/**
 * Formats tgrep output, preserving the first stderr line and truncating oversized results.
 * Treats exit 1 or empty stdout as no matches and throws for exit 2.
 */
export function formatTgrepResult(result: TgrepResult): string {
  const warning = result.stderr.trim().split("\n")[0]?.trim();
  const notice = warning ? `[tgrep: ${warning}]\n` : "";
  if (result.exit === 2)
    throw new Error(`tgrep search failed: ${warning || "unknown error"}`);
  const budget = Math.max(0, TGREP_OUTPUT_MAX_BYTES - Buffer.byteLength(notice));
  const body = truncateBytes(result.stdout.trim(), budget);
  if (result.exit === 1 || body === "") return `${notice}No matches found`;
  return `${notice}${body}`;
}

/** Truncates oversized output on a UTF-8 character boundary. */
function truncateBytes(text: string, maxBytes = TGREP_OUTPUT_MAX_BYTES): string {
  const buf = Buffer.from(text);
  if (buf.length <= maxBytes) return text;
  const hint = (omitted: number) =>
    `\n… [truncated ${omitted} bytes: narrow with fileType/glob]`;
  const reserved = Buffer.byteLength(hint(buf.length));
  if (reserved >= maxBytes) {
    let end = maxBytes;
    while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
    return buf.subarray(0, end).toString();
  }
  let end = maxBytes - reserved;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  return `${buf.subarray(0, end).toString()}${hint(buf.length - end)}`;
}

/** Normalizes context to the supported non-negative integer range. */
function clampContext(context: number | undefined): number {
  if (!context || context < 0) return 0;
  return Math.min(Math.floor(context), TGREP_CONTEXT_MAX);
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  return (error as { code?: unknown }).code === "ABORT_ERR";
}
