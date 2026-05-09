import * as esbuild from "esbuild";
import { mkdirSync, existsSync } from "node:fs";

const watch = process.argv.includes("--watch");
if (!existsSync("dist")) mkdirSync("dist", { recursive: true });

const common = {
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "esm",
  target: ["chrome110", "firefox110", "safari16", "edge110"],
  sourcemap: true,
  logLevel: "info"
};

async function buildOnce() {
  await esbuild.build({ ...common, outfile: "dist/rrdnavigator.js" });
  await esbuild.build({ ...common, outfile: "dist/rrdnavigator.min.js", minify: true });
  console.log("Built dist/rrdnavigator.js and dist/rrdnavigator.min.js");
}

if (watch) {
  const ctx = await esbuild.context({ ...common, outfile: "dist/rrdnavigator.js" });
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await buildOnce();
}
