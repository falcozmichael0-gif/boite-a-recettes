// « Qu'est-ce que je peux cuisiner ? » : classe les recettes selon ce qu'on a sous la main. Calcul local, sans appel à l'API.

// Produits de placard qu'on suppose toujours avoir (si l'option est cochée).
const PLACARD = /\b(sel|poivre|huile|vinaigre|eau|sucre|farine|levure|bouillon|epices?|paprika|cumin|curry|curcuma|muscade|cannelle|piment|herbes de provence|thym seche|origan|ail en poudre|oignon en poudre|moutarde|sauce soja|maizena)\b/;

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
// « tomates cerises » → « tomate cerise » : on compare les mots au singulier
const mots = s => norm(s).split(" ").filter(m => m.length > 1).map(m => m.length > 3 ? m.replace(/(s|x)$/, "") : m);

// Mots génériques qu'on tape souvent, et ce qu'ils couvrent dans les recettes.
const FAMILLES = {
  pate: ["pate", "spaghetti", "fusilli", "penne", "tagliatelle", "macaroni", "coquillette", "linguine", "farfalle", "rigatoni", "lasagne", "nouille"],
  fromage: ["fromage", "mozzarella", "parmesan", "emmental", "gruyere", "comte", "feta", "chevre", "cheddar", "ricotta", "mascarpone", "burrata", "reblochon", "raclette"],
  creme: ["creme"],
};

export function lireFrigo(texte) {
  return [...new Set(String(texte || "").split(/[,;\n]+/).map(t => t.trim()).filter(Boolean))];
}

// « ail haché (pour la sauce) » → « ail haché »
export const sansPrecision = nom => String(nom).replace(/\s*\([^)]*\)/g, "").trim();

function correspond(nomIngredient, produit) {
  const a = mots(sansPrecision(nomIngredient)), b = mots(produit);
  const famille = b.length === 1 && FAMILLES[b[0]];
  if (famille) return a.some(x => famille.some(f => x.startsWith(f)));
  if (!b.length) return false;
  // tous les mots du produit tapé se retrouvent dans l'ingrédient (« poulet » ↔ « blanc de poulet »)
  return b.every(m => a.some(x => x === m || (m.length >= 4 && x.startsWith(m)) || (x.length >= 4 && m.startsWith(x))));
}

export function classer(recettes, produits, placard = true) {
  return recettes.map(r => {
    const ings = (r.ingredients || []).filter(i => i.nom);
    // on ne compte ni le placard ni ce qui est facultatif
    const utiles = ings.filter(i => !/facultatif|optionnel/i.test(i.nom) && !(placard && PLACARD.test(" " + norm(sansPrecision(i.nom)) + " ")));
    const trouves = utiles.filter(i => produits.some(p => correspond(i.nom, p)));
    const manquants = utiles.filter(i => !trouves.includes(i));
    return { r, trouves, manquants, total: utiles.length, score: utiles.length ? trouves.length / utiles.length : 0 };
  }).filter(x => x.trouves.length).sort((a, b) => b.score - a.score || a.manquants.length - b.manquants.length);
}
