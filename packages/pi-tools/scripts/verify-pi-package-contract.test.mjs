import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./verify-pi-package-contract.mjs", import.meta.url));

const DEFAULT_PKG = {
  name: "@groeponline/test-pkg",
  version: "1.0.0",
  description: "A perfectly cromulent description that is long enough to pass the check easily.",
  license: "MIT",
  author: "GroepOnline",
  repository: { type: "git", url: "git+https://example.com/repo.git" },
  homepage: "https://example.com",
  bugs: { url: "https://example.com/issues" },
  keywords: ["pi-package", "groeponline"],
  publishConfig: { access: "public" },
  files: ["index.mjs"],
  pi: { extensions: ["index.mjs"], image: "https://example.com/image.png" },
};

/**
 * Creates a temporary package fixture directory and registers cleanup on the test context.
 * `pkg` is shallow-merged over DEFAULT_PKG; set a key to `undefined` to omit it entirely.
 */
function createFixture(t, { pkg = {}, indexSource = "export const noop = 1;\n", readme = "# test-pkg\n", extraFiles = {}, git = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-package-contract-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  if (git) execFileSync("git", ["init", "-q"], { cwd: dir });

  const merged = { ...structuredClone(DEFAULT_PKG), ...pkg };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(merged, null, 2));
  if (indexSource !== null) fs.writeFileSync(path.join(dir, "index.mjs"), indexSource);
  if (readme !== null) fs.writeFileSync(path.join(dir, "README.md"), readme);
  for (const [relPath, content] of Object.entries(extraFiles)) {
    const full = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

function runVerify(dir) {
  try {
    const stdout = execFileSync("node", [scriptPath, dir], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: error.status,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

test("passes for a well-formed pi package with an image preview asset", (t) => {
  const dir = createFixture(t);
  const result = runVerify(dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Pi package contract OK: @groeponline\/test-pkg@1\.0\.0/);
  assert.match(result.stdout, /packed files/);
});

test("passes for a well-formed pi package with a video preview asset", (t) => {
  const dir = createFixture(t, {
    pkg: { pi: { extensions: ["index.mjs"], video: "https://example.com/demo.mp4" } },
  });
  const result = runVerify(dir);
  assert.equal(result.status, 0, result.stderr);
});

test("exits with status 2 when package.json is missing", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-package-contract-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = runVerify(dir);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /package\.json not found/);
});

test("fails when the package is marked private", (t) => {
  const dir = createFixture(t, { pkg: { private: true } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /package must not be private/);
});

test("fails when keywords omit \"pi-package\"", (t) => {
  const dir = createFixture(t, { pkg: { keywords: ["groeponline"] } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /keywords must include "pi-package"/);
});

test("fails when a @groeponline/ scoped package omits the \"groeponline\" keyword", (t) => {
  const dir = createFixture(t, { pkg: { keywords: ["pi-package"] } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GroepOnline packages must include the "groeponline" keyword/);
});

test("fails when the description is shorter than 40 characters", (t) => {
  const dir = createFixture(t, { pkg: { description: "A".repeat(39) } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /description must be 40-240 characters/);
});

test("passes when the description is exactly 40 characters", (t) => {
  const dir = createFixture(t, { pkg: { description: "A".repeat(40) } });
  const result = runVerify(dir);
  assert.equal(result.status, 0, result.stderr);
});

test("passes when the description is exactly 240 characters", (t) => {
  const dir = createFixture(t, { pkg: { description: "A".repeat(240) } });
  const result = runVerify(dir);
  assert.equal(result.status, 0, result.stderr);
});

test("fails when the description is longer than 240 characters", (t) => {
  const dir = createFixture(t, { pkg: { description: "A".repeat(241) } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /description must be 40-240 characters/);
});

for (const field of ["author", "license", "repository", "homepage", "bugs"]) {
  test(`fails when required metadata field "${field}" is missing`, (t) => {
    const dir = createFixture(t, { pkg: { [field]: undefined } });
    const result = runVerify(dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`missing package metadata: ${field}`));
  });
}

test("fails when a scoped package lacks publishConfig.access = \"public\"", (t) => {
  const dir = createFixture(t, { pkg: { publishConfig: undefined } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /scoped public Pi packages need publishConfig\.access = "public"/);
});

test("fails when the pi manifest is missing entirely", (t) => {
  const dir = createFixture(t, { pkg: { pi: undefined } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /explicit pi manifest is required by the GroepOnline release standard/);
});

test("fails when the pi manifest is an array instead of an object", (t) => {
  const dir = createFixture(t, { pkg: { pi: [] } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /explicit pi manifest is required by the GroepOnline release standard/);
});

test("fails when a pi resource key is not an array", (t) => {
  const dir = createFixture(t, {
    pkg: { pi: { extensions: "index.mjs", image: "https://example.com/image.png" } },
  });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pi\.extensions must be an array when present/);
  assert.match(result.stderr, /pi manifest must expose at least one extension, skill, prompt, or theme resource/);
});

test("fails when no extension, skill, prompt, or theme resources are declared", (t) => {
  const dir = createFixture(t, { pkg: { pi: { image: "https://example.com/image.png" } } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pi manifest must expose at least one extension, skill, prompt, or theme resource/);
});

test("fails when neither pi.video nor pi.image is set", (t) => {
  const dir = createFixture(t, { pkg: { pi: { extensions: ["index.mjs"] } } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GroepOnline gallery standard requires pi\.video or pi\.image/);
});

test("fails when pi.image is not an absolute URL", (t) => {
  const dir = createFixture(t, { pkg: { pi: { extensions: ["index.mjs"], image: "not-a-url" } } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pi\.image must be an absolute HTTPS URL/);
});

test("fails when pi.image is not served over HTTPS", (t) => {
  const dir = createFixture(t, {
    pkg: { pi: { extensions: ["index.mjs"], image: "http://example.com/image.png" } },
  });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pi\.image must use HTTPS/);
});

test("fails when pi.image has an unsupported file extension", (t) => {
  const dir = createFixture(t, {
    pkg: { pi: { extensions: ["index.mjs"], image: "https://example.com/image.svg" } },
  });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pi\.image has unsupported format \.svg/);
});

test("fails when pi.video has an unsupported file extension", (t) => {
  const dir = createFixture(t, {
    pkg: { pi: { extensions: ["index.mjs"], video: "https://example.com/demo.mov" } },
  });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pi\.video has unsupported format \.mov/);
});

test("fails when a resource path escapes the package root via ../ traversal", (t) => {
  const dir = createFixture(t, { pkg: { pi: { extensions: ["../outside.mjs"], image: "https://example.com/image.png" } } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pi\.extensions resource escapes package root: \.\.\/outside\.mjs/);
});

test("fails when a resource path is absolute", (t) => {
  const dir = createFixture(t, { pkg: { pi: { extensions: ["/etc/passwd"], image: "https://example.com/image.png" } } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pi\.extensions resource escapes package root: \/etc\/passwd/);
});

test("fails when a declared resource file does not exist", (t) => {
  const dir = createFixture(t, { pkg: { pi: { extensions: ["missing.mjs"], image: "https://example.com/image.png" } } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pi\.extensions resource does not exist after build: missing\.mjs/);
});

test("fails when a resource glob pattern matches nothing", (t) => {
  const dir = createFixture(t, { pkg: { pi: { extensions: ["*.nomatch"], image: "https://example.com/image.png" } } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pi\.extensions resource glob matches nothing: \*\.nomatch/);
});

test("resolves glob resource patterns to their matching packaged files", (t) => {
  const dir = createFixture(t, {
    pkg: { files: ["src"], pi: { extensions: ["src/*.mjs"], image: "https://example.com/image.png" } },
    extraFiles: { "src/a.mjs": "export const a = 1;\n", "src/b.mjs": "export const b = 1;\n" },
  });
  const result = runVerify(dir);
  assert.equal(result.status, 0, result.stderr);
});

test("fails when negated glob patterns exclude every positive match", (t) => {
  const dir = createFixture(t, {
    pkg: { files: ["src"], pi: { extensions: ["src/*.mjs", "!src/*.mjs"], image: "https://example.com/image.png" } },
    extraFiles: { "src/a.mjs": "export const a = 1;\n" },
  });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pi\.extensions resolves to no packaged files after exclusions/);
});

test("fails when a resource resolves through a symlink outside the package root", (t) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pi-package-contract-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, "evil.mjs"), "export const evil = 1;\n");

  const dir = createFixture(t, {
    pkg: { files: ["src"], pi: { extensions: ["src/linked/evil.mjs"], image: "https://example.com/image.png" } },
  });
  fs.mkdirSync(path.join(dir, "src"));
  fs.symlinkSync(outside, path.join(dir, "src", "linked"));

  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /resource resolves through a symlink outside package root: src\/linked\/evil\.mjs/);
});

test("fails when a declared resource file is excluded from the published npm tarball", (t) => {
  const dir = createFixture(t, {
    pkg: { files: ["index.mjs"], pi: { extensions: ["index.mjs", "extra.mjs"], image: "https://example.com/image.png" } },
    extraFiles: { "extra.mjs": "export const extra = 1;\n" },
  });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pi\.extensions resource file is not present in npm tarball: extra\.mjs/);
});

test("fails when the npm tarball is missing a README", (t) => {
  const dir = createFixture(t, { readme: null });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /npm tarball is missing README/);
});

test("fails when a Pi core package is listed in dependencies", (t) => {
  const dir = createFixture(t, { pkg: { dependencies: { "@earendil-works/pi-tui": "1.0.0" } } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Pi core package @earendil-works\/pi-tui must not be in dependencies; use peerDependencies: "\*"/);
});

test("fails when a Pi core peerDependency version is not \"*\"", (t) => {
  const dir = createFixture(t, { pkg: { peerDependencies: { "@earendil-works/pi-coding-agent": "1.2.3" } } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Pi core peer @earendil-works\/pi-coding-agent must use "\*", found "1\.2\.3"/);
});

test("fails when a Pi core package is bundled", (t) => {
  const dir = createFixture(t, { pkg: { bundledDependencies: ["@earendil-works/pi-tui"] } });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Pi core package @earendil-works\/pi-tui must not be bundled/);
});

test("fails when packed runtime code imports a Pi core package without declaring it as a peer", (t) => {
  const dir = createFixture(t, {
    indexSource: 'import { Bar } from "@earendil-works/pi-tui";\nexport const noop = Bar;\n',
  });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /packed runtime imports @earendil-works\/pi-tui; peerDependencies\.@earendil-works\/pi-tui must be "\*"/);
});

test("fails when packed runtime code imports @sinclair/typebox without declaring it as a dependency", (t) => {
  const dir = createFixture(t, {
    indexSource: 'import "@sinclair/typebox";\nexport const noop = 1;\n',
  });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /packed runtime imports @sinclair\/typebox; it is third-party under the current Pi contract/);
});

test("passes when packed runtime code only type-imports a Pi core package", (t) => {
  const dir = createFixture(t, {
    indexSource: 'import type { Bar } from "@earendil-works/pi-tui";\nexport const noop = 1;\n',
  });
  const result = runVerify(dir);
  assert.equal(result.status, 0, result.stderr);
});

test("ignores runtime-looking imports found in excluded directories like test/", (t) => {
  const dir = createFixture(t, {
    pkg: { files: ["index.mjs", "test"] },
    extraFiles: { "test/helper.mjs": 'import { Bar } from "@earendil-works/pi-tui";\nexport const noop = Bar;\n' },
  });
  const result = runVerify(dir);
  assert.equal(result.status, 0, result.stderr);
});

test("fails when a same-repo raw.githubusercontent preview asset does not exist", (t) => {
  const dir = createFixture(t, {
    git: true,
    pkg: {
      pi: {
        extensions: ["index.mjs"],
        image: "https://raw.githubusercontent.com/Owner/Repo/main/assets/missing-logo.png",
      },
    },
  });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pi\.image points at a same-repo raw asset that does not exist: assets\/missing-logo\.png/);
});

test("passes when a same-repo raw.githubusercontent preview asset exists", (t) => {
  const dir = createFixture(t, {
    git: true,
    pkg: {
      pi: {
        extensions: ["index.mjs"],
        image: "https://raw.githubusercontent.com/Owner/Repo/main/assets/logo.png",
      },
    },
    extraFiles: { "assets/logo.png": "fake-png-bytes" },
  });
  const result = runVerify(dir);
  assert.equal(result.status, 0, result.stderr);
});

test("reports all accumulated failures together with a docs link", (t) => {
  const dir = createFixture(t, {
    pkg: {
      private: true,
      description: "short",
      keywords: ["pi-package"],
      pi: { extensions: [] },
    },
  });
  const result = runVerify(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Pi package contract FAILED/);
  assert.match(result.stderr, /package must not be private/);
  assert.match(result.stderr, /description must be 40-240 characters/);
  assert.match(result.stderr, /GroepOnline packages must include the "groeponline" keyword/);
  assert.match(result.stderr, /pi manifest must expose at least one extension, skill, prompt, or theme resource/);
  assert.match(result.stderr, /Docs: https:\/\/pi\.dev\/docs\/latest\/packages/);
});