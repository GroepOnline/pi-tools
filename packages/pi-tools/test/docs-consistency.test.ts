import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

function repoPathExists(relPath: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, relPath));
}

const CONFLICT_MARKERS = ["<<<<<<<", "=======", ">>>>>>>", "|||||||"] as const;

/** Extracts `](./relative/path)`-style markdown links, stripping any `#fragment`. */
function extractRelativeMarkdownLinks(markdown: string): string[] {
  const linkRe = /\]\((\.\/[^)\s]+)\)/g;
  const links = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(markdown)) !== null) {
    const target = match[1].split("#")[0];
    if (target) links.add(target);
  }
  return [...links];
}

/** GitHub's heading-to-anchor slug algorithm, sufficient for plain ASCII headings. */
function githubSlug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const CHANGED_TEXT_FILES: string[] = [
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/workflows/release.yaml",
  ".pi/skills/release/SKILL.md",
  "AGENTS.md",
  "README.md",
  "docs/EXTENSION_ROADMAP.md",
  "docs/RELEASE.md",
  "docs/extension-research-notes.md",
  "packages/fff-bun/README.md",
  "packages/fff-node/README.md",
  "packages/fff-python/README.md",
];

describe("no leftover merge-conflict markers", () => {
  test.each(CHANGED_TEXT_FILES)("%s has no git conflict markers", (relPath) => {
    const content = readRepoFile(relPath);
    for (const marker of CONFLICT_MARKERS) {
      expect(content.includes(marker)).toBe(false);
    }
  });
});

describe(".github/ISSUE_TEMPLATE/config.yml", () => {
  const content = readRepoFile(".github/ISSUE_TEMPLATE/config.yml");

  test("keeps blank issues disabled", () => {
    expect(content).toContain("blank_issues_enabled: false");
  });

  test("declares a contact_links section", () => {
    expect(content).toMatch(/^contact_links:\s*$/m);
  });

  test("contact link has name, url and about fields", () => {
    const nameMatch = content.match(/-\s*name:\s*(.+)/);
    const urlMatch = content.match(/url:\s*(.+)/);
    const aboutMatch = content.match(/about:\s*(.+)/);

    expect(nameMatch).not.toBeNull();
    expect(urlMatch).not.toBeNull();
    expect(aboutMatch).not.toBeNull();

    expect(nameMatch![1].trim()).toBe("Discussion / question");
    expect(urlMatch![1].trim()).toBe(
      "https://github.com/GroepOnline/pi-tools/discussions",
    );
    expect(aboutMatch![1].trim()).toContain("issue forms");
  });

  test("contact link url is a well-formed URL", () => {
    const urlMatch = content.match(/url:\s*(\S+)/);
    expect(urlMatch).not.toBeNull();
    expect(() => new URL(urlMatch![1])).not.toThrow();
  });

  test("does not use tab indentation (invalid YAML)", () => {
    expect(content).not.toContain("\t");
  });
});

describe(".github/workflows/release.yaml release notes body", () => {
  const content = readRepoFile(".github/workflows/release.yaml");

  test("no longer references publishing to PyPI", () => {
    expect(content).not.toContain("pip install fff-search");
    expect(content).not.toContain("Install from PyPI");
  });

  test("documents wheels/sdist as GitHub Release assets", () => {
    expect(content).toContain(
      "`python/*.whl` / `python/*.tar.gz` - Python wheels and sdist attached to this GitHub Release",
    );
  });

  test("still documents the other release artifacts", () => {
    expect(content).toContain("## Neovim Plugin");
    expect(content).toContain("## C FFI Library (for Bun/Node/Python)");
    expect(content).toContain("## MCP Server");
    expect(content).toContain("## Python Package");
  });

  test("keeps the mcp update instructions", () => {
    expect(content).toContain("Update mcp via:");
    expect(content).toContain("install-mcp.sh");
  });
});

describe(".pi/skills/release/SKILL.md", () => {
  const skillRelPath = ".pi/skills/release/SKILL.md";
  const content = readRepoFile(skillRelPath);
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);

  test("has YAML frontmatter with name and description", () => {
    expect(frontmatter).not.toBeNull();
    const body = frontmatter![1];
    expect(body).toMatch(/^name:\s*release\s*$/m);
    expect(body).toContain("GroepOnline/pi-tools");
    expect(body).toContain("@groeponline/*");
  });

  test("links to docs/RELEASE.md and the target exists", () => {
    const linkMatch = content.match(
      /\[`docs\/RELEASE\.md`\]\((\.\.\/\.\.\/\.\.\/docs\/RELEASE\.md)\)/,
    );
    expect(linkMatch).not.toBeNull();

    const skillDir = path.dirname(path.join(REPO_ROOT, skillRelPath));
    const resolved = path.resolve(skillDir, linkMatch![1]);
    expect(resolved).toBe(path.join(REPO_ROOT, "docs", "RELEASE.md"));
    expect(fs.existsSync(resolved)).toBe(true);
  });

  test("documents the tag-push publish flow", () => {
    expect(content).toContain("@groeponline/pi-tools");
    expect(content).toContain("@groeponline/fff-node");
    expect(content).toContain("@groeponline/fff-bun");
    expect(content).toContain("Manual `workflow_dispatch` republishes npm only.");
  });

  test("documents publish restrictions", () => {
    expect(content).toContain("Do not republish `@ff-labs/fff-bin-*`.");
    expect(content).toContain("Do not publish crates.io or PyPI from a laptop.");
    expect(content).toContain("Do not tag any other git remote.");
  });
});

describe("AGENTS.md", () => {
  const content = readRepoFile("AGENTS.md");

  test("opens with the new heading", () => {
    expect(content.startsWith("# To Clankers")).toBe(true);
  });

  test("names the shipped pi extension package", () => {
    expect(content).toContain("`@groeponline/pi-tools`");
    expect(content).not.toContain("`@groeponline/pi-fff`");
  });

  test("lists the current development commands", () => {
    for (const cmd of [
      "make build",
      "make lint",
      "make format",
      "make test",
      "make test-node",
      "bun test packages/pi-tools/test/",
    ]) {
      expect(content).toContain(cmd);
    }
  });

  test("documents the package publish list", () => {
    expect(content).toContain(
      "We publish `@groeponline/pi-tools`, `@groeponline/fff-node`, and `@groeponline/fff-bun`.",
    );
  });

  test("links to docs/RELEASE.md and the target exists", () => {
    expect(content).toContain("[`docs/RELEASE.md`](./docs/RELEASE.md)");
    expect(repoPathExists("docs/RELEASE.md")).toBe(true);
  });
});

describe("README.md", () => {
  const content = readRepoFile("README.md");

  test("uses the plain FFF logo alt text", () => {
    expect(content).toContain('alt="FFF"');
    expect(content).not.toContain('alt="GroepOnline FFF"');
  });

  test("advertises the pi-tools install commands", () => {
    expect(content).toContain("pi install npm:@groeponline/pi-tools");
    expect(content).not.toContain("pi install npm:@groeponline/pi-fff");
    expect(content).toContain("pi install -l npm:@groeponline/pi-tools");
  });

  test("publishes list matches the @groeponline scope set", () => {
    expect(content).toContain(
      "`@groeponline/pi-tools`, `@groeponline/fff-node`, `@groeponline/fff-bun`",
    );
  });

  test("keeps the FAQ backronym list", () => {
    expect(content).toContain("### What does FFF stand for?");
    expect(content).toContain("**F**ast **F**ile **F**inder");
    expect(content).toContain("**F**uzzy **F**ile **F**inder");
  });

  describe("table of contents", () => {
    const headings = [...content.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    const anchors = [...content.matchAll(/\(#([a-z0-9-]+)\)/g)].map((m) => m[1]);

    test("collected at least the expected sections", () => {
      expect(headings).toEqual(
        expect.arrayContaining([
          "Pi agent extension",
          "Packages",
          "Carried components",
          "Performance",
          "Repository layout",
          "Contributing",
        ]),
      );
    });

    test.each(anchors)("anchor #%s resolves to a real heading slug", (anchor) => {
      const slugs = headings.map(githubSlug);
      expect(slugs).toContain(anchor);
    });
  });

  describe("relative link targets", () => {
    const links = extractRelativeMarkdownLinks(content);

    test("extracted a substantial number of relative links", () => {
      expect(links.length).toBeGreaterThan(10);
    });

    test("known-good documentation and source links resolve", () => {
      for (const link of [
        "./docs/RELEASE.md",
        "./AGENTS.md",
        "./LICENSE",
        "./install-mcp.sh",
        "./install-mcp.ps1",
        "./crates/fff-mcp/",
        "./crates/fff-core/",
        "./crates/fff-c/",
        "./crates/fff-c/include/fff.h",
        "./crates/fff-nvim/",
        "./lua/",
        "./assets/logo-orange.png",
        "./assets/logo-dark.png",
        "./assets/logo-light.png",
      ]) {
        expect(links).toContain(link);
        expect(repoPathExists(link)).toBe(true);
      }
    });
  });
});

describe("docs/EXTENSION_ROADMAP.md", () => {
  const content = readRepoFile("docs/EXTENSION_ROADMAP.md");

  test("recommended release sequence no longer cites an external PR/issue by number", () => {
    const sequenceSection = content
      .split("## Recommended next release sequence")[1]
      ?.split("## Explicit non-goals")[0];
    expect(sequenceSection).toBeDefined();
    expect(sequenceSection).not.toContain("PR #779");
    expect(sequenceSection).not.toContain("dmtrKovalenko");
  });

  test("reference [3] now points at this repository's own issue tracker", () => {
    expect(content).toContain(
      '[3]: https://github.com/GroepOnline/pi-tools/issues "GroepOnline pi-tools issues"',
    );
    expect(content).not.toContain('github.com/dmtrKovalenko/fff/issues"');
  });
});

describe("docs/RELEASE.md", () => {
  const content = readRepoFile("docs/RELEASE.md");

  test("lists all three published npm packages", () => {
    for (const pkg of [
      "@groeponline/pi-tools",
      "@groeponline/fff-node",
      "@groeponline/fff-bun",
    ]) {
      expect(content).toContain(pkg);
    }
  });

  test("documents the tag-push release flow", () => {
    expect(content).toContain("git tag -a vX.Y.Z");
    expect(content).toContain("git push origin main");
    expect(content).toContain("git push origin vX.Y.Z");
  });

  test("calls out what is not part of a GroepOnline release", () => {
    expect(content).toContain("## Not part of a GroepOnline release");
    expect(content).toContain("Do not retag or republish `@ff-labs/fff-bin-*`.");
    expect(content).toContain(
      "Do not push tags to any repository other than `GroepOnline/pi-tools`.",
    );
  });
});

describe("docs/extension-research-notes.md", () => {
  const content = readRepoFile("docs/extension-research-notes.md");

  test("renamed the upstream-issue section to a repo-neutral heading", () => {
    expect(content).toContain("## Issue backlog review");
    expect(content).not.toContain("## Upstream issue review");
  });

  test("dropped the fork/repository-identity section entirely", () => {
    expect(content).not.toContain("## Repository identity constraint");
    expect(content).not.toContain("fork: true");
  });

  test("renamed the GroepOnline findings section", () => {
    expect(content).toContain("## Additional GroepOnline findings");
    expect(content).not.toContain("## Additional GroepOnline and upstream findings");
  });

  test("no longer links out to issue #795 or #714 for the removed claims", () => {
    expect(content).not.toContain("github.com/dmtrKovalenko/fff/issues/795");
    expect(content).not.toContain("github.com/dmtrKovalenko/fff/issues/714");
  });
});

describe("package READMEs reference the renamed repository directory", () => {
  test.each(["packages/fff-bun/README.md", "packages/fff-node/README.md"])(
    "%s clones into pi-tools, not fff",
    (relPath) => {
      const content = readRepoFile(relPath);
      expect(content).toContain("git clone https://github.com/GroepOnline/pi-tools");
      expect(content).toContain("cd pi-tools");
      expect(content).not.toMatch(/\ncd fff\n/);
    },
  );
});

describe("packages/fff-python/README.md", () => {
  const content = readRepoFile("packages/fff-python/README.md");

  test("no longer advertises a PyPI pip install", () => {
    expect(content).not.toContain("pip install fff-search");
  });

  test("points readers at building from source instead", () => {
    expect(content).toContain("Import as `fff`. Build from this repository (see below).");
  });
});
