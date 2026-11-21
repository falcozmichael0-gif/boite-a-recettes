// Photos des plats : compressées dans le navigateur puis rangées dans Firestore (pas besoin de Firebase Storage, qui est payant).

// Redimensionne une image (côté le plus long ≤ cote) et la renvoie en JPEG data URL, sous `maxOctets` caractères.
export async function reduire(fichier, cote, maxOctets) {
  const bitmap = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  let ratio = Math.min(1, cote / Math.max(bitmap.width, bitmap.height));
  for (let essai = 0; essai < 6; essai++) {
    const c = document.createElement("canvas");
    c.width = Math.round(bitmap.width * ratio);
    c.height = Math.round(bitmap.height * ratio);
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
  const bitmap = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  const s = Math.min(bitmap.width, bitmap.height);
  const c = document.createElement("canvas");
  c.width = c.height = cote;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, cote, cote);
  g.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, cote, cote);
  return c.toDataURL("image/jpeg", 0.7);
}
