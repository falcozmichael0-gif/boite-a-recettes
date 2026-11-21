// Construit le site dans docs/ (dossier publié par GitHub Pages).
import { build } from "esbuild";
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

rmSync("docs", { recursive: true, force: true });
mkdirSync("docs", { recursive: true });
cpSync("public", "docs", { recursive: true });
// Version affichée dans Réglages : numéro de package.json + date de construction.
const numero = JSON.parse(readFileSync("package.json", "utf8")).version.replace(/\.0$/, "");
const version = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const infos = { numero, build: version, date: new Date().toISOString() };
await build({ entryPoints: ["src/main.js"], bundle: true, format: "esm", minify: true, target: "es2022", outfile: "docs/app.js", legalComments: "none",
  define: { __VERSION_APPLI__: JSON.stringify(infos) } });
writeFileSync("docs/version.json", JSON.stringify(infos));
writeFileSync("docs/sw.js", readFileSync("docs/sw.js", "utf8").replace("__VERSION__", version));
writeFileSync("docs/.nojekyll", "");
console.log("docs/ construit, version", numero, version);
