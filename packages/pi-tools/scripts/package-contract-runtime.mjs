const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function allNamedSpecifiersAreTypeOnly(clause) {
  const trimmed = clause.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  const body = trimmed.slice(1, -1).trim();
  if (!body) return false;
  return body.split(",").every((specifier) => /^type\b/.test(specifier.trim()));
}

export function importsDependency(text, dep) {
  const d = escapeRegExp(dep);
  const target = `${d}(?:\\/[^"']*)?`;

  if (
    new RegExp(`\\bimport\\s*(?:\\(|["'])\\s*["']?${target}["']`).test(text) ||
    new RegExp(`\\brequire\\s*\\(\\s*["']${target}["']`).test(text)
  ) {
    return true;
  }

  const declarations = new RegExp(
    `\\b(?:import|export)\\s+([^;\\n]*?)\\s+from\\s+["']${target}["']`,
    "g",
  );

  for (const match of text.matchAll(declarations)) {
    const clause = match[1].trim();
    if (/^type\b/.test(clause)) continue;
    if (allNamedSpecifiersAreTypeOnly(clause)) continue;
    return true;
  }

  return false;
}
