import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type MockFinder = {
  isDestroyed: boolean;
  waitForScan: ReturnType<typeof mock>;
  mixedSearch: ReturnType<typeof mock>;
  grep: ReturnType<typeof mock>;
  getScanProgress: ReturnType<typeof mock>;
  destroy: ReturnType<typeof mock>;
};

const createCalls: unknown[] = [];
let finders: MockFinder[] = [];
let mixedSearchImpl: ((query: string, options: unknown) => unknown) | undefined;
let grepImpl: ((query: string, options: unknown) => unknown) | undefined;
let scanProgressImpl: (() => unknown) | undefined;

function createMockFinder(): MockFinder {
  return {
    isDestroyed: false,
    waitForScan: mock(async () => undefined),
    getScanProgress: mock(() => {
      if (scanProgressImpl) return scanProgressImpl();
      return {
        ok: true,
        value: {
          scannedFilesCount: 0,
          isScanning: false,
          isWatcherReady: true,
          isWarmupComplete: true,
        },
      };
    }),
    mixedSearch: mock((query: string, options: unknown) => {
      if (mixedSearchImpl) return mixedSearchImpl(query, options);
      return {
        ok: true,
        value: {
          items: [],
          scores: [],
          totalMatched: 0,
          totalFiles: 0,
          totalDirs: 0,
        },
      };
    }),
    grep: mock((query: string, options: unknown) => {
      if (grepImpl) return grepImpl(query, options);
      return {
        ok: true,
        value: { items: [], totalMatched: 0, totalFiles: 0 },
      };
    }),
    destroy: mock(function (this: MockFinder) {
      this.isDestroyed = true;
    }),
  };
}

const finderModule = {
  FileFinder: {
    create: mock((options: unknown) => {
      createCalls.push(options);
      const finder = createMockFinder();
      finders.push(finder);
      return { ok: true, value: finder };
    }),
  },
};

mock.module("@groeponline/fff-node", () => finderModule);
mock.module("@groeponline/fff-bun", () => finderModule);

const schema = (type: string) => (options?: unknown) => ({ type, options });

mock.module("@sinclair/typebox", () => ({
  Type: {
    Array: (items: unknown, options?: unknown) => ({ type: "array", items, options }),
    Boolean: schema("boolean"),
    Number: schema("number"),
    Object: (properties: unknown, options?: unknown) => ({
      type: "object",
      properties,
      options,
    }),
    Optional: (value: Record<string, unknown>) => ({ ...value, optional: true }),
    String: schema("string"),
    Union: (items: unknown[], options?: unknown) => ({ type: "union", items, options }),
  },
}));

const { default: fffExtension } = await import("../src/index");

type EventHandler = (...args: any[]) => unknown;

function createPi(mode?: string, flags: Record<string, unknown> = {}) {
  const events = new Map<string, EventHandler>();
  const commands = new Map<string, any>();
  const registeredFlags = new Set<string>();
  let flagsReady = false;

  const pi = {
    getFlag: mock((name: string) => {
      if (!flagsReady || !registeredFlags.has(name)) return undefined;
      return name === "fff-mode" && mode !== undefined ? mode : flags[name];
    }),
    on: mock((event: string, handler: EventHandler) => {
      events.set(event, (...args) => {
        flagsReady = true;
        return handler(...args);
      });
    }),
    registerCommand: mock((name: string, command: any) => {
      commands.set(name, {
        ...command,
        handler: (...args: any[]) => {
          flagsReady = true;
          return command.handler(...args);
        },
      });
    }),
    registerFlag: mock((name: string) => {
      registeredFlags.add(name);
    }),
    registerTool: mock((_tool: any) => undefined),
    getActiveTools: mock(() => ["read"] as string[]),
    setActiveTools: mock((_names: string[]) => undefined),
    appendEntry: mock(() => undefined),
  };

  return { pi, events, commands };
}

function createContext(cwd = "/tmp/workspace") {
  return {
    cwd,
    sessionManager: {
      getEntries: mock(() => [] as any[]),
    },
    // Signatures mirror the real pi UI surface so mock.calls stays typed.
    ui: {
      addAutocompleteProvider: mock((_factory: (current: any) => any) => undefined),
      notify: mock((_message: string, _level?: string) => undefined),
      setEditorComponent: mock(() => undefined),
      setStatus: mock((_key: string, _text?: string) => undefined),
    },
  };
}

async function start(mode?: string, cwd?: string, flags: Record<string, unknown> = {}) {
  const setup = createPi(mode, flags);
  const ctx = createContext(cwd);
  fffExtension(setup.pi as any);

  const sessionStart = setup.events.get("session_start");
  expect(sessionStart).toBeDefined();
  await sessionStart?.({ reason: "startup" }, ctx);

  return { ...setup, ctx };
}

async function shutdown(setup: { events: Map<string, EventHandler> }) {
  await setup.events.get("session_shutdown")?.({}, undefined);
}

function currentProvider(
  result = { items: [{ value: "base", label: "base" }], prefix: "ba" },
) {
  return {
    getSuggestions: mock(async () => result),
    applyCompletion: mock(() => ({ lines: ["applied"], cursorLine: 0, cursorCol: 7 })),
    shouldTriggerFileCompletion: mock(() => false),
  };
}

function abortOptions() {
  return { signal: new AbortController().signal };
}

const CONFIG_ENV_KEYS = [
  "PI_CODING_AGENT_DIR",
  "PI_FFF_MODE",
  "FFF_FRECENCY_DB",
  "FFF_HISTORY_DB",
  "FFF_ENABLE_ROOT_SCAN",
  "FFF_ENABLE_HOME_SCAN",
  "TGREP_BIN",
  "TGREP_TIME_BUDGET_MS",
] as const;

const savedEnv: Record<string, string | undefined> = {};
for (const key of CONFIG_ENV_KEYS) savedEnv[key] = process.env[key];

const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tools-extension-"));
const configPath = path.join(agentDir, "pi-tools.json");

beforeEach(() => {
  createCalls.length = 0;
  finders = [];
  mixedSearchImpl = undefined;
  grepImpl = undefined;
  scanProgressImpl = undefined;

  for (const key of CONFIG_ENV_KEYS) delete process.env[key];
  process.env.PI_CODING_AGENT_DIR = agentDir;
  fs.rmSync(configPath, { force: true });
});

afterAll(() => {
  for (const key of CONFIG_ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(agentDir, { recursive: true, force: true });
});

describe("pi-tools global config", () => {
  test("applies every supported startup option", async () => {
    writeConfig({
      mode: "override",
      frecencyDbPath: "/config/frecency",
      historyDbPath: "/config/history",
      enableFsRootScanning: true,
      enableHomeDirScanning: false,
    });

    const setup = await start();
    const toolNames = setup.pi.registerTool.mock.calls.map(([tool]) => tool.name);

    expect(toolNames).toContain("grep");
    expect(toolNames).toContain("find");
    expect(toolNames).not.toContain("ffgrep");
    expect(createCalls[0]).toEqual({
      basePath: "/tmp/workspace",
      frecencyDbPath: "/config/frecency",
      historyDbPath: "/config/history",
      aiMode: true,
      enableHomeDirScanning: false,
      enableFsRootScanning: true,
    });
    await shutdown(setup);
  });

  test("keeps flag and environment precedence", async () => {
    writeConfig({
      mode: "tools-only",
      frecencyDbPath: "/config/frecency",
      historyDbPath: "/config/history",
      enableFsRootScanning: true,
      enableHomeDirScanning: false,
    });
    process.env.PI_FFF_MODE = "override";
    process.env.FFF_FRECENCY_DB = "/env/frecency";
    process.env.FFF_HISTORY_DB = "/env/history";
    process.env.FFF_ENABLE_ROOT_SCAN = "1";
    process.env.FFF_ENABLE_HOME_SCAN = "1";

    const setup = await start("tools-and-ui", undefined, {
      "fff-frecency-db": "/flag/frecency",
      "fff-enable-root-scan": false,
    });
    const toolNames = setup.pi.registerTool.mock.calls.map(([tool]) => tool.name);

    expect(toolNames).toContain("ffgrep");
    expect(toolNames).toContain("fffind");
    expect(createCalls[0]).toEqual({
      basePath: "/tmp/workspace",
      frecencyDbPath: "/flag/frecency",
      historyDbPath: "/env/history",
      aiMode: true,
      enableHomeDirScanning: true,
      enableFsRootScanning: false,
    });
    await shutdown(setup);
  });

  test("falls through invalid flag and environment modes", async () => {
    writeConfig({ mode: "override" });
    process.env.PI_FFF_MODE = "invalid-env-mode";

    const setup = await start("invalid-flag-mode");
    const toolNames = setup.pi.registerTool.mock.calls.map(([tool]) => tool.name);

    expect(toolNames).toContain("grep");
    expect(toolNames).toContain("find");
    expect(toolNames).not.toContain("ffgrep");
    await shutdown(setup);
  });
});

function writeConfig(config: Record<string, unknown>): void {
  fs.writeFileSync(configPath, JSON.stringify(config));
}

describe("pi-tools session mode", () => {
  test("registers tools only after restoring the saved mode", async () => {
    const setup = createPi("tools-and-ui");
    const ctx = createContext();
    ctx.sessionManager.getEntries.mockReturnValue([
      { type: "custom", customType: "fff-mode", data: { mode: "override" } },
    ]);
    fffExtension(setup.pi as any);

    expect(setup.pi.registerTool).not.toHaveBeenCalled();
    await setup.events.get("session_start")?.({ reason: "startup" }, ctx);

    const tools = setup.pi.registerTool.mock.calls.map(([tool]) => tool);
    const toolNames = tools.map((tool) => tool.name);
    expect(toolNames).toContain("grep");
    expect(toolNames).toContain("find");
    expect(toolNames).not.toContain("ffgrep");
    expect(toolNames).not.toContain("fffind");
    const grepTool = tools.find((tool) => tool.name === "grep");
    expect(grepTool.promptGuidelines[0].startsWith("grep:")).toBe(true);
    expect(setup.pi.setActiveTools).toHaveBeenCalledWith(
      expect.arrayContaining(["read", "grep", "find"]),
    );

    await setup.commands.get("fff-mode").handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenLastCalledWith(
      "Current mode: 'override' (flag: tools-and-ui)",
      "info",
    );
    await shutdown(setup);
  });

  test("registers tools before an unbound SDK session's first agent turn", async () => {
    const setup = createPi("override");
    const ctx = createContext();
    fffExtension(setup.pi as any);

    expect(setup.pi.registerTool).not.toHaveBeenCalled();
    await setup.events.get("before_agent_start")?.({}, ctx);

    const toolNames = setup.pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(toolNames).toContain("grep");
    expect(toolNames).toContain("find");
    expect(createCalls).toHaveLength(0);
    await shutdown(setup);
  });

  test("keeps the active mode unchanged until a tool-name switch is reloaded", async () => {
    const setup = await start();

    await setup.commands.get("fff-mode").handler("override", setup.ctx);

    expect(setup.pi.appendEntry).toHaveBeenCalledWith("fff-mode", {
      mode: "override",
    });
    expect(setup.ctx.ui.notify).toHaveBeenLastCalledWith(
      "Mode 'override' saved. Run /reload to apply the tool name change.",
      "info",
    );

    await setup.commands.get("fff-mode").handler("", setup.ctx);
    expect(setup.ctx.ui.notify).toHaveBeenLastCalledWith(
      "Current mode: 'tools-and-ui' (flag: unset)",
      "info",
    );
    await shutdown(setup);
  });
});

// Regression for #743: launching from $HOME must be visible and interruptible.
describe("pi-tools $HOME scan warning", () => {
  test("warns and pins a status when cwd is $HOME", async () => {
    const setup = await start(undefined, os.homedir());

    expect(setup.ctx.ui.notify).toHaveBeenCalledTimes(1);
    const [message, level] = setup.ctx.ui.notify.mock.calls[0];
    expect(message).toContain(os.homedir());
    expect(level).toBe("warning");
    expect(setup.ctx.ui.setStatus).toHaveBeenCalledWith(
      "fff",
      "Agent is indexing $HOME, this can lead to high CPU",
    );
    await shutdown(setup);
  });

  test("stays silent outside $HOME", async () => {
    const { ctx } = await start();

    expect(ctx.ui.notify).not.toHaveBeenCalled();
    expect(ctx.ui.setStatus).not.toHaveBeenCalled();
  });

  test("clears the status once the scan settles", async () => {
    const setup = await start(undefined, os.homedir());

    expect(setup.ctx.ui.setStatus).toHaveBeenLastCalledWith("fff", undefined);
    await shutdown(setup);
  });

  // waitForScan resolves on timeout, so a slow $HOME walk keeps the footer up.
  test("keeps reporting live progress while the scan is still running", async () => {
    scanProgressImpl = () => ({
      ok: true,
      value: {
        scannedFilesCount: 12345,
        isScanning: true,
        isWatcherReady: false,
        isWarmupComplete: false,
      },
    });
    const setup = await start(undefined, os.homedir());

    const lastStatus = setup.ctx.ui.setStatus.mock.calls.at(-1);
    expect(lastStatus?.[0]).toBe("fff");
    expect(lastStatus?.[1]).toContain("12345 files");

    // session_shutdown must stop the poller and clear the footer.
    await shutdown(setup);
    expect(setup.ctx.ui.setStatus).toHaveBeenLastCalledWith("fff", undefined);
  });

  test("no warning when home scanning is disabled", async () => {
    process.env.FFF_ENABLE_HOME_SCAN = "0";
    const setup = await start(undefined, os.homedir());

    expect(setup.ctx.ui.notify).not.toHaveBeenCalled();
    expect(setup.ctx.ui.setStatus).not.toHaveBeenCalled();
    await shutdown(setup);
  });
});

describe("pi-tools grep maxMatchesPerFile", () => {
  async function grepTool(mode = "override") {
    const setup = await start(mode);
    const tools = setup.pi.registerTool.mock.calls.map(([tool]) => tool);
    const tool = tools.find((t) => t.name === "grep" || t.name === "ffgrep");
    expect(tool).toBeDefined();
    return { setup, tool };
  }

  async function runGrep(tool: any, params: Record<string, unknown>) {
    return tool.execute("call-1", { pattern: "needle", ...params }, abortOptions());
  }

  test("defaults maxMatchesPerFile to the page size", async () => {
    const { setup, tool } = await grepTool();

    await runGrep(tool, {});

    const [, options] = finders[0].grep.mock.calls[0];
    expect(options.pageSize).toBe(20);
    expect(options.maxMatchesPerFile).toBe(20);
    await shutdown(setup);
  });

  test("clamps maxMatchesPerFile to the effective page size", async () => {
    const { setup, tool } = await grepTool();

    // Requesting 50 with the default page size of 20 clamps down to 20.
    await runGrep(tool, { maxMatchesPerFile: 50 });

    const [, options] = finders[0].grep.mock.calls[0];
    expect(options.maxMatchesPerFile).toBe(20);
    await shutdown(setup);
  });

  test("honours a smaller maxMatchesPerFile and floors fractional values", async () => {
    const { setup, tool } = await grepTool();

    await runGrep(tool, { limit: 40, maxMatchesPerFile: 3.9 });

    const [, options] = finders[0].grep.mock.calls[0];
    expect(options.pageSize).toBe(40);
    expect(options.maxMatchesPerFile).toBe(3);
    await shutdown(setup);
  });

  test("clamps values below one up to one", async () => {
    const { setup, tool } = await grepTool();

    await runGrep(tool, { maxMatchesPerFile: 0 });

    const [, options] = finders[0].grep.mock.calls[0];
    expect(options.maxMatchesPerFile).toBe(1);
    await shutdown(setup);
  });

  test("propagates the clamped cap to the fuzzy fallback", async () => {
    grepImpl = (_query, options) => {
      // Exact pass returns nothing so the fuzzy fallback runs.
      if ((options as { mode: string }).mode !== "fuzzy") {
        return { ok: true, value: { items: [], totalMatched: 0, totalFiles: 0 } };
      }
      return {
        ok: true,
        value: {
          items: [
            {
              relativePath: "src/example.ts",
              lineNumber: 1,
              lineContent: "needle",
              contextBefore: [],
              contextAfter: [],
              gitStatus: "clean",
            },
          ],
          totalMatched: 1,
          totalFiles: 1,
        },
      };
    };

    const { setup, tool } = await grepTool();

    await runGrep(tool, { maxMatchesPerFile: 5 });

    const calls = finders[0].grep.mock.calls;
    expect(calls).toHaveLength(2);
    const [, fuzzyOptions] = calls[1];
    expect(fuzzyOptions.mode).toBe("fuzzy");
    expect(fuzzyOptions.maxMatchesPerFile).toBe(5);
    await shutdown(setup);
  });
});

describe("pi-tools autocomplete registration", () => {
  test("session_start registers a provider without replacing the editor", async () => {
    const { ctx } = await start();

    expect(ctx.ui.addAutocompleteProvider).toHaveBeenCalledTimes(1);
    expect(ctx.ui.setEditorComponent).not.toHaveBeenCalled();
    expect(createCalls).toEqual([
      {
        basePath: "/tmp/workspace",
        // Resolved defaults are host-dependent; covered by test/db-paths.test.ts.
        frecencyDbPath: expect.any(String),
        historyDbPath: expect.any(String),
        aiMode: true,
        enableHomeDirScanning: true,
        enableFsRootScanning: false,
      },
    ]);
  });

  test("FFF_ENABLE_HOME_SCAN=0 disables home dir scanning", async () => {
    process.env.FFF_ENABLE_HOME_SCAN = "0";
    await start();

    const opts = createCalls[0] as { enableHomeDirScanning: boolean };
    expect(opts.enableHomeDirScanning).toBe(false);
  });

  test("session_start survives hosts without addAutocompleteProvider", async () => {
    const setup = createPi();
    const ctx = {
      cwd: "/tmp/workspace",
      ui: {
        notify: mock(() => undefined),
        setEditorComponent: mock(() => undefined),
      },
    };
    fffExtension(setup.pi as any);

    const sessionStart = setup.events.get("session_start");
    await sessionStart?.({ reason: "startup" }, ctx);

    expect(ctx.ui.notify).not.toHaveBeenCalled();
    expect(createCalls).toHaveLength(1);
  });

  test("delegates non-@ completions to the current provider", async () => {
    const { ctx } = await start();
    const factory = ctx.ui.addAutocompleteProvider.mock.calls[0][0];
    const current = currentProvider();
    const provider = factory(current);

    const result = await provider.getSuggestions(["hello"], 0, 5, abortOptions());

    expect(result).toEqual({ items: [{ value: "base", label: "base" }], prefix: "ba" });
    expect(current.getSuggestions).toHaveBeenCalledTimes(1);
    expect(finders[0].mixedSearch).not.toHaveBeenCalled();
  });

  test("returns FFF-backed @ mention suggestions", async () => {
    mixedSearchImpl = (query, options) => {
      expect(query).toBe("src");
      expect(options).toEqual({ pageSize: 20 });
      return {
        ok: true,
        value: {
          items: [
            {
              type: "file",
              item: {
                relativePath: "src/index.ts",
                fileName: "index.ts",
                size: 1,
                modified: 1,
                accessFrecencyScore: 0,
                modificationFrecencyScore: 0,
                totalFrecencyScore: 0,
                gitStatus: "clean",
              },
            },
            {
              type: "directory",
              item: {
                relativePath: "src/components/",
                dirName: "components/",
                maxAccessFrecency: 0,
              },
            },
          ],
          scores: [],
          totalMatched: 2,
          totalFiles: 1,
          totalDirs: 1,
        },
      };
    };

    const { ctx } = await start();
    const factory = ctx.ui.addAutocompleteProvider.mock.calls[0][0];
    const current = currentProvider();
    const provider = factory(current);

    const result = await provider.getSuggestions(["open @src"], 0, 9, abortOptions());

    expect(result).toEqual({
      prefix: "@src",
      items: [
        {
          value: "@src/index.ts",
          label: "index.ts",
          description: "src/index.ts",
        },
        {
          value: "@src/components/",
          label: "components/",
          description: "src/components/",
        },
      ],
    });
    expect(current.getSuggestions).not.toHaveBeenCalled();
  });

  test("delegates when FFF lookup fails", async () => {
    mixedSearchImpl = () => {
      throw new Error("native lookup failed");
    };

    const { ctx } = await start();
    const factory = ctx.ui.addAutocompleteProvider.mock.calls[0][0];
    const current = currentProvider();
    const provider = factory(current);

    const result = await provider.getSuggestions(["@src"], 0, 4, abortOptions());

    expect(result).toEqual({ items: [{ value: "base", label: "base" }], prefix: "ba" });
    expect(current.getSuggestions).toHaveBeenCalledTimes(1);
  });

  test("tools-only mode bypasses FFF mentions and delegates", async () => {
    const { ctx } = await start("tools-only");
    const factory = ctx.ui.addAutocompleteProvider.mock.calls[0][0];
    const current = currentProvider();
    const provider = factory(current);

    const result = await provider.getSuggestions(["@src"], 0, 4, abortOptions());

    expect(result).toEqual({ items: [{ value: "base", label: "base" }], prefix: "ba" });
    expect(current.getSuggestions).toHaveBeenCalledTimes(1);
    expect(finders[0].mixedSearch).not.toHaveBeenCalled();
  });

  test("/fff-mode changes mention behavior without touching the editor", async () => {
    const { commands, ctx, pi } = await start();
    const factory = ctx.ui.addAutocompleteProvider.mock.calls[0][0];
    const current = currentProvider();
    const provider = factory(current);

    await commands.get("fff-mode").handler("tools-only", ctx);
    await provider.getSuggestions(["@src"], 0, 4, abortOptions());

    expect(pi.appendEntry).toHaveBeenCalledWith("fff-mode", { mode: "tools-only" });
    expect(current.getSuggestions).toHaveBeenCalledTimes(1);
    expect(finders[0].mixedSearch).not.toHaveBeenCalled();
    expect(ctx.ui.setEditorComponent).not.toHaveBeenCalled();
  });

  test("completion application and file-completion trigger delegate to current provider", async () => {
    const { ctx } = await start();
    const factory = ctx.ui.addAutocompleteProvider.mock.calls[0][0];
    const current = currentProvider();
    const provider = factory(current);

    const applied = provider.applyCompletion(
      ["@src"],
      0,
      4,
      { value: "@src/index.ts", label: "index.ts" },
      "@src",
    );
    const shouldTrigger = provider.shouldTriggerFileCompletion(["@src"], 0, 4);

    expect(applied).toEqual({ lines: ["applied"], cursorLine: 0, cursorCol: 7 });
    expect(shouldTrigger).toBe(false);
    expect(current.applyCompletion).toHaveBeenCalledTimes(1);
    expect(current.shouldTriggerFileCompletion).toHaveBeenCalledTimes(1);
  });
});

describe("pi-tools tgrep integration", () => {
  let binDir = "";

  /** Creates an executable shell stub for tgrep integration tests. */
  function writeFakeBin(name: string, body: string): string {
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tools-tgrep-"));
    const bin = path.join(binDir, name);
    fs.writeFileSync(bin, `#!/bin/sh\n${body}\n`);
    fs.chmodSync(bin, 0o755);
    return bin;
  }

  function writeIndexedCwd(): string {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tools-tgrep-cwd-"));
    fs.mkdirSync(path.join(cwd, ".tgrep"));
    return cwd;
  }

  /** Returns the tool names registered through the mocked Pi API. */
  function toolNames(setup: { pi: { registerTool: any } }): string[] {
    return setup.pi.registerTool.mock.calls.map(([tool]: [any]) => tool.name);
  }

  test("registers tgrep and tgrep-status when the binary and index are found", async () => {
    process.env.TGREP_BIN = writeFakeBin("tgrep", "exit 1");
    const cwd = writeIndexedCwd();
    const setup = await start(undefined, cwd);
    try {
      expect(toolNames(setup)).toContain("tgrep");
      expect(setup.commands.has("tgrep-status")).toBe(true);
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("registers the complete tgrep parameter schema", async () => {
    process.env.TGREP_BIN = writeFakeBin("tgrep", "exit 1");
    const cwd = writeIndexedCwd();
    const setup = await start(undefined, cwd);
    try {
      const tool = setup.pi.registerTool.mock.calls
        .map(([registered]: [any]) => registered)
        .find((registered: any) => registered.name === "tgrep");
      const properties = tool.parameters.properties;

      expect(Object.keys(properties).sort()).toEqual(
        [
          "caseSensitive",
          "context",
          "count",
          "filesOnly",
          "fileType",
          "glob",
          "literal",
          "maxCount",
          "path",
          "pattern",
          "wholeWord",
        ].sort(),
      );
      expect(properties.pattern).toMatchObject({ type: "string" });
      expect(properties.pattern.optional).toBeUndefined();
      expect(properties.path).toMatchObject({ type: "string", optional: true });
      expect(properties.glob).toMatchObject({ type: "union", optional: true });
      expect(properties.fileType).toMatchObject({ type: "union", optional: true });
      expect(properties.context.options.description).toContain("0-20");
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("discovers tgrep from PATH when no explicit path is configured", async () => {
    writeFakeBin("tgrep", "exit 1");
    const cwd = writeIndexedCwd();
    const savedPath = process.env.PATH;
    process.env.PATH = binDir;
    try {
      const setup = await start(undefined, cwd);
      try {
        expect(toolNames(setup)).toContain("tgrep");
      } finally {
        await shutdown(setup);
      }
    } finally {
      if (savedPath === undefined) delete process.env.PATH;
      else process.env.PATH = savedPath;
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("skips tgrep when the binary is missing", async () => {
    process.env.TGREP_BIN = "/nonexistent/tgrep";
    const setup = await start();
    try {
      expect(toolNames(setup)).not.toContain("tgrep");
      expect(setup.commands.has("tgrep-status")).toBe(true);
    } finally {
      await shutdown(setup);
    }
  });

  test("skips tgrep when enableTgrep is false", async () => {
    process.env.TGREP_BIN = writeFakeBin("tgrep", "exit 1");
    writeConfig({ enableTgrep: false });
    const cwd = writeIndexedCwd();
    const setup = await start(undefined, cwd);
    try {
      expect(toolNames(setup)).not.toContain("tgrep");
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("skips tgrep when the binary is found but no index exists", async () => {
    process.env.TGREP_BIN = writeFakeBin("tgrep", "exit 1");
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tools-tgrep-cwd-"));
    const setup = await start(undefined, cwd);
    try {
      expect(toolNames(setup)).not.toContain("tgrep");
      expect(setup.commands.has("tgrep-status")).toBe(true);
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("registers tgrep from the configured binary path", async () => {
    const bin = writeFakeBin("configured-tgrep", "exit 1");
    writeConfig({ tgrepBinPath: bin });
    const cwd = writeIndexedCwd();
    const setup = await start(undefined, cwd);
    try {
      expect(toolNames(setup)).toContain("tgrep");
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("does not fall back to config when TGREP_BIN is explicitly missing", async () => {
    const bin = writeFakeBin("configured-tgrep", "exit 1");
    writeConfig({ tgrepBinPath: bin });
    process.env.TGREP_BIN = path.join(binDir, "missing");
    const setup = await start();
    try {
      expect(toolNames(setup)).not.toContain("tgrep");
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
    }
  });

  test("registers tgrep independently of the FFF mode", async () => {
    process.env.TGREP_BIN = writeFakeBin("tgrep", "exit 1");
    const cwd = writeIndexedCwd();
    try {
      for (const mode of ["tools-only", "override"]) {
        const setup = await start(mode, cwd);
        expect(toolNames(setup)).toContain("tgrep");
        await shutdown(setup);
      }
    } finally {
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("steers tgrep by capability rather than repository size", async () => {
    process.env.TGREP_BIN = writeFakeBin("tgrep", "exit 1");
    const cwd = writeIndexedCwd();
    const setup = await start(undefined, cwd);
    try {
      const tool = setup.pi.registerTool.mock.calls
        .map(([t]: [any]) => t)
        .find((t: any) => t.name === "tgrep");
      expect(tool.description).toContain("exact content search");
      expect(tool.description).not.toContain("large repo");
      expect(tool.promptGuidelines[0]).toContain("fuzzy, typo-tolerant, frecency-ranked");
      expect(tool.promptGuidelines[1]).toContain("exact literal or symbol search");
      expect(tool.promptGuidelines.join("\n")).not.toContain("large repo");
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("executes searches through the binary and reports no-match", async () => {
    const cwd = writeIndexedCwd();
    process.env.TGREP_BIN = writeFakeBin("tgrep", "exit 1");
    const setup = await start(undefined, cwd);
    try {
      const tool = setup.pi.registerTool.mock.calls
        .map(([t]: [any]) => t)
        .find((t: any) => t.name === "tgrep");
      expect(tool).toBeDefined();
      const result = await tool.execute("call-1", { pattern: "hello" }, undefined);
      expect(result.content[0].text).toBe("No matches found");
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("returns vimgrep rows from the binary", async () => {
    const cwd = writeIndexedCwd();
    process.env.TGREP_BIN = writeFakeBin("tgrep", "printf 'src/a.ts:3:7:hello\\n'");
    const setup = await start(undefined, cwd);
    try {
      const tool = setup.pi.registerTool.mock.calls
        .map(([t]: [any]) => t)
        .find((t: any) => t.name === "tgrep");
      const result = await tool.execute(
        "call-1",
        { pattern: "hello", path: "src/" },
        undefined,
      );
      expect(result.content[0].text).toBe("src/a.ts:3:7:hello");
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("forwards every search option with a normalized workspace path", async () => {
    const cwd = writeIndexedCwd();
    process.env.TGREP_BIN = writeFakeBin("tgrep", "printf '%s\\n' \"$@\"");
    const setup = await start(undefined, cwd);
    try {
      const tool = setup.pi.registerTool.mock.calls
        .map(([t]: [any]) => t)
        .find((t: any) => t.name === "tgrep");
      const result = await tool.execute(
        "call-1",
        {
          pattern: "fn main",
          path: "./src/../test",
          glob: ["*.ts", "!*.test.ts"],
          fileType: ["js", "ts"],
          literal: false,
          caseSensitive: true,
          wholeWord: true,
          filesOnly: true,
          count: true,
          context: 2,
          maxCount: 5,
        },
        new AbortController().signal,
      );
      expect(result.content[0].text.split("\n")).toEqual([
        "--vimgrep",
        "--case-sensitive",
        "--word-regexp",
        "--type",
        "js",
        "--type",
        "ts",
        "--glob",
        "*.ts",
        "--glob",
        "!*.test.ts",
        "--files-with-matches",
        "--count",
        "-A",
        "2",
        "-B",
        "2",
        "--max-count",
        "5",
        "--",
        "fn main",
        "test",
      ]);
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("rejects an already-aborted search without invoking the binary", async () => {
    const cwd = writeIndexedCwd();
    const marker = path.join(cwd, "invoked");
    process.env.TGREP_BIN = writeFakeBin("tgrep", `touch '${marker}'`);
    const setup = await start(undefined, cwd);
    try {
      const tool = setup.pi.registerTool.mock.calls
        .map(([t]: [any]) => t)
        .find((t: any) => t.name === "tgrep");
      const controller = new AbortController();
      controller.abort();

      await expect(
        tool.execute("call-1", { pattern: "hello" }, controller.signal),
      ).rejects.toThrow("Operation aborted");
      expect(fs.existsSync(marker)).toBe(false);
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("rejects paths outside the workspace before invoking the binary", async () => {
    const cwd = writeIndexedCwd();
    const marker = path.join(cwd, "invoked");
    process.env.TGREP_BIN = writeFakeBin("tgrep", `touch '${marker}'`);
    const setup = await start(undefined, cwd);
    try {
      const tool = setup.pi.registerTool.mock.calls
        .map(([registered]: [any]) => registered)
        .find((registered: any) => registered.name === "tgrep");

      await expect(
        tool.execute("call-1", { pattern: "hello", path: "../outside" }, undefined),
      ).rejects.toThrow("tgrep path must stay inside the workspace");
      expect(fs.existsSync(marker)).toBe(false);
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("/tgrep-status reports the server status", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tools-tgrep-cwd-"));
    process.env.TGREP_BIN = writeFakeBin("tgrep", "echo 'Indexing: complete'");
    const setup = await start(undefined, cwd);
    try {
      await setup.commands.get("tgrep-status").handler("", setup.ctx);
      expect(setup.ctx.ui.notify).toHaveBeenCalledWith("Indexing: complete", "info");
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("/tgrep-status passes the active workspace to the binary", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tools-tgrep-cwd-"));
    process.env.TGREP_BIN = writeFakeBin("tgrep", "printf '%s\\n' \"$@\"");
    const setup = await start(undefined, cwd);
    try {
      await setup.commands.get("tgrep-status").handler("ignored", setup.ctx);
      expect(setup.ctx.ui.notify).toHaveBeenCalledWith(`status\n${cwd}`, "info");
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("/tgrep-status warns without a binary", async () => {
    process.env.TGREP_BIN = "/nonexistent/tgrep";
    const setup = await start();
    try {
      await setup.commands.get("tgrep-status").handler("", setup.ctx);
      expect(setup.ctx.ui.notify).toHaveBeenCalledWith(
        "tgrep binary not found (TGREP_BIN or PATH)",
        "warning",
      );
    } finally {
      await shutdown(setup);
    }
  });

  test("/tgrep-status reports binary failures", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tools-tgrep-cwd-"));
    process.env.TGREP_BIN = writeFakeBin(
      "tgrep",
      "echo 'invalid index metadata' >&2; exit 2",
    );
    const setup = await start(undefined, cwd);
    try {
      await setup.commands.get("tgrep-status").handler("", setup.ctx);
      expect(setup.ctx.ui.notify).toHaveBeenCalledWith(
        "tgrep status failed: tgrep search failed: invalid index metadata",
        "error",
      );
    } finally {
      await shutdown(setup);
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
