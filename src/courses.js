// Liste de courses : rangement par rayon et fusion des quantités.

// Rayons dans l'ordre d'un parcours de supermarché ; la première règle qui correspond l'emporte.
const RAYONS = [
  ["Épicerie sucrée", /sucre|chocolat|cacao|levure|vanille|sirop/],
  ["Épicerie salée", /en poudre|séch|moulu|concassé|\bpoivre\b|\bsel\b|bouillon|sauce|vinaigre|huile|épices?\b/],
  ["Fruits & légumes", /pomme de terre|patate|oignon|\bail\b|échalote|carotte|tomate|salade|laitue|roquette|citron|courgette|poivron|champignon|persil|basilic|coriandre|ciboulette|menthe|thym|romarin|laurier|aneth|poireau|épinard|aubergine|concombre|avocat|gingembre|\bchou|brocoli|haricots? verts?|céleri|navet|potiron|courge|butternut|fenouil|radis|betterave|asperge|\bpommes?\b|poires?|banane|fraise|framboise|myrtille|orange|clémentine|mangue|ananas|raisin(?! sec)|pêche|abricot|cerise|kiwi|fruits? rouges?/],
  ["Boucherie & poissonnerie", /poulet|volaille|dinde|canard|bœuf|boeuf|veau|porc|agneau|viande|haché|steak|entrecôte|faux-filet|escalope|filet mignon|lardon|bacon|jambon|saucisse|chorizo|merguez|saumon|thon|cabillaud|colin|poisson|crevette|moule|calamar|fruits de mer/],
  ["Crèmerie & œufs", /\blait\b|crème|beurre|œuf|oeuf|fromage|yaourt|mozzarella|parmesan|gruyère|emmental|comté|mascarpone|ricotta|feta|chèvre|cheddar|reblochon|raclette|burrata/],
  ["Frais", /pâte feuilletée|pâte brisée|pâte sablée|pâte à pizza|tofu|gnocchi|pâtes fraîches/],
  ["Boulangerie", /\bpain|baguette|brioche|tortilla|wrap|pita|biscotte/],
  ["Épicerie salée", /pâtes|spaghetti|tagliatelle|penne|fusilli|macaroni|coquillettes|nouilles|sésame|lasagne|\briz\b|semoule|quinoa|boulgour|lentille|pois chiche|haricots? rouges?|épice|curry|cumin|paprika|muscade|curcuma|piment|moutarde|ketchup|mayonnaise|concentré|coulis|olive|câpre|cornichon|chapelure|soja|herbes de provence|conserve/],
  ["Épicerie sucrée", /miel|confiture|farine|maïzena|fécule|amande|noisette|\bnoix\b|pistache|biscuit|spéculoos|caramel|pépites|gélatine|raisins secs|flocons d'avoine|céréales|cannelle/],
  ["Surgelés", /surgel/],
  ["Boissons", /\bvin\b|bière|\bjus\b|eau gazeuse|café|\bthé\b|cidre|rhum|cognac|limonade/],
];
export const AUTRES = "Autres";
export const ORDRE_RAYONS = [...new Set(RAYONS.map(r => r[0])), AUTRES];

export function rayonDe(nom) {
  const n = " " + nom.toLowerCase().replace(/\([^)]*\)/g, " ") + " ";
  for (const [r, re] of RAYONS) if (re.test(n)) return r;
  return AUTRES;
}

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
export const arrondi = v => (v >= 10 ? Math.round(v) : Math.round(v * 4) / 4);
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
export const nombre = v => nf.format(v);

export function ajouterArticle(liste, { nom, quantite = null, unite = "", de = null }) {
  nom = String(nom || "").trim();
  if (!nom) return null;
  const cle = norm(nom) + "|" + norm(unite);
  const existant = liste.find(c => !c.coche && norm(c.nom) + "|" + norm(c.unite) === cle);
  if (existant) {
    if (quantite != null) existant.quantite = arrondi((existant.quantite || 0) + quantite);
    if (de && !existant.de.includes(de)) existant.de.push(de);
    return existant;
  }
  const nouveau = { id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nom, quantite: quantite == null ? null : arrondi(quantite), unite, rayon: rayonDe(nom), coche: false, de: de ? [de] : [] };
  liste.push(nouveau);
  return nouveau;
}

// « 2 l lait » → quantité 2, unité l, nom lait
export function lireSaisie(t) {
  const m = t.match(/^\s*(\d+(?:[.,]\d+)?)\s*(kg|g|mg|l|cl|ml|dl|pièces?|paquets?|boîtes?|sachets?|bouteilles?|pots?|tranches?|x)?\s+(.+)$/i);
  if (!m) return { nom: t.trim() };
  return { quantite: Number(m[1].replace(",", ".")), unite: m[2] && m[2].toLowerCase() !== "x" ? m[2] : "", nom: m[3] };
}

export const libelleQte = c => (c.quantite != null ? nombre(c.quantite) + (c.unite ? " " + c.unite : "") : c.unite || "");

export function texteListe(liste) {
  const groupes = {};
  for (const c of liste.filter(c => !c.coche)) (groupes[c.rayon || AUTRES] ||= []).push(c);
  return "Liste de courses\n" + ORDRE_RAYONS.filter(r => groupes[r]).map(r => `\n${r.toUpperCase()}\n` + groupes[r].map(c => `- ${(libelleQte(c) + " " + c.nom).trim()}`).join("\n")).join("\n");
}
