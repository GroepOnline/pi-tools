import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Resolve once to avoid repeated environment and passwd lookups.
export const HOME_DIR = path.resolve(os.homedir());

// Compatible Neovim FFF database directory names.
const NVIM_FRECENCY_DIR = "fff_nvim";
const NVIM_HISTORY_DIR = "fff_queries";

export interface DbPaths {
  frecency: string;
  history: string;
}

export function isHomeDir(dir: string): boolean {
  return path.resolve(dir) === HOME_DIR;
}

// Prefer explicit paths, then compatible editor data, then Pi-local storage.
export function resolveDbPaths(overrides: {
  frecency?: string;
  history?: string;
}): DbPaths {
  return {
    frecency:
      overrides.frecency ??
      existingDir(nvimCacheDir(), NVIM_FRECENCY_DIR) ??
      path.join(piDataDir(), "fff", "frecency"),
    history:
      overrides.history ??
      existingDir(nvimDataDir(), NVIM_HISTORY_DIR) ??
      path.join(piDataDir(), "fff", "history"),
  };
}

function nvimCacheDir(): string {
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg) return path.join(xdg, "nvim");
  if (process.platform === "win32" && process.env.LOCALAPPDATA)
    return path.join(process.env.LOCALAPPDATA, "nvim-data", "cache");
  return path.join(HOME_DIR, ".cache", "nvim");
}

function nvimDataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return path.join(xdg, "nvim");
  if (process.platform === "win32" && process.env.LOCALAPPDATA)
    return path.join(process.env.LOCALAPPDATA, "nvim-data");
  return path.join(HOME_DIR, ".local", "share", "nvim");
}

export function piDataDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? path.join(HOME_DIR, ".pi", "agent");
}

// LMDB environments must be directories.
function existingDir(parent: string, name: string): string | undefined {
  const candidate = path.join(parent, name);
  try {
    return fs.statSync(candidate).isDirectory() ? candidate : undefined;
  } catch {
    return undefined;
  }
}
