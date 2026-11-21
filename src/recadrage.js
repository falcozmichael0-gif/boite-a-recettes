// Écran de recadrage : on ajuste au doigt un cadre sur l'image, renvoie la zone choisie (fractions 0–1) ou null si annulé.

const borne = (v, min, max) => Math.min(max, Math.max(min, v));
const MIN = 0.08;   // taille minimale du cadre (8 % de l'image)

export function recadrer(fichier, zoneDepart = null) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(fichier);
    let z = zoneDepart ? { ...zoneDepart } : { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };

    const ecran = document.createElement("div");
    ecran.className = "recadrage";
    ecran.setAttribute("role", "dialog");
    ecran.setAttribute("aria-label", "Recadrer la photo");
    ecran.innerHTML = `
      <p class="recadrage-titre">Cadrez la photo du plat${zoneDepart ? " <span>(cadre proposé automatiquement)</span>" : ""}</p>
      <div class="recadrage-zone"><div class="recadrage-img">
        <img alt="Image à recadrer" draggable="false">
        <div class="cadre">${["hg", "hd", "bg", "bd"].map(c => `<span class="poignee ${c}" data-c="${c}"></span>`).join("")}</div>
      </div></div>
      <div class="recadrage-actions">
        <button class="btn" data-a="annuler">Annuler</button>
        <button class="btn" data-a="tout">Toute l'image</button>
        <button class="btn plein" data-a="ok">✔ Valider</button>
      </div>`;
    document.body.append(ecran);
    const boite = ecran.querySelector(".recadrage-img"), cadre = ecran.querySelector(".cadre"), img = ecran.querySelector("img");
    img.src = url;

    const dessiner = () => Object.assign(cadre.style, { left: z.x * 100 + "%", top: z.y * 100 + "%", width: z.w * 100 + "%", height: z.h * 100 + "%" });
    dessiner();

    // Déplacement du cadre (glisser à l'intérieur) ou redimensionnement (glisser un coin)
    let geste = null;
    cadre.addEventListener("pointerdown", e => {
      e.preventDefault();
      cadre.setPointerCapture(e.pointerId);
      geste = { coin: e.target.dataset.c || null, x0: e.clientX, y0: e.clientY, z0: { ...z }, r: boite.getBoundingClientRect() };
    });
    cadre.addEventListener("pointermove", e => {
      if (!geste) return;
      const dx = (e.clientX - geste.x0) / geste.r.width, dy = (e.clientY - geste.y0) / geste.r.height, a = geste.z0;
      if (!geste.coin) {
        z.x = borne(a.x + dx, 0, 1 - a.w); z.y = borne(a.y + dy, 0, 1 - a.h);
      } else {
        let gauche = a.x, haut = a.y, droite = a.x + a.w, bas = a.y + a.h;
        if (geste.coin.includes("g")) gauche = borne(a.x + dx, 0, droite - MIN); else droite = borne(droite + dx, gauche + MIN, 1);
        if (geste.coin.includes("h")) haut = borne(a.y + dy, 0, bas - MIN); else bas = borne(bas + dy, haut + MIN, 1);
        z = { x: gauche, y: haut, w: droite - gauche, h: bas - haut };
      }
      dessiner();
    });
    const fin = () => { geste = null; };
    cadre.addEventListener("pointerup", fin);
    cadre.addEventListener("pointercancel", fin);

    const fermer = res => { ecran.remove(); URL.revokeObjectURL(url); document.removeEventListener("keydown", clavier); resolve(res); };
    const clavier = e => { if (e.key === "Escape") fermer(null); };
    document.addEventListener("keydown", clavier);
    ecran.querySelector(".recadrage-actions").onclick = e => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "annuler") fermer(null);
      else if (a === "tout") { z = { x: 0, y: 0, w: 1, h: 1 }; dessiner(); }
      else if (a === "ok") fermer({ ...z });
    };
  });
}
