// Order matters: built-in formatters MUST register before elements upgrade,
// because customElements.define() in the element modules synchronously
// upgrades any matching tags already present in the DOM and immediately
// runs their first render — which would throw "Unknown formatter" otherwise.
import "./core/builtin-formatters.js";
import "./elements/rrd-graph.js";
import "./elements/rrd-graph-nav.js";

export { registerFormatter } from "./core/template.js";
export { registerPreset } from "./elements/rrd-graph-nav.js";
