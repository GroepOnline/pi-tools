import type { FileFinderApi, InitOptions, Result } from "@groeponline/fff-node";
import { type FileFinderStatic, loadSdk, SCAN_TIMEOUT_MS } from "./sdk";

export interface PickerOptions {
  basePath: string;
  enableHomeDirScanning?: boolean;
  enableFsRootScanning?: boolean;
}

/** Opens workspace and auxiliary pickers against the same local databases. */
export class FilePickerFactory {
  private dbDisabled = false;
  private readonly frecencyDbPath: string;
  private readonly historyDbPath: string;
  private readonly onDbFailure?: (error: string) => void;

  constructor(opts: {
    frecencyDbPath: string;
    historyDbPath: string;
    onDbFailure?: (error: string) => void;
  }) {
    this.frecencyDbPath = opts.frecencyDbPath;
    this.historyDbPath = opts.historyDbPath;
    this.onDbFailure = opts.onDbFailure;
  }

  /** Whether new pickers bypass unavailable databases. */
  get databasesDisabled(): boolean {
    return this.dbDisabled;
  }

  /** Opens a picker and waits for the initial scan budget. */
  async create(options: PickerOptions): Promise<FileFinderApi> {
    const { FileFinder } = await loadSdk();
    const result = this.openWithDbFallback(FileFinder, options);

    if (!result.ok) {
      throw new Error(
        `Failed to create FFF file picker for ${options.basePath}: ${result.error}`,
      );
    }

    // The scan wait bounds startup but does not guarantee a complete index.
    await result.value.waitForScan(SCAN_TIMEOUT_MS);
    return result.value;
  }

  private openWithDbFallback(
    FileFinder: FileFinderStatic,
    options: PickerOptions,
  ): Result<FileFinderApi> {
    const init: InitOptions = { ...options, aiMode: true };
    if (this.dbDisabled) return FileFinder.create(init);

    const result = FileFinder.create({
      ...init,
      frecencyDbPath: this.frecencyDbPath,
      historyDbPath: this.historyDbPath,
    });
    if (result.ok) return result;

    // Keep search available when local database initialization fails.
    const dbLess = FileFinder.create(init);
    if (!dbLess.ok) return result;

    this.dbDisabled = true;
    this.onDbFailure?.(result.error);
    return dbLess;
  }
}
