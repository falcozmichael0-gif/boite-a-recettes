import { build } from "esbuild";
import { cpSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
rmSync("test/site", { recursive: true, force: true }); mkdirSync("test/site", { recursive: true });
cpSync("public", "test/site", { recursive: true });
writeFileSync("test/config-test.js", 'export const firebaseConfig = { test: true };');
const factice = { name: "factice", setup(b) {
  b.onResolve({ filter: /^firebase\// }, () => ({ path: process.cwd() + "/test/firebase-factice.js" }));
  b.onResolve({ filter: /\.\/config\.js$/ }, () => ({ path: process.cwd() + "/test/config-test.js" }));
} };
await build({ entryPoints: ["src/main.js"], bundle: true, format: "esm", outfile: "test/site/app.js", plugins: [factice] });
