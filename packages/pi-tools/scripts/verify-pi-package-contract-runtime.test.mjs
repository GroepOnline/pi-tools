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

test("returns false when the dependency is never referenced", () => {
  for (const source of [
    "",
    'import { Type } from "@earendil-works/pi-tui";',
    "export const noop = 1;",
  ]) {
    assert.equal(importsDependency(source, dep), false, source);
  }
});

test("detects subpath imports and requires of the dependency", () => {
  for (const source of [
    'import { Value } from "@sinclair/typebox/value";',
    'import "@sinclair/typebox/compiler";',
    'const { Value } = require("@sinclair/typebox/value");',
  ]) {
    assert.equal(importsDependency(source, dep), true, source);
  }
});

test("does not false-positive on similarly named packages", () => {
  for (const source of [
    'import { Type } from "@sinclair/typebox-extra";',
    'import { Type } from "@sinclair/typeboxx";',
    'const x = require("not-sinclair/typebox");',
  ]) {
    assert.equal(importsDependency(source, dep), false, source);
  }
});

test("detects declarations that span multiple lines", () => {
  const source = 'import {\n  Type,\n  type TSchema,\n} from "@sinclair/typebox";';
  assert.equal(importsDependency(source, dep), true, source);
});
