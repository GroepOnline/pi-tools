import type { FileFinderApi, InitOptions, Result } from "@groeponline/fff-node";

export const SCAN_TIMEOUT_MS = 15_000;

/** Resolves the Node or Bun SDK at runtime. */
export type FileFinderStatic = {
  create(options: InitOptions): Result<FileFinderApi>;
};

type SdkModule = { FileFinder: FileFinderStatic };
type SdkLoader = (packageName: string) => Promise<SdkModule>;

let sdkPromise: Promise<SdkModule> | null = null;

function detectRuntime(): "bun" | "node" {
  if (typeof (globalThis as { Bun?: unknown }).Bun !== "undefined") return "bun";
  if (
    typeof process !== "undefined" &&
    (process as { versions?: { bun?: string } }).versions?.bun
  )
    return "bun";
  return "node";
}

function forcedRuntime(): "bun" | "node" | null {
  if (typeof process === "undefined") return null;
  const value = process.env.FFF_SDK?.trim().toLowerCase();
  return value === "bun" || value === "node" ? value : null;
}

/** Returns the preferred SDK followed by the compatible fallback. */
export function sdkCandidates(runtime: "bun" | "node" = detectRuntime()): string[] {
  const selected = forcedRuntime() ?? runtime;
  return selected === "bun"
    ? ["@groeponline/fff-bun", "@groeponline/fff-node"]
    : ["@groeponline/fff-node", "@groeponline/fff-bun"];
}

/** Import package names literally so bundlers can retain both native options. */
const importSdk: SdkLoader = (packageName) => {
  if (packageName === "@groeponline/fff-bun") {
    return import("@groeponline/fff-bun") as Promise<SdkModule>;
  }
  return import("@groeponline/fff-node") as Promise<SdkModule>;
};

/** Loads the first available SDK and rethrows the final import error if none work. */
export async function loadFirst(
  candidates: string[],
  loader: SdkLoader = importSdk,
): Promise<SdkModule> {
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await loader(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("No FFF SDK candidates were provided");
}

export function loadSdk(): Promise<SdkModule> {
  if (sdkPromise) return sdkPromise;

  // Preserve the first native-module import across Pi reloads to avoid a Bun reload hang.
  const g = globalThis as Record<string, unknown>;
  if (g.__fffSdkPromiseGlobal) {
    sdkPromise = g.__fffSdkPromiseGlobal as Promise<SdkModule>;
    return sdkPromise;
  }

  const p = loadFirst(sdkCandidates());
  sdkPromise = p;
  g.__fffSdkPromiseGlobal = p;
  return p;
}
