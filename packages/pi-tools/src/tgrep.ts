import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

export const TGREP_BIN_ENV = "TGREP_BIN";
export const TGREP_TOOL_NAME = "tgrep";
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
  noIndex?: boolean;
}

export interface TgrepResult {
  exit: number;
  stdout: string;
  stderr: string;
}

type ExecFn = (
  bin: string,
  args: string[],
  opts: { cwd: string; signal?: AbortSignal },
) => Promise<TgrepResult>;

function repeatAll(values: string | string[] | undefined): string[] {
  if (!values) return [];
  return Array.isArray(values) ? values : [values];
}

// Allowlist of index-friendly flags. Full-scan forcers (--hidden, --no-ignore,
// -u, -a/--text, -E/--encoding) are excluded: they silently bypass the index.
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
  if (options.noIndex) args.push("--no-index");
  // Separator keeps patterns like "serve" or "-x" from parsing as subcommands.
  args.push("--", options.pattern, options.root);
  return args;
}

// Resolve the search root under cwd. Anything escaping the workspace is rejected.
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

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

// Explicit path wins; a set-but-missing explicit path disables rather than
// falling back to PATH so a typo surfaces instead of silently changing tools.
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

const execFileAsync = promisify(execFile);

async function defaultExec(
  bin: string,
  args: string[],
  opts: { cwd: string; signal?: AbortSignal },
): Promise<TgrepResult> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      cwd: opts.cwd,
      signal: opts.signal,
      timeout: TGREP_TIME_BUDGET_MS,
      maxBuffer: TGREP_OUTPUT_MAX_BYTES * 2,
    });
    return { exit: 0, stdout, stderr };
  } catch (error: unknown) {
    const execError = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    if (typeof execError.code === "number")
      return {
        exit: execError.code,
        stdout: execError.stdout ?? "",
        stderr: execError.stderr ?? "",
      };
    throw new Error(`tgrep failed to run: ${execError.message ?? String(error)}`);
  }
}

export async function runTgrep(
  bin: string,
  args: string[],
  opts: { cwd: string; signal?: AbortSignal },
  exec: ExecFn = defaultExec,
): Promise<string> {
  if (opts.signal?.aborted) throw new Error("Operation aborted");
  const result = await runTgrepRaw(bin, args, opts, exec);
  return formatTgrepResult(result);
}

export async function runTgrepRaw(
  bin: string,
  args: string[],
  opts: { cwd: string; signal?: AbortSignal },
  exec: ExecFn = defaultExec,
): Promise<TgrepResult> {
  return exec(bin, args, opts);
}

// Exit 1 is "no match", not a failure. stderr always surfaces: it carries the
// "no index" warning that decides whether the result reflects current files.
export function formatTgrepResult(result: TgrepResult): string {
  const warning = result.stderr.trim().split("\n")[0]?.trim();
  const notice = warning ? `[tgrep: ${warning}]\n` : "";
  if (result.exit === 2)
    throw new Error(`tgrep search failed: ${warning || "unknown error"}`);
  const body = truncateBytes(result.stdout.trim());
  if (result.exit === 1 || body === "") return `${notice}No matches found`;
  return `${notice}${body}`;
}

function truncateBytes(text: string): string {
  const buf = Buffer.from(text);
  if (buf.length <= TGREP_OUTPUT_MAX_BYTES) return text;
  const head = buf.subarray(0, TGREP_OUTPUT_MAX_BYTES).toString();
  return `${head}\n… [truncated ${buf.length - TGREP_OUTPUT_MAX_BYTES} bytes: narrow with fileType/glob]`;
}

function clampContext(context: number | undefined): number {
  if (!context || context < 0) return 0;
  return Math.min(Math.floor(context), TGREP_CONTEXT_MAX);
}
