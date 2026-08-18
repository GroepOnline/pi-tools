import { afterEach, describe, expect, test } from "bun:test";
import { loadFirst, sdkCandidates } from "../src/sdk.js";

const originalSdk = process.env.FFF_SDK;

afterEach(() => {
  if (originalSdk === undefined) delete process.env.FFF_SDK;
  else process.env.FFF_SDK = originalSdk;
});

describe("sdkCandidates", () => {
  test("prefers Bun and keeps Node as fallback", () => {
    expect(sdkCandidates("bun")).toEqual([
      "@groeponline/fff-bun",
      "@groeponline/fff-node",
    ]);
  });

  test("prefers Node and keeps Bun as fallback", () => {
    expect(sdkCandidates("node")).toEqual([
      "@groeponline/fff-node",
      "@groeponline/fff-bun",
    ]);
  });

  test("honours the explicit runtime override", () => {
    process.env.FFF_SDK = "node";
    expect(sdkCandidates("bun")[0]).toBe("@groeponline/fff-node");

    process.env.FFF_SDK = "bun";
    expect(sdkCandidates("node")[0]).toBe("@groeponline/fff-bun");
  });
});

describe("loadFirst", () => {
  test("returns the first successful candidate", async () => {
    const calls: string[] = [];
    const result = await loadFirst(["a", "b"], async (candidate) => {
      calls.push(candidate);
      return { FileFinder: {} as never };
    });

    expect(result.FileFinder).toBeDefined();
    expect(calls).toEqual(["a"]);
  });

  test("falls back after the preferred candidate fails", async () => {
    const calls: string[] = [];
    const result = await loadFirst(["bun", "node"], async (candidate) => {
      calls.push(candidate);
      if (candidate === "bun") throw new Error("Bun entry is not loadable");
      return { FileFinder: {} as never };
    });

    expect(result.FileFinder).toBeDefined();
    expect(calls).toEqual(["bun", "node"]);
  });

  test("rethrows the final error when every candidate fails", async () => {
    await expect(
      loadFirst(["a", "b"], async (candidate) => {
        throw new Error(`failed: ${candidate}`);
      }),
    ).rejects.toThrow("failed: b");
  });
});
