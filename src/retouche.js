// Gomme à texte : on peint (au doigt ou via le repérage de Claude) le texte incrusté sur la photo,
// puis on le remplace par les couleurs alentour. Renvoie la photo retouchée (File JPEG) ou null si annulé.

// Bouche les trous du masque à partir des pixels voisins : moyenne sur une pyramide d'images
// (du plus flou au plus net), puis lissage, puis un léger grain pour éviter l'aspect « plastique ».
export function boucher(pix, trou, w, h) {
  const n = w * h;
  // élargit le masque de 2 px pour couvrir le contour adouci des lettres
  let m = Uint8Array.from(trou);
  for (let pas = 0; pas < 2; pas++) {
    const m2 = m.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (m[y * w + x]) continue;
      if ((x > 0 && m[y * w + x - 1]) || (x < w - 1 && m[y * w + x + 1]) || (y > 0 && m[(y - 1) * w + x]) || (y < h - 1 && m[(y + 1) * w + x])) m2[y * w + x] = 1;
    }
    m = m2;
  }
  // niveau 0 : couleurs connues (poids 1) et trous (poids 0)
  const niv = [{ w, h, c: new Float32Array(n * 3), p: new Float32Array(n) }];
  for (let i = 0; i < n; i++) if (!m[i]) { niv[0].p[i] = 1; niv[0].c[i * 3] = pix[i * 4]; niv[0].c[i * 3 + 1] = pix[i * 4 + 1]; niv[0].c[i * 3 + 2] = pix[i * 4 + 2]; }
  // pyramide : chaque niveau moyenne 2×2 pixels connus du précédent
  while (niv.at(-1).w > 2 && niv.at(-1).h > 2) {
    const a = niv.at(-1), W = Math.ceil(a.w / 2), H = Math.ceil(a.h / 2);
    const b = { w: W, h: H, c: new Float32Array(W * H * 3), p: new Float32Array(W * H) };
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      const i = y * a.w + x, j = (y >> 1) * W + (x >> 1), q = a.p[i];
      if (!q) continue;
      b.p[j] += q; b.c[j * 3] += a.c[i * 3] * q; b.c[j * 3 + 1] += a.c[i * 3 + 1] * q; b.c[j * 3 + 2] += a.c[i * 3 + 2] * q;
    }
    let plein = true;
    for (let j = 0; j < W * H; j++) { if (b.p[j] > 0) { b.c[j * 3] /= b.p[j]; b.c[j * 3 + 1] /= b.p[j]; b.c[j * 3 + 2] /= b.p[j]; b.p[j] = Math.min(1, b.p[j] / 2); } else plein = false; }
    niv.push(b);
    if (plein && W * H < 64) break;
  }
  // redescente : chaque pixel incomplet reçoit la couleur du niveau plus flou (interpolée)
  for (let l = niv.length - 2; l >= 0; l--) {
    const a = niv[l], b = niv[l + 1];
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      const i = y * a.w + x, q = a.p[i];
      if (q >= 1) continue;
      const fx = Math.min(b.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5)), fy = Math.min(b.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(b.w - 1, x0 + 1), y1 = Math.min(b.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      for (let k = 0; k < 3; k++) {
        const v = (b.c[(y0 * b.w + x0) * 3 + k] * (1 - tx) + b.c[(y0 * b.w + x1) * 3 + k] * tx) * (1 - ty) + (b.c[(y1 * b.w + x0) * 3 + k] * (1 - tx) + b.c[(y1 * b.w + x1) * 3 + k] * tx) * ty;
        a.c[i * 3 + k] = a.c[i * 3 + k] * q + v * (1 - q);
      }
      a.p[i] = 1;
    }
  }
  const c = niv[0].c;
  // lissage dans le trou seulement (raccords plus doux)
  const idx = []; for (let i = 0; i < n; i++) if (m[i]) idx.push(i);
  for (let it = 0; it < 12; it++) for (const i of idx) {
    const x = i % w, y = (i / w) | 0;
    const v = [i, x > 0 ? i - 1 : i, x < w - 1 ? i + 1 : i, y > 0 ? i - w : i, y < h - 1 ? i + w : i];
    for (let k = 0; k < 3; k++) c[i * 3 + k] = (c[v[1] * 3 + k] + c[v[2] * 3 + k] + c[v[3] * 3 + k] + c[v[4] * 3 + k]) / 4;
  }
  // grain : on reprend l'irrégularité mesurée autour du trou
  let s = 0, s2 = 0, nb = 0;
  for (const i of idx) { const x = i % w, y = (i / w) | 0;
    for (const j of [i - 3, i + 3, i - 3 * w, i + 3 * w]) { const xj = j % w; if (j < 0 || j >= n || m[j] || Math.abs(xj - x) > 3) continue; const g = (pix[j * 4] + pix[j * 4 + 1] + pix[j * 4 + 2]) / 3; s += g; s2 += g * g; nb++; } }
  const ecart = nb ? Math.min(18, Math.sqrt(Math.max(0, s2 / nb - (s / nb) ** 2)) * 0.5) : 0;
  for (const i of idx) {
    const bruit = (Math.random() + Math.random() + Math.random() - 1.5) * ecart;
    pix[i * 4] = c[i * 3] + bruit; pix[i * 4 + 1] = c[i * 3 + 1] + bruit; pix[i * 4 + 2] = c[i * 3 + 2] + bruit;
  }
}

const TAILLES = { fin: 0.015, moyen: 0.03, large: 0.06 };   // diamètre du pinceau, en part du grand côté

export function retoucher(fichier, { detecter = null } = {}) {
  return new Promise(async resolve => {
    const bmp = await createImageBitmap(fichier);
    const w = bmp.width, h = bmp.height;
    const ecran = document.createElement("div");
    ecran.className = "recadrage retouche";
    ecran.setAttribute("role", "dialog");
    ecran.setAttribute("aria-label", "Effacer du texte");
    ecran.innerHTML = `
      <p class="recadrage-titre">Peignez le texte à effacer${detecter ? ", ou laissez Claude le repérer" : ""}</p>
      <div class="recadrage-zone"><div class="recadrage-img">
        <canvas class="photo-retouche"></canvas><canvas class="masque-retouche"></canvas>
      </div></div>
      <div class="recadrage-actions">
        <span class="pinceaux" role="group" aria-label="Taille du pinceau">${Object.keys(TAILLES).map(t => `<button class="chip" data-t="${t}" aria-pressed="${t === "moyen"}">${t}</button>`).join("")}</span>
      </div>
      <p class="statut-retouche" role="status"></p>
      <div class="recadrage-actions">
        ${detecter ? `<button class="btn" data-a="reperer">✨ Repérer le texte</button>` : ""}
        <button class="btn plein" data-a="effacer">🧽 Effacer la zone peinte</button>
        <button class="btn" data-a="defaire" disabled>↶ Défaire</button>
      </div>
      <div class="recadrage-actions">
        <button class="btn" data-a="annuler">Annuler</button>
        <button class="btn plein" data-a="ok">✔ Valider</button>
      </div>`;
    document.body.append(ecran);
    const [cv, mk] = ecran.querySelectorAll("canvas");
    cv.width = mk.width = w; cv.height = mk.height = h;
    const g = cv.getContext("2d"), gm = mk.getContext("2d");
    g.drawImage(bmp, 0, 0);
    const statut = ecran.querySelector(".statut-retouche");
    const historique = [];
    let taille = TAILLES.moyen;

    // pinceau
    gm.fillStyle = gm.strokeStyle = "rgba(255,60,60,0.55)"; gm.lineCap = gm.lineJoin = "round";
    let trace = null;
    const point = e => { const r = mk.getBoundingClientRect(); return [(e.clientX - r.left) * w / r.width, (e.clientY - r.top) * h / r.height]; };
    mk.addEventListener("pointerdown", e => {
      e.preventDefault(); mk.setPointerCapture(e.pointerId);
      trace = point(e); gm.lineWidth = taille * Math.max(w, h);
      gm.beginPath(); gm.arc(trace[0], trace[1], gm.lineWidth / 2, 0, 7); gm.fill();
    });
    mk.addEventListener("pointermove", e => {
      if (!trace) return;
      const p = point(e); gm.beginPath(); gm.moveTo(...trace); gm.lineTo(...p); gm.stroke(); trace = p;
    });
    const fin = () => { trace = null; };
    mk.addEventListener("pointerup", fin); mk.addEventListener("pointercancel", fin);

    const effacer = () => {
      const mp = gm.getImageData(0, 0, w, h).data, trou = new Uint8Array(w * h);
      let nb = 0; for (let i = 0; i < w * h; i++) if (mp[i * 4 + 3] > 20) { trou[i] = 1; nb++; }
      if (!nb) { statut.textContent = "Peignez d'abord le texte à effacer."; return; }
      const img = g.getImageData(0, 0, w, h);
      historique.push(g.getImageData(0, 0, w, h));
      boucher(img.data, trou, w, h);
      g.putImageData(img, 0, 0);
      gm.clearRect(0, 0, w, h);
      ecran.querySelector('[data-a="defaire"]').disabled = false;
      statut.textContent = "Effacé. Repeignez par-dessus si des traces restent.";
    };

    const fermer = res => { ecran.remove(); resolve(res); };
    ecran.addEventListener("click", async e => {
      const t = e.target.closest("[data-t]");
      if (t) { taille = TAILLES[t.dataset.t]; ecran.querySelectorAll("[data-t]").forEach(b => b.setAttribute("aria-pressed", String(b === t))); return; }
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "annuler") fermer(null);
      else if (a === "effacer") effacer();
      else if (a === "defaire" && historique.length) { g.putImageData(historique.pop(), 0, 0); e.target.disabled = !historique.length; statut.textContent = ""; }
      else if (a === "reperer") {
        const bouton = e.target; bouton.disabled = true; statut.textContent = "Claude cherche le texte sur la photo…";
        try {
          const zones = await detecter(await new Promise(r => cv.toBlob(r, "image/jpeg", 0.9)));
          if (!zones.length) statut.textContent = "Claude n'a pas trouvé de texte sur cette photo.";
          else {
            const marge = 0.012 * Math.max(w, h);
            for (const z of zones) gm.fillRect(z.x * w - marge, z.y * h - marge, z.w * w + 2 * marge, z.h * h + 2 * marge);
            statut.textContent = `${zones.length} zone${zones.length > 1 ? "s" : ""} de texte repérée${zones.length > 1 ? "s" : ""} (en rouge). Ajustez au doigt si besoin, puis touchez « Effacer ».`;
          }
        } catch (err) { statut.textContent = err.message || "Repérage impossible."; }
        bouton.disabled = false;
      }
      else if (a === "ok") {
        if (!historique.length) return fermer(null);
        const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.92));
        fermer(new File([blob], "photo-plat.jpg", { type: "image/jpeg" }));
      }
    });
  });
}
