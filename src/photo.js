// Photos des plats : compressées dans le navigateur puis rangées dans Firestore (pas besoin de Firebase Storage, qui est payant).

// Ouvre une image : d'abord par la voie rapide, sinon par un <img> classique (qui lit plus de formats sur certains téléphones).
export async function chargerImage(fichier) {
  try { return await createImageBitmap(fichier, { imageOrientation: "from-image" }); } catch {}
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await createImageBitmap(img).catch(() => img);
  } catch {
    const heic = /hei[cf]/i.test(fichier.type) || /\.hei[cf]$/i.test(fichier.name || "");
    throw new ErreurImage(heic
      ? "Cette photo est au format HEIC, que le téléphone ne sait pas ouvrir ici. Faites plutôt une capture d'écran de la photo, ou réglez l'appareil photo en JPEG."
      : "Une image n'a pas pu être lue (fichier abîmé ou format non pris en charge). Essayez avec une autre capture.");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
export class ErreurImage extends Error {}
const largeur = b => b.naturalWidth || b.width, hauteur = b => b.naturalHeight || b.height;

// Redimensionne une image (côté le plus long ≤ cote) et la renvoie en JPEG data URL, sous `maxOctets` caractères.
export async function reduire(fichier, cote, maxOctets) {
  const bitmap = await chargerImage(fichier);
  let ratio = Math.min(1, cote / Math.max(largeur(bitmap), hauteur(bitmap)));
  for (let essai = 0; essai < 6; essai++) {
    const c = document.createElement("canvas");
    c.width = Math.round(largeur(bitmap) * ratio);
    c.height = Math.round(hauteur(bitmap) * ratio);
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);   // fond blanc : une image transparente ne sort pas en noir
    g.drawImage(bitmap, 0, 0, c.width, c.height);
    for (const q of [0.78, 0.66, 0.55]) {
      const url = c.toDataURL("image/jpeg", q);
      if (url.length <= maxOctets) return url;
    }
    ratio *= 0.8;
  }
  throw new Error("Photo trop lourde.");
}

// Vignette carrée (recadrée au centre) pour la liste des recettes.
export async function vignette(fichier, cote = 240) {
  const bitmap = await chargerImage(fichier);
  const s = Math.min(largeur(bitmap), hauteur(bitmap));
  const c = document.createElement("canvas");
  c.width = c.height = cote;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, cote, cote);
  g.drawImage(bitmap, (largeur(bitmap) - s) / 2, (hauteur(bitmap) - s) / 2, s, s, 0, 0, cote, cote);
  return c.toDataURL("image/jpeg", 0.7);
}
