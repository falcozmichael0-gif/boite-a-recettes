// Remplace Firebase pour tester l'interface sans réseau : base en mémoire (gardée dans localStorage d'un rechargement
// à l'autre) et utilisateur choisi par localStorage « test-user » (u1 = Michael par défaut, u2 = Marie).
const UTILISATEURS = {
  u1: { uid: "u1", email: "michael@exemple.fr", displayName: "Michael Test", photoURL: "" },
  u2: { uid: "u2", email: "marie@exemple.fr", displayName: "Marie Test", photoURL: "" },
};
const charger = () => { try { return new Map(JSON.parse(localStorage.getItem("test-base") || "null") || []); } catch { return new Map(); } };
const base = charger();
const sauver = () => localStorage.setItem("test-base", JSON.stringify([...base]));
if (!base.size) {
  // données « d'avant le partage » : rangées par personne, pour tester la migration
  const recette = (id, titre, cat, ing) => base.set(`utilisateurs/u1/recettes/${id}`, { titre, categorie: cat, tags: ["test"], portions: 4, tempsPreparation: 15, tempsCuisson: 20, difficulte: "Facile", ingredients: ing, etapes: ["Couper.", "Cuire.", "Servir."], astuces: "", plateforme: "instagram", sourceUrl: "https://www.instagram.com/p/x", texteOriginal: "texte", favori: false, ajouteLe: "2026-11-0" + id.slice(-1) + "T10:00:00Z" });
  recette("r1", "Pâtes fusilli crémeuses au poulet", "Plats", [{ quantite: 300, unite: "g", nom: "blanc de poulet" }, { quantite: 200, unite: "g", nom: "fusilli" }, { quantite: 200, unite: "ml", nom: "crème entière" }, { quantite: null, unite: "", nom: "sel" }]);
  recette("r2", "Salade de pickles concombre, feta & tomates cerises", "Entrées", [{ quantite: 2, unite: "", nom: "concombre" }, { quantite: 150, unite: "g", nom: "feta" }]);
  base.set("utilisateurs/u1/donnees/courses", { articles: [{ id: "c1", nom: "lait", quantite: 2, unite: "l", rayon: "Crèmerie & œufs", coche: false, de: [] }] });
  sauver();
}
const ecoutes = [];
const notifier = () => { sauver(); setTimeout(() => ecoutes.forEach(e => e()), 5); };

export const initializeApp = () => ({});
export const getAuth = () => ({});
export class GoogleAuthProvider {}
export const signInWithPopup = async () => {}, signInWithRedirect = async () => {}, getRedirectResult = async () => null, signOut = async () => {};
export const onAuthStateChanged = (a, cb) => setTimeout(() => cb(UTILISATEURS[localStorage.getItem("test-user") || "u1"]), 50);
export const initializeFirestore = () => ({}), persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({});

export const collection = (a, ...p) => ({ type: "col", path: (a?.path ? [a.path, ...p] : p).join("/") });
let n = 0;
export const doc = (a, ...p) => {
  const path = a.type === "col" ? a.path + "/" + (p[0] || "auto" + Date.now().toString(36) + (++n)) : p.join("/");
  return { type: "doc", path, id: path.split("/").pop() };
};

const SUPPR = { __suppr: true };
export const deleteField = () => SUPPR;
export const arrayUnion = (...v) => ({ __union: v });
export const arrayRemove = (...v) => ({ __retrait: v });
function appliquer(cible, cle, v) {
  if (v === SUPPR) delete cible[cle];
  else if (v?.__union) cible[cle] = [...new Set([...(cible[cle] || []), ...v.__union])];
  else if (v?.__retrait) cible[cle] = (cible[cle] || []).filter(x => !v.__retrait.includes(x));
  else cible[cle] = structuredClone(v);
}
function fusion(cible, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !v.__union && !v.__retrait && v !== SUPPR) { if (typeof cible[k] !== "object" || !cible[k]) cible[k] = {}; fusion(cible[k], v); }
    else appliquer(cible, k, v);
  }
}

const instantane = path => ({ id: path.split("/").pop(), exists: () => base.has(path), data: () => structuredClone(base.get(path)), metadata: { hasPendingWrites: false } });
export const getDoc = async ref => instantane(ref.path);
const enfants = path => [...base.keys()].filter(k => k.startsWith(path + "/") && k.split("/").length === path.split("/").length + 1);
export const getDocs = async ref => { const docs = enfants(ref.path).map(instantane); return { docs, size: docs.length }; };
export const onSnapshot = (ref, cb) => {
  const f = () => ref.type === "col" ? cb({ docs: enfants(ref.path).map(instantane) }) : cb(instantane(ref.path));
  ecoutes.push(f); setTimeout(f, 10); return () => { const i = ecoutes.indexOf(f); if (i >= 0) ecoutes.splice(i, 1); };
};
export const setDoc = async (ref, v, opts) => {
  if (opts?.merge && base.has(ref.path)) { const d = base.get(ref.path); fusion(d, v); }
  else { const d = {}; fusion(d, v); base.set(ref.path, d); }
  notifier();
};
export const updateDoc = async (ref, v) => {
  if (!base.has(ref.path)) throw Object.assign(new Error("absent"), { code: "not-found" });
  const d = base.get(ref.path);
  for (const [k, val] of Object.entries(v)) {
    const parts = k.split("."); let c = d;
    for (const p of parts.slice(0, -1)) c = c[p] ||= {};
    appliquer(c, parts.at(-1), val);
  }
  notifier();
};
export const deleteDoc = async ref => { base.delete(ref.path); notifier(); };
export const writeBatch = () => { const ops = []; return { set: (r, v) => ops.push([r, v]), commit: async () => { for (const [r, v] of ops) { const d = {}; fusion(d, v); base.set(r.path, d); } notifier(); } }; };
