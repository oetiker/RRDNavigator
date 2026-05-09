import { registerFormatter } from "./core/template.js";
import { formatSmokeping, formatIsoLocal } from "./core/time.js";
import "./elements/rrd-graph.js";
import "./elements/rrd-graph-nav.js";

registerFormatter("iso", ({ epoch }) => new Date(epoch * 1000).toISOString().replace(/\.\d+Z$/, "Z"));
registerFormatter("iso-local", ({ epoch, tz }) => formatIsoLocal(epoch, tz || "UTC"));
registerFormatter("smokeping", ({ epoch, tz }) => formatSmokeping(epoch, tz || "UTC"));
registerFormatter("smokeping-now", ({ epoch, isNow, tz }) => isNow ? "now" : formatSmokeping(epoch, tz || "UTC"));
registerFormatter("rrd", ({ epoch, isNow }) => isNow ? "now" : String(epoch));

export { registerFormatter } from "./core/template.js";
export { registerPreset } from "./elements/rrd-graph-nav.js";
