// Retranscription d'une publication (texte et/ou captures) en recette structurée, via l'API Claude.
// La clé API appartient à l'utilisateur et reste sur son appareil : l'appel part directement du navigateur.
import Anthropic from "@anthropic-ai/sdk";
import { chargerImage, ErreurImage } from "./photo.js";

export const CATEGORIES = ["Apéritifs", "Entrées", "Plats", "Accompagnements", "Soupes", "Desserts", "Pâtisserie", "Pains & viennoiseries", "Petit-déjeuner", "Sauces & bases", "Boissons"];

export const MODELES = {
  precis: { id: "claude-opus-5-5", nom: "Précis (Claude Opus 5.5)", cout: "environ 5 centimes par recette" },
  eco: { id: "claude-haiku-5-5", nom: "Économique (Claude Haiku 5.5)", cout: "moins de 0,5 centime par recette" },
};

const nombreOuNul = { anyOf: [{ type: "number" }, { type: "null" }] };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["estRecette", "raison", "titre", "categorie", "tags", "portions", "tempsPreparation", "tempsCuisson", "difficulte", "ingredients", "etapes", "astuces"],
  properties: {
    estRecette: { type: "boolean" },
    raison: { type: "string" },
    titre: { type: "string" },
    categorie: { type: "string", enum: CATEGORIES },
    tags: { type: "array", items: { type: "string" } },
    portions: nombreOuNul,
    tempsPreparation: nombreOuNul,
    tempsCuisson: nombreOuNul,
    difficulte: { type: "string", enum: ["Facile", "Moyen", "Difficile"] },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["quantite", "unite", "nom"],
        properties: { quantite: nombreOuNul, unite: { type: "string" }, nom: { type: "string" } },
      },
    },
    etapes: { type: "array", items: { type: "string" } },
    astuces: { type: "string" },
  },
};

function consigne(url, texte, nbImages) {
  return `Tu aides à constituer un carnet de recettes de cuisine en français.
Voici le contenu d'une publication de réseau social (Facebook, Instagram, TikTok…) : ${nbImages ? `${nbImages} capture(s) d'écran jointe(s)` : "pas de capture"}${texte ? " et le texte copié ci-dessous" : ""}. Il peut y avoir des emojis, hashtags, mentions, appels à « liker », et sur les captures l'interface de l'appli (heure, batterie, boutons, commentaires). Ignore tout ce qui n'est pas la recette.

Extrais la recette en respectant le schéma JSON demandé :
- Tout en français. Convertis les unités américaines (cups, oz, lb, tbsp, tsp, °F) en unités métriques (g, ml, cl, c. à soupe, c. à café, °C).
- « quantite » est un nombre (0.5 pour ½) ou null si elle n'est pas précisée ou illisible ; « unite » peut être vide (ex. 3 œufs).
- Un ingrédient par ligne : sépare « sel et poivre » en deux ingrédients.
- Temps en minutes, ou null si impossible à estimer. « portions » : un nombre ou null.
- Réécris les étapes clairement, une action principale par étape, sans emojis ni hashtags. N'invente pas d'ingrédient absent.
- « tags » : 3 à 5 étiquettes courtes en minuscules (régime, méthode de cuisson, occasion, ingrédient vedette).
- « astuces » : conseils utiles de la publication, et signale ce qui manque ou est illisible ; sinon chaîne vide.
- Si le contenu n'est pas une recette, mets estRecette à false, explique pourquoi dans « raison », et remplis les autres champs avec des valeurs vides. Sinon « raison » est une chaîne vide.

Lien de la publication : ${url || "(non fourni)"}
${texte ? `Texte de la publication :\n"""\n${texte.slice(0, 30000)}\n"""` : ""}`;
}

// Réduit une image à 1568 px de côté au plus (taille utile pour Claude) et la renvoie en JPEG base64.
export async function imageEnBase64(fichier) {
  const bitmap = await chargerImage(fichier);
  const l = bitmap.naturalWidth || bitmap.width, h = bitmap.naturalHeight || bitmap.height;
  const ratio = Math.min(1, 1568 / Math.max(l, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(l * ratio);
  canvas.height = Math.round(h * ratio);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export class ErreurRecette extends Error {}

function client(cle) {
  // dangerouslyAllowBrowser : acceptable ici car c'est la clé personnelle de l'utilisateur, sur son propre appareil.
  return new Anthropic({ apiKey: cle, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

function messageErreur(e) {
  if (e instanceof Anthropic.AuthenticationError) return "Clé API refusée. Vérifiez-la dans Réglages.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Cette clé n'a pas accès à ce modèle. Vérifiez votre compte sur console.anthropic.com.";
  if (e instanceof Anthropic.RateLimitError) return "Trop de demandes ou crédit épuisé. Vérifiez votre crédit sur console.anthropic.com, puis réessayez.";
  if (e instanceof Anthropic.BadRequestError) {
    if (/credit|billing|balance/i.test(e.message)) return "Crédit API épuisé. Ajoutez du crédit sur console.anthropic.com (Billing).";
    return "Demande refusée par l'API : " + e.message;
  }
  if (e instanceof Anthropic.InternalServerError) return "Le service Claude est surchargé ou indisponible. Réessayez dans un moment.";
  if (e instanceof Anthropic.APIConnectionError) return "Pas de connexion à Internet, ou connexion coupée. Réessayez.";
  if (e instanceof Anthropic.APIUserAbortError) return "Retranscription arrêtée.";
  if (e instanceof Anthropic.APIError) return `Erreur de l'API (${e.status}) : ${e.message}`;
  return e?.message || "Erreur inconnue.";
}

export async function retranscrire({ cle, modele, url, texte, images, signal }) {
  const m = MODELES[modele] || MODELES.precis;
  const contenu = [];
  for (const img of images) {
    try { contenu.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await imageEnBase64(img) } }); }
    catch (e) { throw new ErreurRecette(e instanceof ErreurImage ? e.message : "Une image n'a pas pu être préparée. Essayez avec une autre capture."); }
  }
  contenu.push({ type: "text", text: consigne(url, texte, images.length) });

  const params = {
    model: m.id,
    max_tokens: 16000,
    messages: [{ role: "user", content: contenu }],
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
  };
  // Opus : si un filtre de sécurité refuse à tort, l'API relance sur un autre modèle (pas de repli côté Haiku).
  if (m.id === "claude-opus-5-5") { params.betas = ["server-side-fallback-2026-07-01"]; params.fallbacks = "default"; }

  let rep;
  try {
    rep = await client(cle).beta.messages.create(params, { signal });
  } catch (e) {
    throw new ErreurRecette(messageErreur(e));
  }
  if (rep.stop_reason === "refusal") throw new ErreurRecette("Claude n'a pas pu traiter ce contenu.");
  if (rep.stop_reason === "max_tokens") throw new ErreurRecette("La recette est trop longue pour être retranscrite d'un coup.");
  const texteRep = rep.content.filter(b => b.type === "text").map(b => b.text).join("");
  let r;
  try { r = JSON.parse(texteRep); } catch { throw new ErreurRecette("Réponse illisible. Réessayez."); }
  if (!r.estRecette) throw new ErreurRecette("Pas de recette trouvée" + (r.raison ? " : " + r.raison : "."));
  return {
    titre: String(r.titre || "Recette sans titre"),
    categorie: CATEGORIES.includes(r.categorie) ? r.categorie : "Plats",
    tags: (r.tags || []).map(String).slice(0, 6),
    portions: Number(r.portions) || null,
    tempsPreparation: Number(r.tempsPreparation) || null,
    tempsCuisson: Number(r.tempsCuisson) || null,
    difficulte: String(r.difficulte || ""),
    ingredients: (r.ingredients || []).filter(i => i?.nom).map(i => ({ quantite: i.quantite == null ? null : Number(i.quantite), unite: String(i.unite || ""), nom: String(i.nom) })),
    etapes: (r.etapes || []).map(String),
    astuces: String(r.astuces || ""),
  };
}

// Petit appel pour vérifier une clé depuis les réglages.
export async function testerCle(cle) {
  try {
    await client(cle).messages.create({ model: MODELES.eco.id, max_tokens: 16, messages: [{ role: "user", content: "Réponds juste OK." }] });
    return { ok: true, message: "Clé valide." };
  } catch (e) {
    return { ok: false, message: messageErreur(e) };
  }
}
