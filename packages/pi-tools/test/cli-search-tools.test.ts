import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PACKAGE_ROOT = path.resolve(import.meta.dir, "..");
const SKILL_PATH = path.join(PACKAGE_ROOT, "skills", "cli-search-tools", "SKILL.md");
const SCRIPT_PATH = path.join(
  PACKAGE_ROOT,
  "skills",
  "cli-search-tools",
  "scripts",
  "search-pi-logs.sh",
);

describe("cli-search-tools package contract", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
  );

  test("registers and publishes the skill with its helper", () => {
    expect(pkg.pi.skills).toEqual(["./skills/cli-search-tools/SKILL.md"]);
    expect(pkg.files).toEqual(
      expect.arrayContaining([
        "skills/cli-search-tools/SKILL.md",
        "skills/cli-search-tools/scripts/search-pi-logs.sh",
      ]),
    );

    const packed = Bun.spawnSync({
      cmd: ["npm", "pack", "--dry-run", "--ignore-scripts", "--json"],
      cwd: PACKAGE_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(packed.exitCode).toBe(0);

    const files = JSON.parse(packed.stdout.toString())[0].files.map(
      ({ path: packedPath }: { path: string }) => packedPath,
    );
    expect(files).toEqual(
      expect.arrayContaining([
        "skills/cli-search-tools/SKILL.md",
        "skills/cli-search-tools/scripts/search-pi-logs.sh",
      ]),
    );
  });

  test("keeps valid skill metadata and the FFF-first guidance", () => {
    const skill = fs.readFileSync(SKILL_PATH, "utf8");
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter![1]).toMatch(/^name:\s*cli-search-tools\s*$/m);
    expect(frontmatter![1]).toMatch(/^description:\s*\S.+$/m);
    expect(skill).toContain("Prefer the FFF-backed extension tools");
    expect(skill).toContain("`fff_find`, `fff_grep`, `tgrep`, `@`-completion");
  });

  test("ships the helper as an executable Bash script", () => {
    expect(fs.readFileSync(SCRIPT_PATH, "utf8")).toStartWith("#!/usr/bin/env bash\n");
    expect(fs.statSync(SCRIPT_PATH).mode & 0o111).not.toBe(0);

    const syntax = Bun.spawnSync({
      cmd: ["bash", "-n", SCRIPT_PATH],
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(syntax.exitCode).toBe(0);
  });
});

describe("search-pi-logs.sh", () => {
  let fixtureRoot: string;
  let sessionDir: string;
  let fzfArgsPath: string;

  beforeEach(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "search-pi-logs-"));
    sessionDir = path.join(fixtureRoot, "sessions");
    fzfArgsPath = path.join(fixtureRoot, "fzf-args");
    const binDir = path.join(fixtureRoot, "bin");

    fs.mkdirSync(sessionDir);
    fs.mkdirSync(binDir);
    const fzfPath = path.join(binDir, "fzf");
    fs.writeFileSync(
      fzfPath,
      '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$FZF_ARGS_PATH"\ncat\n',
    );
    fs.chmodSync(fzfPath, 0o755);
  });

  afterEach(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test("prints help without reading the session directory", () => {
    fs.rmSync(sessionDir, { recursive: true, force: true });

    const result = runScript(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(
      "Usage: " + SCRIPT_PATH + " [--zoekterm term] [--type error|user|all]",
    );
    expect(result.stderr.toString()).toBe("");
  });

  test("formats all messages with defaults and sorts them by timestamp", () => {
    writeJsonl("nested/later.jsonl", [
      {
        timestamp: "2026-08-03T11:22:33.999Z",
        message: {
          role: "assistant",
          model: "gpt-5",
          provider: "openai",
          stopReason: "stop",
          content: [
            { type: "text", text: "finished" },
            { type: "toolCall", name: "ignored" },
          ],
        },
      },
    ]);
    writeJsonl("earlier.jsonl", [
      {
        timestamp: "2026-08-03T09:00:00Z",
        message: { role: "user", content: [{ type: "text", text: "hello" }] },
      },
    ]);

    const result = runScript([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim().split("\n")).toEqual([
      "2026-08-03T09:00:00 | - | - | user |   | hello",
      "2026-08-03T11:22:33 | gpt-5 | openai | assistant | stop  | finished",
    ]);
    expect(fs.existsSync(fzfArgsPath)).toBe(false);
  });

  test("filters error messages and includes their error details", () => {
    writeJsonl("errors.jsonl", [
      {
        timestamp: "2026-08-03T10:00:00Z",
        message: {
          role: "assistant",
          model: "glm-5",
          provider: "zai",
          stopReason: "error",
          errorMessage: "Rate limit exceeded",
        },
      },
      {
        timestamp: "2026-08-03T10:01:00Z",
        message: { role: "assistant", stopReason: "stop" },
      },
    ]);

    const result = runScript(["--type", "error"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim()).toBe(
      "2026-08-03T10:00:00 | glm-5 | zai | assistant | error Rate limit exceeded |",
    );
  });

  test("supports user, model, and provider filters through short options", () => {
    writeJsonl("messages.jsonl", [
      {
        timestamp: "2026-08-03T10:00:00Z",
        message: {
          role: "user",
          model: "GLM-5",
          provider: "Z.AI",
          content: [{ type: "text", text: "matching" }],
        },
      },
      {
        timestamp: "2026-08-03T10:01:00Z",
        message: {
          role: "user",
          model: "gpt-5",
          provider: "openai",
          content: [{ type: "text", text: "wrong backend" }],
        },
      },
      {
        timestamp: "2026-08-03T10:02:00Z",
        message: {
          role: "assistant",
          model: "GLM-5",
          provider: "Z.AI",
          content: [{ type: "text", text: "wrong role" }],
        },
      },
    ]);

    const result = runScript(["-t", "user", "-m", "^glm", "-p", "z\\.ai$"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("matching");
    expect(result.stdout.toString()).not.toContain("wrong backend");
    expect(result.stdout.toString()).not.toContain("wrong role");
  });

  test("matches a search term in error text or text content case-insensitively", () => {
    writeJsonl("search.jsonl", [
      {
        timestamp: "2026-08-03T10:00:00Z",
        message: {
          role: "assistant",
          errorMessage: "Needle in an ERROR",
          content: [],
        },
      },
      {
        timestamp: "2026-08-03T10:01:00Z",
        message: {
          role: "user",
          content: [
            { type: "toolCall", text: "needle should be ignored here" },
            { type: "text", text: "a NEEDLE in user text" },
          ],
        },
      },
      {
        timestamp: "2026-08-03T10:02:00Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "unrelated" }],
        },
      },
    ]);

    const result = runScript(["--zoekterm", "needle"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim().split("\n")).toHaveLength(2);
    expect(result.stdout.toString()).not.toContain("unrelated");
    expect(fs.readFileSync(fzfArgsPath, "utf8").trim().split("\n")).toEqual([
      "--filter",
      "needle",
      "--no-sort",
    ]);
  });

  test("accepts a positional search term", () => {
    writeJsonl("search.jsonl", [
      {
        timestamp: "2026-08-03T10:00:00Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "find this phrase" }],
        },
      },
    ]);

    const result = runScript(["this phrase"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("find this phrase");
    expect(fs.readFileSync(fzfArgsPath, "utf8")).toContain("this phrase");
  });

  test("returns no output for an empty session directory", () => {
    const result = runScript([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toBe("");
  });

  test("fails for malformed JSONL instead of silently returning partial data", () => {
    fs.writeFileSync(path.join(sessionDir, "broken.jsonl"), "{not-json}\n");

    const result = runScript([]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("parse error");
  });

  test("fails when an option value is missing", () => {
    const result = runScript(["--model"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("unbound variable");
  });

  function writeJsonl(relativePath: string, records: unknown[]): void {
    const target = path.join(sessionDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      records.map((record) => JSON.stringify(record)).join("\n") + "\n",
    );
  }

  function runScript(args: string[]) {
    return Bun.spawnSync({
      cmd: ["bash", SCRIPT_PATH, ...args],
      env: {
        ...process.env,
        FZF_ARGS_PATH: fzfArgsPath,
        PATH: `${path.join(fixtureRoot, "bin")}:${process.env.PATH ?? ""}`,
        PI_SESSION_DIR: sessionDir,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
  }
});
