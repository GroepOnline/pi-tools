import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const PKG_ROOT = path.resolve(import.meta.dir, "..");
const REPO_ROOT = path.resolve(PKG_ROOT, "..", "..");

/**
 * compat-surface.test.ts — asserts that docs/compatibility.md's documented surface
 * matches the live extension. Keeps the 1.0 contract honest: doc claims are verified
 * against code, not just prose.
 */

function readPkgFile(rel: string): string {
  return fs.readFileSync(path.join(PKG_ROOT, rel), "utf8");
}

const indexTs = readPkgFile("src/index.ts");
const configRaw = readPkgFile("src/config.ts");
const compatDoc = fs.readFileSync(path.join(REPO_ROOT, "docs", "compatibility.md"), "utf8");

describe("compatibility surface (docs/compatibility.md vs code)", () => {
  test("tool names fffind/ffgrep are the live registered names", () => {
    // index.ts:52-53 maps grep -> "ffgrep", find -> "fffind"; queueTool uses these names.
    const grep = indexTs.match(/grep:\s*"([a-z]+)"/)?.[1];
    const find = indexTs.match(/find:\s*"([a-z]+)"/)?.[1];
    expect(find).toBe("fffind");
    expect(grep).toBe("ffgrep");
    // doc states both names
    expect(compatDoc).toContain("`fffind`");
    expect(compatDoc).toContain("`ffgrep`");
  });

  test("VALID_MODES match the documented enum", () => {
    const m = configRaw.match(/VALID_MODES\s*=\s*\[(.*?)\]/s);
    expect(m).not.toBeNull();
    const modes = m![1].match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1));
    expect(modes).toEqual(["tools-and-ui", "tools-only", "override"]);
    expect(compatDoc).toContain("`tools-and-ui`, `tools-only`, `override`");
  });

  test("documented flags exist as extension flags", () => {
    const documented = ["fff-mode", "fff-frecency-db", "fff-history-db", "fff-enable-root-scan", "fff-enable-home-scan"];
    for (const flag of documented) {
      expect(indexTs).toContain(`registerFlag("${flag}"`);
    }
  });

  test("env names in doc match code read paths", () => {
    expect(compatDoc).toContain("PI_FFF_MODE");
    expect(indexTs).toContain('"PI_FFF_MODE"');
    expect(compatDoc).toContain("FFF_FRECENCY_DB");
    expect(compatDoc).toContain("FFF_HISTORY_DB");
    // defaults documented in the precedence table
    expect(compatDoc).toContain("`tools-and-ui`");
    // config precedence chain is documented in order flag > env > config > default
    expect(compatDoc).toMatch(/flag \(--fff-mode/);
  });

  test("schema exists and ships in package files", () => {
    const pkg = JSON.parse(readPkgFile("package.json"));
    expect(fs.existsSync(path.join(PKG_ROOT, "pi-tools.schema.json"))).toBe(true);
    expect(pkg.files).toContain("pi-tools.schema.json");
  });
});