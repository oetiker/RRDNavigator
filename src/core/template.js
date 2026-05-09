const builtins = new Map([
  ["epoch", (v) => String(v.epoch)]
]);
const formatters = new Map(builtins);

export function registerFormatter(name, fn) {
  if (typeof fn !== "function") throw new TypeError("formatter must be a function");
  formatters.set(name, fn);
}

export function _resetFormatters() {
  formatters.clear();
  for (const [k, v] of builtins) formatters.set(k, v);
}

const RE = /\{\{\s*([a-zA-Z_][\w-]*)\s*(?::\s*([a-zA-Z_][\w-]*)\s*)?\}\}/g;

export function compile(template) {
  return (ctx) => template.replace(RE, (_, key, fmtName) => {
    const value = ctx[key];
    if (value === undefined || value === null) return "";
    let fmt = fmtName;
    if (!fmt && typeof value === "object" && "epoch" in value) fmt = "epoch";
    if (fmt) {
      const fn = formatters.get(fmt);
      if (!fn) throw new Error(`Unknown formatter: ${fmt}`);
      return fn(value);
    }
    return String(value);
  });
}
