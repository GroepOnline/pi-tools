import { describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildTgrepArgs,
  formatTgrepResult,
  resolveSearchRoot,
  resolveTgrepBinary,
  runTgrep,
  TGREP_CONTEXT_MAX,
  TGREP_OUTPUT_MAX_BYTES,
} from "../src/tgrep";

describe("buildTgrepArgs", () => {
  test("defaults to vimgrep, smart-case and literal with separator", () => {
    expect(buildTgrepArgs({ pattern: "foo", root: "." })).toEqual([
      "--vimgrep",
      "--smart-case",
      "--fixed-strings",
      "--",
      "foo",
      ".",
    ]);
  });

  test("keeps subcommand-like patterns from parsing as subcommands", () => {
    const args = buildTgrepArgs({ pattern: "serve", root: "src/" });
    expect(args.slice(-3)).toEqual(["--", "serve", "src/"]);
  });

  test("maps search options to the allowlisted flags", () => {
    expect(
      buildTgrepArgs({
        pattern: "fn main",
        root: ".",
        literal: false,
        caseSensitive: true,
        wholeWord: true,
        fileType: ["rust", "py"],
        glob: "src/**",
        filesOnly: true,
        noIndex: true,
      }),
    ).toEqual([
      "--vimgrep",
      "--case-sensitive",
      "--word-regexp",
      "--type",
      "rust",
      "--type",
      "py",
      "--glob",
      "src/**",
      "--files-with-matches",
      "--no-index",
      "--",
      "fn main",
      ".",
    ]);
  });

  test("repeats glob filters in the supplied order", () => {
    const args = buildTgrepArgs({
      pattern: "x",
      root: ".",
      glob: ["*.ts", "!*.test.ts"],
    });
    expect(args.slice(3, -3)).toEqual(["--glob", "*.ts", "--glob", "!*.test.ts"]);
  });

  test("emits count and per-file cap", () => {
    const args = buildTgrepArgs({ pattern: "x", root: ".", count: true, maxCount: 0 });
    expect(args).toContain("--count");
    expect(args).toContain("--max-count");
    expect(args[args.indexOf("--max-count") + 1]).toBe("1");
  });

  test("splits context into before/after and clamps to the max", () => {
    const args = buildTgrepArgs({
      pattern: "x",
      root: ".",
      context: TGREP_CONTEXT_MAX + 100,
    });
    expect(args).toContain("-A");
    expect(args).toContain("-B");
    expect(args[args.indexOf("-A") + 1]).toBe(String(TGREP_CONTEXT_MAX));
  });

  test("floors fractional limits and omits non-positive context", () => {
    const fractional = buildTgrepArgs({
      pattern: "x",
      root: ".",
      context: 3.9,
      maxCount: 4.9,
    });
    expect(fractional.slice(fractional.indexOf("-A"), fractional.indexOf("-B"))).toEqual([
      "-A",
      "3",
    ]);
    expect(fractional[fractional.indexOf("--max-count") + 1]).toBe("4");

    for (const context of [0, -1, Number.NaN]) {
      const args = buildTgrepArgs({ pattern: "x", root: ".", context });
      expect(args).not.toContain("-A");
      expect(args).not.toContain("-B");
    }
  });

  test("never emits full-scan forcing flags", () => {
    const args = buildTgrepArgs({ pattern: "x", root: "." }).join(" ");
    for (const banned of ["--hidden", "--no-ignore", "--text", "--encoding", "-u"]) {
      expect(args.includes(banned)).toBe(false);
    }
  });
});

describe("resolveSearchRoot", () => {
  const cwd = path.resolve("/tmp/workspace");

  test("defaults to the workspace root", () => {
    expect(resolveSearchRoot(undefined, cwd)).toBe(".");
  });

  test("keeps directories and files inside the workspace", () => {
    expect(resolveSearchRoot("src/", cwd)).toBe("src");
    expect(resolveSearchRoot("src/main.ts", cwd)).toBe("src/main.ts");
  });

  test("trims and normalizes workspace-relative paths", () => {
    expect(resolveSearchRoot("   ", cwd)).toBe(".");
    expect(resolveSearchRoot(" ./src/../test/tgrep.test.ts ", cwd)).toBe(
      "test/tgrep.test.ts",
    );
  });

  test("rejects globs and escapes", () => {
    expect(() => resolveSearchRoot("src/**/*.ts", cwd)).toThrow("not a glob");
    expect(() => resolveSearchRoot("../outside", cwd)).toThrow("inside the workspace");
    expect(() => resolveSearchRoot("/etc/passwd", cwd)).toThrow("inside the workspace");
    expect(() => resolveSearchRoot(`${cwd}-sibling`, cwd)).toThrow(
      "inside the workspace",
    );
  });
});

describe("resolveTgrepBinary", () => {
  test("prefers an explicit executable path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tgrep-bin-"));
    try {
      const bin = path.join(dir, "tgrep");
      fs.writeFileSync(bin, "#!/bin/sh\necho hi\n");
      fs.chmodSync(bin, 0o755);
      expect(resolveTgrepBinary(bin, "")).toBe(bin);
      expect(resolveTgrepBinary(path.join(dir, "missing"), "")).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("finds tgrep on PATH and returns undefined when absent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tgrep-path-"));
    try {
      const bin = path.join(dir, "tgrep");
      fs.writeFileSync(bin, "#!/bin/sh\n");
      fs.chmodSync(bin, 0o755);
      expect(resolveTgrepBinary(undefined, dir)).toBe(bin);
      expect(resolveTgrepBinary(undefined, path.join(dir, "empty"))).toBeUndefined();
      expect(resolveTgrepBinary(undefined, "")).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("does not fall back to PATH when an explicit binary is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tgrep-precedence-"));
    try {
      const pathBin = path.join(dir, "tgrep");
      fs.writeFileSync(pathBin, "#!/bin/sh\n");
      fs.chmodSync(pathBin, 0o755);

      expect(resolveTgrepBinary(path.join(dir, "missing"), dir)).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("skips non-executable PATH entries and continues searching", () => {
    const first = fs.mkdtempSync(path.join(os.tmpdir(), "tgrep-path-first-"));
    const second = fs.mkdtempSync(path.join(os.tmpdir(), "tgrep-path-second-"));
    try {
      fs.writeFileSync(path.join(first, "tgrep"), "#!/bin/sh\n");
      const executable = path.join(second, "tgrep");
      fs.writeFileSync(executable, "#!/bin/sh\n");
      fs.chmodSync(executable, 0o755);

      expect(resolveTgrepBinary(undefined, [first, second].join(path.delimiter))).toBe(
        executable,
      );
    } finally {
      fs.rmSync(first, { recursive: true, force: true });
      fs.rmSync(second, { recursive: true, force: true });
    }
  });
});

describe("formatTgrepResult", () => {
  test("returns match output verbatim", () => {
    expect(formatTgrepResult({ exit: 0, stdout: "a.ts:1:5:foo\n", stderr: "" })).toBe(
      "a.ts:1:5:foo",
    );
  });

  test("treats exit 1 as no matches, not failure", () => {
    expect(formatTgrepResult({ exit: 1, stdout: "", stderr: "" })).toBe(
      "No matches found",
    );
  });

  test("throws on exit 2 with the stderr cause", () => {
    expect(() =>
      formatTgrepResult({ exit: 2, stdout: "", stderr: "bad regex\n" }),
    ).toThrow("bad regex");
  });

  test("surfaces the stderr freshness warning above results", () => {
    const out = formatTgrepResult({
      exit: 0,
      stdout: "a.ts:1:5:foo\n",
      stderr: "warning: no index - scanning every file\n",
    });
    expect(out.startsWith("[tgrep: warning: no index - scanning every file]")).toBe(true);
    expect(out).toContain("a.ts:1:5:foo");
  });

  test("keeps the first stderr warning when there are no matches", () => {
    expect(
      formatTgrepResult({
        exit: 1,
        stdout: "",
        stderr: "warning: stale index\nadditional diagnostic\n",
      }),
    ).toBe("[tgrep: warning: stale index]\nNo matches found");
  });

  test("uses a stable fallback when an exit 2 error has no stderr", () => {
    expect(() => formatTgrepResult({ exit: 2, stdout: "", stderr: "" })).toThrow(
      "tgrep search failed: unknown error",
    );
  });

  test("does not truncate output at the exact byte limit", () => {
    const exact = "x".repeat(TGREP_OUTPUT_MAX_BYTES);
    expect(formatTgrepResult({ exit: 0, stdout: exact, stderr: "" })).toBe(exact);
  });

  test("truncates oversized output with a narrowing hint", () => {
    const big = `${"x".repeat(TGREP_OUTPUT_MAX_BYTES + 10)}\n`;
    const out = formatTgrepResult({ exit: 0, stdout: big, stderr: "" });
    expect(out).toContain("truncated");
    expect(out).toContain("fileType/glob");
    expect(Buffer.byteLength(out)).toBeLessThan(Buffer.byteLength(big) + 200);
  });
});

describe("runTgrep", () => {
  test("truncates partial stdout after exceeding the child-process buffer", async () => {
    const out = await runTgrep(
      process.execPath,
      ["-e", `process.stdout.write("x".repeat(${TGREP_OUTPUT_MAX_BYTES * 2 + 1}))`],
      { cwd: "/tmp" },
    );
    expect(out).toContain("truncated");
    expect(out).toContain("fileType/glob");
  });

  test("rejects aborted calls before spawning", async () => {
    const controller = new AbortController();
    controller.abort();
    const exec = mock(async () => ({ exit: 0, stdout: "", stderr: "" }));
    await expect(
      runTgrep(
        "/bin/false",
        ["--", "x", "."],
        { cwd: "/tmp", signal: controller.signal },
        exec,
      ),
    ).rejects.toThrow("Operation aborted");
    expect(exec).not.toHaveBeenCalled();
  });

  test("maps the real process no-match exit and stderr warning", async () => {
    const out = await runTgrep(
      process.execPath,
      ["-e", 'process.stderr.write("warning: stale index\\n"); process.exit(1)'],
      { cwd: "/tmp" },
    );
    expect(out).toBe("[tgrep: warning: stale index]\nNo matches found");
  });

  test("wraps child-process launch failures with tgrep context", async () => {
    await expect(
      runTgrep("/definitely/missing/tgrep", ["--", "x", "."], { cwd: "/tmp" }),
    ).rejects.toThrow("tgrep failed to run:");
  });

  test("delegates to the injected executor and formats", async () => {
    const seen: unknown[] = [];
    const out = await runTgrep(
      "/fake/tgrep",
      ["--", "x", "."],
      { cwd: "/tmp" },
      async (bin, args, opts) => {
        seen.push([bin, args, opts.cwd]);
        return { exit: 0, stdout: "a.ts:2:1:x\n", stderr: "" };
      },
    );
    expect(out).toBe("a.ts:2:1:x");
    expect(seen).toEqual([["/fake/tgrep", ["--", "x", "."], "/tmp"]]);
  });
});
