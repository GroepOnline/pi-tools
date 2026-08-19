import { describe, expect, test } from "bun:test";

import { formatGrepOutput } from "../src/index.js";

const result = {
  items: [
    {
      relativePath: "src/example.ts",
      lineNumber: 12,
      lineContent: "export function example() { return true; }",
      contextBefore: ["const before = true;"],
      contextAfter: ["const after = true;"],
      gitStatus: "clean",
    },
  ],
  totalMatched: 1,
  totalFiles: 1,
} as never;

describe("formatGrepOutput", () => {
  test("keeps contextual grouped output by default", () => {
    const output = formatGrepOutput(result);

    expect(output).toContain("src/example.ts");
    expect(output).toContain(" 11- const before = true;");
    expect(output).toContain(" 12: export function example()");
    expect(output).toContain(" 13- const after = true;");
  });

  test("renders compact path-line-match rows without context", () => {
    const output = formatGrepOutput(result, true);

    expect(output).toBe("src/example.ts:12: export function example() { return true; }");
    expect(output).not.toContain("before");
    expect(output).not.toContain("after");
  });

  test("uses a stable empty-result message", () => {
    expect(formatGrepOutput({ items: [] } as never)).toBe("No matches found");
  });
});
