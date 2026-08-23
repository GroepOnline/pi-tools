import assert from "node:assert/strict";
import test from "node:test";
import { importsDependency } from "./package-contract-runtime.mjs";

const dep = "@sinclair/typebox";

test("type-only import/export declarations are not runtime dependencies", () => {
  for (const source of [
    'import type { TSchema } from "@sinclair/typebox";',
    'export type { TSchema } from "@sinclair/typebox";',
    'import { type TSchema, type TObject } from "@sinclair/typebox";',
    'export { type TSchema, type TObject } from "@sinclair/typebox";',
  ]) {
    assert.equal(importsDependency(source, dep), false, source);
  }
});

test("mixed and runtime imports/exports remain runtime dependencies", () => {
  for (const source of [
    'import { Type, type TSchema } from "@sinclair/typebox";',
    'export { Type, type TSchema } from "@sinclair/typebox";',
    'import Type from "@sinclair/typebox";',
    'import * as TypeBox from "@sinclair/typebox";',
    'import "@sinclair/typebox";',
    'const TypeBox = await import("@sinclair/typebox");',
    'const TypeBox = require("@sinclair/typebox");',
  ]) {
    assert.equal(importsDependency(source, dep), true, source);
  }
});
