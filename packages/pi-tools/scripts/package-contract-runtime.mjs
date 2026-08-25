import ts from "typescript";

function matchesDependency(specifier, dep) {
  return specifier === dep || specifier.startsWith(`${dep}/`);
}

function importDeclarationIsRuntime(node) {
  const clause = node.importClause;
  if (!clause) return true; // side-effect import
  if (clause.isTypeOnly) return false;
  if (clause.name) return true; // default import

  const bindings = clause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return true;
  return bindings.elements.some((specifier) => !specifier.isTypeOnly);
}

function exportDeclarationIsRuntime(node) {
  if (node.isTypeOnly) return false;
  const clause = node.exportClause;
  if (!clause) return true; // export * from "dep"
  if (ts.isNamespaceExport(clause)) return true;
  return clause.elements.some((specifier) => !specifier.isTypeOnly);
}

function stringLiteralText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

/**
 * Return true when source code has a runtime import/export/require of `dep`.
 * TypeScript's parser keeps comments and string examples out of the syntax tree
 * and exposes type-only specifiers explicitly, avoiding regex false positives.
 */
export function importsDependency(text, dep) {
  const source = ts.createSourceFile(
    "package-contract-source.tsx",
    String(text),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  let found = false;

  function visit(node) {
    if (found) return;

    if (ts.isImportDeclaration(node)) {
      const specifier = stringLiteralText(node.moduleSpecifier);
      if (specifier && matchesDependency(specifier, dep) && importDeclarationIsRuntime(node)) {
        found = true;
        return;
      }
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const specifier = stringLiteralText(node.moduleSpecifier);
      if (specifier && matchesDependency(specifier, dep) && exportDeclarationIsRuntime(node)) {
        found = true;
        return;
      }
    }

    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      const specifier = expression ? stringLiteralText(expression) : null;
      if (specifier && matchesDependency(specifier, dep) && !node.isTypeOnly) {
        found = true;
        return;
      }
    }

    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const specifier = stringLiteralText(node.arguments[0]);
      if (specifier && matchesDependency(specifier, dep)) {
        const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
        if (isDynamicImport || isRequire) {
          found = true;
          return;
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return found;
}
