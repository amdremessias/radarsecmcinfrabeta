// Polyfill ES2025 Set methods (Node < 22) — injetado como banner do bundle do worker
// via --banner:js=@scripts/set-polyfill.cjs. Sem isso o worker quebra em node:20-slim
// (ex.: execa e dependências usam Set.prototype.union etc.).
if (typeof Set.prototype.union !== 'function') {
  Set.prototype.union = function (other) {
    const out = new Set(this);
    for (const value of other) out.add(value);
    return out;
  };
  Set.prototype.intersection = function (other) {
    const out = new Set();
    for (const value of this) if (other.has(value)) out.add(value);
    return out;
  };
  Set.prototype.difference = function (other) {
    const out = new Set(this);
    for (const value of other) out.delete(value);
    return out;
  };
  Set.prototype.symmetricDifference = function (other) {
    const out = new Set(this);
    for (const value of other) out.has(value) ? out.delete(value) : out.add(value);
    return out;
  };
  Set.prototype.isSubsetOf = function (other) {
    for (const value of this) if (!other.has(value)) return false;
    return true;
  };
  Set.prototype.isSupersetOf = function (other) {
    for (const value of other) if (!this.has(value)) return false;
    return true;
  };
  Set.prototype.isDisjointFrom = function (other) {
    for (const value of this) if (other.has(value)) return false;
    return true;
  };
}