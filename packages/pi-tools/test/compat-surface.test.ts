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

const readJson = <T>(absOrRel: string): T =>
  JSON.parse(
    fs.readFileSync(
      path.isAbsolute(absOrRel) ? absOrRel : path.join(PKG_ROOT, absOrRel),
      "utf8",
    ),
  ) as T;

const indexTs = readPkgFile("src/index.ts");
const configRaw = readPkgFile("src/config.ts");
const compatDoc = fs.readFileSync(
  path.join(REPO_ROOT, "docs", "compatibility.md"),
  "utf8",
);

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
    const documented = [
      "fff-mode",
      "fff-frecency-db",
      "fff-history-db",
      "fff-enable-root-scan",
      "fff-enable-home-scan",
    ];
    for (const flag of documented) {
      expect(indexTs).toContain(`registerFlag("${flag}"`);
    }
  });

  test("env names in doc match code read paths", () => {
    expect(compatDoc).toContain("PI_FFF_MODE");
    expect(indexTs).toContain('"PI_FFF_MODE"');
    for (const envName of ["FFF_FRECENCY_DB", "FFF_HISTORY_DB", "FFF_ENABLE_ROOT_SCAN", "FFF_ENABLE_HOME_SCAN"]) {
      expect(compatDoc).toContain(envName);
      expect(indexTs).toContain(`"${envName}"`);
    }
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

  test("pagination contract: findSchema pages via opaque cursor + limit (no offset)", () => {
    const findSchema = indexTs.match(
      /const findSchema = Type\.Object\(\{([\s\S]*?)\n  \}\);/,
    );
    expect(findSchema, "findSchema not found in src/index.ts").not.toBeNull();
    expect(findSchema![1]).toMatch(/cursor:/);
    expect(findSchema![1]).toMatch(/limit:/);
    expect(findSchema![1]).toMatch(/DEFAULT_FIND_LIMIT/);
    // doc describes the same contract and never claims a live offset parameter
    expect(compatDoc).toMatch(/opaque[\s\S]*?`cursor`/);
    expect(compatDoc).toMatch(/no offset/);
  });

  test("runtime floors match the owning manifests", () => {
    const fffNodeEngines = readJson<{ engines: { node: string } }>(
      path.join(REPO_ROOT, "packages", "fff-node", "package.json"),
    ).engines.node;
    const fffBunEngines = readJson<{ engines: { bun: string } }>(
      path.join(REPO_ROOT, "packages", "fff-bun", "package.json"),
    ).engines.bun;
    expect(fffNodeEngines).toBe(">=18.0.0");
    expect(fffBunEngines).toBe(">=1.0.0");
    const pythonManifest = fs.readFileSync(path.join(REPO_ROOT, "packages", "fff-python", "pyproject.toml"), "utf8");
    const pythonFloor = pythonManifest.match(/requires-python\s*=\s*"([^"]+)"/)?.[1];
    expect(pythonFloor).toBe(">=3.10");
    // doc table states the same floors
    expect(compatDoc).toContain("Node ≥ 18");
    expect(compatDoc).toContain("Bun ≥ 1.0");
    expect(compatDoc).toContain("`requires-python >=3.10`");
  });

  test("mode→tool-name mapping: override registers grep/find/multi_grep", () => {
    expect(indexTs).toMatch(/OVERRIDE_TOOL_NAMES/);
    expect(indexTs).toMatch(/grep:\s*"grep"/);
    expect(indexTs).toMatch(/find:\s*"find"/);
    expect(indexTs).toMatch(/multiGrep:\s*"multi_grep"/);
    expect(indexTs).toMatch(/FFF_TOOL_NAMES/);
    expect(indexTs).toMatch(/multiGrep:\s*"fff-multi-grep"/);
    // doc describes the mapping and the mention-disable rule
    expect(compatDoc).toContain("`grep`/`find`/");
    expect(compatDoc).toContain("PI_FFF_MULTIGREP");
    expect(compatDoc).toContain("tools-only");
    expect(compatDoc).toMatch(/mentions?/i);
  });

  test("mentions are disabled only in tools-only mode", () => {
    expect(indexTs).toMatch(/currentMode !== "tools-only"/);
    expect(compatDoc).toMatch(/disabled only in `tools-only`/);
  });
});
