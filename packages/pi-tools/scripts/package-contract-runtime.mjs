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
  const flat = String(text).replace(/\r?\n/g, " ");
  if (
    new RegExp(`\\bimport\\s+["']${target}["']`).test(flat) ||
    new RegExp(`\\bimport\\s*\\(\\s*["']${target}["']`).test(flat) ||
    new RegExp(`\\brequire\\s*\\(\\s*["']${target}["']`).test(flat)
  ) {
    return true;
  }
  const declarations = new RegExp(
    `\\b(?:import|export)\\s+([^;]*?)\\s+from\\s+["']${target}["']`,
    "g",
  );
  for (const match of flat.matchAll(declarations)) {
    const clause = match[1].trim();
    if (/^type\b/.test(clause)) continue;
    if (allNamedSpecifiersAreTypeOnly(clause)) continue;
    return true;
  }
  return false;
}
