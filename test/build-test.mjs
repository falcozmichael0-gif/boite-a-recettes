// Version de test : Firebase remplacé par une base en mémoire, mêmes étapes de construction que build.mjs.
import { build } from "esbuild";
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
rmSync("test/site", { recursive: true, force: true }); mkdirSync("test/site", { recursive: true });
cpSync("public", "test/site", { recursive: true });
writeFileSync("test/config-test.js", 'export const firebaseConfig = { test: true };');
const factice = { name: "factice", setup(b) {
  b.onResolve({ filter: /^firebase\// }, () => ({ path: process.cwd() + "/test/firebase-factice.js" }));
  b.onResolve({ filter: /\.\/config\.js$/ }, () => ({ path: process.cwd() + "/test/config-test.js" }));
} };
const version = process.env.VERSION_TEST || String(Date.now());
const infos = { numero: "test-" + version, build: version, date: new Date().toISOString() };
await build({ entryPoints: ["src/main.js"], bundle: true, format: "esm", outfile: "test/site/app.js", plugins: [factice], define: { __VERSION_APPLI__: JSON.stringify(infos) } });
writeFileSync("test/site/version.json", JSON.stringify(infos));
writeFileSync("test/site/sw.js", readFileSync("test/site/sw.js", "utf8").replace("__VERSION__", version));
writeFileSync("test/site/index.html", readFileSync("test/site/index.html", "utf8").replace('href="style.css"', `href="style.css?v=${version}"`).replace('src="app.js"', `src="app.js?v=${version}"`));
