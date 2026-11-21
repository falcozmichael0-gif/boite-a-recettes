// Construit le site dans docs/ (dossier publié par GitHub Pages).
import { build } from "esbuild";
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

rmSync("docs", { recursive: true, force: true });
mkdirSync("docs", { recursive: true });
cpSync("public", "docs", { recursive: true });
await build({ entryPoints: ["src/main.js"], bundle: true, format: "esm", minify: true, target: "es2022", outfile: "docs/app.js", legalComments: "none" });
const version = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
writeFileSync("docs/sw.js", readFileSync("docs/sw.js", "utf8").replace("__VERSION__", version));
writeFileSync("docs/.nojekyll", "");
console.log("docs/ construit, version", version);
