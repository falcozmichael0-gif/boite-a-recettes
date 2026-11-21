// Remplace Firebase pour tester l'interface sans réseau : un utilisateur connecté et une base en mémoire.
const base = new Map(); const ecoutes = [];
const recette = (id, titre, cat, ing) => base.set(`utilisateurs/u1/recettes/${id}`, { titre, categorie: cat, tags: ["test"], portions: 4, tempsPreparation: 15, tempsCuisson: 20, difficulte: "Facile", ingredients: ing, etapes: ["Couper.", "Cuire.", "Servir."], astuces: "", plateforme: "instagram", sourceUrl: "https://www.instagram.com/p/x", texteOriginal: "texte", favori: false, ajouteLe: "2026-11-0" + id.slice(-1) + "T10:00:00Z" });
recette("r1", "Pâtes fusilli crémeuses au poulet", "Plats", [{ quantite: 300, unite: "g", nom: "blanc de poulet" }, { quantite: 200, unite: "g", nom: "fusilli" }, { quantite: 200, unite: "ml", nom: "crème entière" }, { quantite: null, unite: "", nom: "sel" }]);
recette("r2", "Salade de pickles concombre, feta & tomates cerises", "Entrées", [{ quantite: 2, unite: "", nom: "concombre" }, { quantite: 150, unite: "g", nom: "feta" }]);
export const initializeApp = () => ({});
export const getAuth = () => ({});
export class GoogleAuthProvider {}
export const signInWithPopup = async () => {}, signInWithRedirect = async () => {}, getRedirectResult = async () => null, signOut = async () => {};
export const onAuthStateChanged = (a, cb) => setTimeout(() => cb({ uid: "u1", email: "test@exemple.fr" }), 50);
export const initializeFirestore = () => ({}), persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({});
export const collection = (db, ...p) => ({ type: "col", path: p.join("/") });
let n = 0;
export const doc = (a, ...p) => { const path = a.type === "col" ? a.path + "/" + (p[0] || "auto" + (++n)) : p.join("/"); return { type: "doc", path, id: path.split("/").pop() }; };
const notifier = () => ecoutes.forEach(e => e());
export const onSnapshot = (ref, cb) => {
  const f = () => ref.type === "col"
    ? cb({ docs: [...base].filter(([k]) => k.startsWith(ref.path + "/") && k.split("/").length === ref.path.split("/").length + 1).map(([k, v]) => ({ id: k.split("/").pop(), data: () => v })) })
    : cb({ exists: () => base.has(ref.path), data: () => base.get(ref.path), metadata: { hasPendingWrites: false } });
  ecoutes.push(f); setTimeout(f, 10); return () => {};
};
export const setDoc = async (ref, v) => { base.set(ref.path, structuredClone(v)); setTimeout(notifier, 5); };
export const deleteDoc = async ref => { base.delete(ref.path); setTimeout(notifier, 5); };
export const writeBatch = () => { const ops = []; return { set: (r, v) => ops.push([r, v]), commit: async () => { ops.forEach(([r, v]) => base.set(r.path, v)); notifier(); } }; };
