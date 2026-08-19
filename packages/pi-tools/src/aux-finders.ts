import fs from "node:fs";
import path from "node:path";
import type { FileFinderApi } from "@groeponline/fff-node";
import type { FilePickerFactory } from "./file-picker";
import { HOME_DIR } from "./paths";

export const MAX_AUX = 3;
export const IDLE_TTL_MS = 5 * 60 * 1000;

interface AuxPicker {
  root: string;
  finder: FileFinderApi;
  lastUsed: number;
}

export interface AuxOpts {
  enableFsRootScanning: boolean;
  enableHomeDirScanning?: boolean;
  pickers: FilePickerFactory;
  // Called before an auxiliary finder starts a home-directory scan.
  onHomeDirScan?: (root: string) => void;
}

export class AuxFinderPool {
  private entries: AuxPicker[] = [];
  // Share in-flight creation to avoid duplicate scans for the same root.
  private pending = new Map<string, Promise<AuxPicker>>();
  constructor(private opts: AuxOpts) {}

  destroy(): void {
    for (const e of this.entries) {
      e.finder.destroy();
    }

    this.entries = [];
    this.pending.clear();
  }

  private sweepIdle(now = Date.now()): void {
    const kept: AuxPicker[] = [];
    for (const e of this.entries) {
      if (now - e.lastUsed > IDLE_TTL_MS) {
        if (!e.finder.isDestroyed) e.finder.destroy();
      } else {
        kept.push(e);
      }
    }
    this.entries = kept;
  }

  async acquire(
    maybeRoot: string,
    opts?: { exact?: boolean },
  ): Promise<{ finder: FileFinderApi; root: string }> {
    this.sweepIdle();
    let covering: AuxPicker | null = null;
    for (const e of this.entries) {
      if (e.finder.isDestroyed) continue;
      if (opts?.exact ? e.root !== maybeRoot : !rootCovers(e.root, maybeRoot)) continue;
      if (!covering || e.root.length > covering.root.length) covering = e;
    }

    if (covering) {
      covering.lastUsed = Date.now();
      return { finder: covering.finder, root: covering.root };
    }

    // Await the existing creation instead of starting a duplicate scan.
    const inflight = this.pending.get(maybeRoot);
    if (inflight) {
      const e = await inflight;
      e.lastUsed = Date.now();
      return { finder: e.finder, root: e.root };
    }

    const creation = this.create(maybeRoot).finally(() => {
      this.pending.delete(maybeRoot);
    });
    this.pending.set(maybeRoot, creation);
    const entry = await creation;
    return { finder: entry.finder, root: entry.root };
  }

  private async create(root: string): Promise<AuxPicker> {
    if (this.entries.length >= MAX_AUX) {
      let oldest = this.entries[0];
      for (const e of this.entries) if (e.lastUsed < oldest.lastUsed) oldest = e;
      if (!oldest.finder.isDestroyed) oldest.finder.destroy();
      this.entries = this.entries.filter((e) => e !== oldest);
    }

    const enableHomeDirScanning = this.opts.enableHomeDirScanning ?? true;
    // Notify before an auxiliary finder can scan the entire home tree.
    if (enableHomeDirScanning && rootCovers(root, HOME_DIR)) {
      this.opts.onHomeDirScan?.(root);
    }

    const finder = await this.opts.pickers.create({
      basePath: root,
      enableHomeDirScanning,
      enableFsRootScanning: this.opts.enableFsRootScanning,
    });

    const entry: AuxPicker = { root, finder, lastUsed: Date.now() };
    this.entries.push(entry);
    return entry;
  }

  size(): number {
    this.sweepIdle();
    return this.entries.length;
  }
}

// Use the deepest existing path as the auxiliary root; keep the rest as a constraint.
export function resolveAuxRoot(absPath: string): { root: string; suffix: string } | null {
  const trimmed = path.normalize(absPath.trim()).replace(/\/+$/, "") || "/";
  if (!path.isAbsolute(trimmed)) return null;
  if (trimmed === path.sep) return { root: path.sep, suffix: "" };

  const parts = trimmed.split(path.sep);
  const firstGlob = parts.findIndex((p) => /[*?[{]/.test(p));
  const boundary = firstGlob === -1 ? parts.length : firstGlob;

  for (let i = boundary; i > 0; i--) {
    const candidate = parts.slice(0, i).join(path.sep) || path.sep;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(candidate);
    } catch {
      continue;
    }
    if (stat.isFile()) {
      return {
        root: parts.slice(0, i - 1).join(path.sep) || path.sep,
        suffix: parts.slice(i - 1).join("/"),
      };
    }
    return { root: candidate, suffix: parts.slice(i).join("/") };
  }
  return null;
}

export function isOutsideWorkspaceRelativePath(relativePath: string): boolean {
  return (
    path.isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`)
  );
}

// Route absolute, home-relative, and workspace-escaping paths to an auxiliary finder.
export function routePathConstraint(
  pathConstraint: string | undefined,
  cwd: string,
): { root: string; suffix: string } | null {
  if (!pathConstraint) return null;
  let candidate = pathConstraint.trim();
  if (!candidate) return null;
  if (candidate === "~" || candidate.startsWith("~/"))
    candidate = path.join(HOME_DIR, candidate.slice(1));
  if (!path.isAbsolute(candidate)) {
    // Keep ordinary workspace-relative constraints on the primary finder.
    if (candidate !== ".." && !candidate.startsWith("../")) return null;
    candidate = path.resolve(cwd, candidate);
  }
  const rel = path.relative(cwd, candidate);
  if (!isOutsideWorkspaceRelativePath(rel)) return null;
  return resolveAuxRoot(candidate);
}

export function rootCovers(root: string, target: string): boolean {
  if (root === target) return true;
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  return target.startsWith(prefix);
}
