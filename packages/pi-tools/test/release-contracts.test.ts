import { describe, expect, test } from "bun:test";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");

function run(script: string, args: string[]) {
  return Bun.spawnSync({ cmd: [path.join(REPO_ROOT, "scripts", script), ...args], cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" });
}

describe("release contract guards", () => {
  test("Conventional Commit bang headers require a breaking version advance", () => {
    const result = run("check-breaking-version.sh", ["--package-version", "1.4.0", "--previous-version", "1.4.0", "--change-log", "feat!: remove fff-mode"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("requires a major bump");
  });

  test("telemetry guard rejects a network call even when an old metadata URL shares the line", () => {
    const fixture = 'src/index.ts:1:fetch("https://github.com/GroepOnline/pi-tools")';
    const result = run("check-no-telemetry.sh", ["packages/pi-tools/src", fixture]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("local-only boundary violated");
  });
});
