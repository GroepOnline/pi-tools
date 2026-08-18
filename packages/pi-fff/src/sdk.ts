import type { FileFinderApi, InitOptions, Result } from "@groeponline/fff-node";

export const SCAN_TIMEOUT_MS = 15_000;

/** Resolves the Node or Bun SDK at runtime. */
export type FileFinderStatic = {
  create(options: InitOptions): Result<FileFinderApi>;
};

let sdkPromise: Promise<{ FileFinder: FileFinderStatic }> | null = null;

function detectRuntime(): "bun" | "node" {
  if (typeof (globalThis as { Bun?: unknown }).Bun !== "undefined") return "bun";
  if (
    typeof process !== "undefined" &&
    (process as { versions?: { bun?: string } }).versions?.bun
  )
    return "bun";
  return "node";
}

export function loadSdk(): Promise<{ FileFinder: FileFinderStatic }> {
  if (sdkPromise) return sdkPromise;

  // Preserve the first native-module import across Pi reloads to avoid a Bun reload hang.
  const g = globalThis as Record<string, unknown>;
  if (g.__fffSdkPromiseGlobal) {
    sdkPromise = g.__fffSdkPromiseGlobal as Promise<{ FileFinder: FileFinderStatic }>;
    return sdkPromise;
  }

  // Prefer Node unless the process identifies itself as Bun.
  const pkg = detectRuntime() === "bun" ? "@groeponline/fff-bun" : "@groeponline/fff-node";
  const p = import(pkg) as Promise<{ FileFinder: FileFinderStatic }>;
  sdkPromise = p;
  (globalThis as Record<string, unknown>).__fffSdkPromiseGlobal = p;
  return p;
}
