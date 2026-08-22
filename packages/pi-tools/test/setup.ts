import { mock } from "bun:test";

// Preload mocks for optional dependencies so every test file can import
// src/index.ts without requiring @earendil-works/pi-tui or @sinclair/typebox
// to be installed.

mock.module("@earendil-works/pi-tui", () => ({
  Text: class Text {
    text: string;
    constructor(text: string) {
      this.text = text;
    }
    setText(text: string) {
      this.text = text;
    }
  },
}));

// typebox Type builder is used for schema definitions in index.ts.
// Tests that exercise the real schema are in extension.test.ts which
// provides its own mock; this preload just needs to make the import succeed.
mock.module("@sinclair/typebox", () => {
  const builderFactory = (..._args: unknown[]): unknown => ({
    _type: "",
    properties: {},
  });
  const handler: ProxyHandler<typeof builderFactory> = {
    get: (_target, prop) => {
      // Return a callable that also carries nested builders.
      const builder = (..._args: unknown[]) => ({
        _type: prop,
        properties: {},
      });
      return new Proxy(builder, handler);
    },
  };
  return {
    Type: new Proxy(builderFactory, handler) as unknown as typeof Proxy,
  };
});
