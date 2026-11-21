import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { firebaseConfig } from "./config.js";
import { CATEGORIES, MODELES, retranscrire, testerCle, ErreurRecette } from "./claude.js";
import { reduire, vignette } from "./photo.js";
import { ORDRE_RAYONS, AUTRES, ajouterArticle, lireSaisie, libelleQte, texteListe, arrondi, nombre } from "./courses.js";

const $ = s => document.querySelector(s);
const app = $("#app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lire = k => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrire = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

/* ---------- état ---------- */
let auth, db, utilisateur = null;
let recettes = [], courses = [], recettesChargees = false;
let filtre = "Toutes", recherche = "", tri = lire("tri") || "date";
let brouillon = { url: "", texte: "", images: [], photo: null };
let desabonnerPhoto = null;
let ctl = null, portionsVues = null, recetteVue = null, verrouEcran = null, veutEcran = false;
let minuterieCourses = null;
const desabonnements = [];

const plateformes = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", autre: "Autre source" };
function plateforme(url) {
  const u = (url || "").toLowerCase();
  if (/facebook\.com|fb\.watch|fb\.com/.test(u)) return "facebook";
  if (/instagram\.com|instagr\.am/.test(u)) return "instagram";
  if (/tiktok\.com/.test(u)) return "tiktok";
  return "autre";
}
const tempsTotal = r => (r.tempsPreparation || 0) + (r.tempsCuisson || 0);
function duree(m) { if (!m) return "—"; if (m < 60) return m + " min"; const h = Math.floor(m / 60), r = m % 60; return h + " h" + (r ? " " + String(r).padStart(2, "0") : ""); }
function qte(i, f) { if (i.quantite == null || i.quantite === "") return i.unite || ""; return nombre(arrondi(Number(i.quantite) * f)) + (i.unite ? " " + i.unite : ""); }

function toast(msg) {
  document.querySelector(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

/* ---------- données (Firestore) ---------- */
const colRecettes = () => collection(db, "utilisateurs", utilisateur.uid, "recettes");
const docCourses = () => doc(db, "utilisateurs", utilisateur.uid, "donnees", "courses");

function ecouterDonnees() {
  desabonnements.push(onSnapshot(colRecettes(), snap => {
    recettes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    recettesChargees = true;
    rafraichir();
  }, e => toast("Synchronisation impossible : " + e.code)));
  desabonnements.push(onSnapshot(docCourses(), snap => {
    if (minuterieCourses || snap.metadata.hasPendingWrites) return;
    courses = snap.exists() ? structuredClone(snap.data().articles || []) : [];
    majBadge(); rafraichir();
  }));
}

async function enregistrerRecette(r) {
  const ref = r.id ? doc(colRecettes(), r.id) : doc(colRecettes());
  const { id, ...corps } = r;
  await setDoc(ref, corps);   // hors connexion : enregistré sur l'appareil puis envoyé au retour du réseau
  return ref.id;
}

const docPhoto = id => doc(db, "utilisateurs", utilisateur.uid, "photos", id);

// La grande photo vit dans son propre document (lu seulement sur la fiche) ; la vignette reste dans la recette pour la liste.
async function enregistrerPhoto(id, fichier) {
  const [grande, petite] = await Promise.all([reduire(fichier, 1280, 700000), vignette(fichier)]);
  await setDoc(docPhoto(id), { image: grande });
  const r = recettes.find(x => x.id === id);
  if (r) await enregistrerRecette({ ...r, vignette: petite });
}
async function retirerPhoto(r) {
  await deleteDoc(docPhoto(r.id));
  const { vignette: _, ...reste } = r;
  await enregistrerRecette(reste);
}

function sauverCourses() {
  majBadge(); rafraichir();
  clearTimeout(minuterieCourses);
  minuterieCourses = setTimeout(async () => {
    try { await setDoc(docCourses(), { articles: courses, maj: new Date().toISOString() }); }
    catch (e) { toast("Liste non enregistrée : " + e.code); }
    minuterieCourses = null;
  }, 500);
}
function majBadge() {
  const n = courses.filter(c => !c.coche).length;
  $("#badge").hidden = !n; $("#badge").textContent = n;
}

/* ---------- routage ---------- */
function route() {
  const [v, id] = (location.hash.slice(1) || "recettes").split("/");
  return { v: ["recettes", "recette", "ajouter", "courses", "reglages"].includes(v) ? v : "recettes", id };
}
function afficher() {
  if (!utilisateur) return;
  const { v, id } = route();
  if (v !== "recette") { liberEcran(); desabonnerPhoto?.(); desabonnerPhoto = null; }
  document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("on", a.dataset.v === (v === "recette" ? "recettes" : v)));
  ({ recettes: vueRecettes, recette: () => vueRecette(id), ajouter: vueAjouter, courses: vueCourses, reglages: vueReglages })[v]();
  window.scrollTo(0, 0);
}
// Données arrivées : on met à jour seulement les parties qui en dépendent (sans effacer une saisie en cours).
function rafraichir() {
  const { v, id } = route();
  if (v === "recettes") majListe();
  else if (v === "recette" && recettesChargees) {
    const r = recettes.find(x => x.id === id);
    if (!r || !recetteVue || recetteVue.id !== id || JSON.stringify(r) !== JSON.stringify(recetteVue)) vueRecette(id);
  }
  else if (v === "courses") majCourses();
}
window.addEventListener("hashchange", afficher);

/* ---------- connexion ---------- */
const logoGoogle = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

function vueConnexion(msg = "") {
  $("#nav").hidden = true;
  app.innerHTML = `<section class="accueil">
    <h1 class="titre">Ma Boîte <span class="o">à</span> Recettes</h1>
    <p>Vos recettes Facebook et Instagram, retranscrites et rangées. Les mêmes sur votre téléphone et votre PC.</p>
    <button class="btn plein large google" id="connexion">${logoGoogle} Se connecter avec Google</button>
    <p class="statut ${msg ? "err" : ""}" id="c-statut">${esc(msg)}</p>
  </section>`;
  $("#connexion").onclick = async () => {
    const fournisseur = new GoogleAuthProvider();
    try { await signInWithPopup(auth, fournisseur); }
    catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") await signInWithRedirect(auth, fournisseur);
      else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") $("#c-statut").textContent = "Connexion impossible (" + e.code + ").";
    }
  };
}

function vueSansConfig() {
  app.innerHTML = `<section class="accueil"><h1 class="titre">Ma Boîte <span class="o">à</span> Recettes</h1>
    <p class="note">L'appli n'est pas encore reliée à votre projet Firebase. La configuration est à ajouter dans <code>src/config.js</code>.</p></section>`;
}

/* ---------- vue : liste des recettes ---------- */
function vueRecettes() {
  app.innerHTML = `<section class="view">
    <div class="row between"><h1 class="titre">Mes recettes</h1><span class="sous" id="compte"></span></div>
    <div class="row">
      <input type="search" id="recherche" placeholder="🔍 Chercher un plat, un ingrédient…" aria-label="Rechercher" value="${esc(recherche)}" style="flex:1 1 220px">
      <select id="tri" aria-label="Trier" style="width:auto">
        <option value="date">Plus récentes</option><option value="titre">A → Z</option><option value="temps">Plus rapides</option>
      </select>
    </div>
    <div class="chips" id="chips"></div>
    <div class="liste" id="liste"></div>
  </section>`;
  $("#tri").value = tri;
  $("#recherche").oninput = e => { recherche = e.target.value; majListe(); };
  $("#tri").onchange = e => { tri = e.target.value; ecrire("tri", tri); majListe(); };
  $("#chips").onclick = e => { const c = e.target.closest(".chip"); if (c) { filtre = c.dataset.cat; majListe(); } };
  majListe();
}
function majListe() {
  if (!$("#liste")) return;
  $("#compte").textContent = recettesChargees ? `${recettes.length} recette${recettes.length > 1 ? "s" : ""}` : "Synchronisation…";
  const nb = {}; recettes.forEach(r => nb[r.categorie] = (nb[r.categorie] || 0) + 1);
  const favs = recettes.filter(r => r.favori).length;
  const cats = ["Toutes", ...(favs ? ["Favoris"] : []), ...CATEGORIES.filter(c => nb[c]), ...Object.keys(nb).filter(c => !CATEGORIES.includes(c))];
  if (!cats.includes(filtre)) filtre = "Toutes";
  $("#chips").innerHTML = cats.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === filtre}">${c === "Favoris" ? "★ " : ""}${esc(c)}<small>${c === "Toutes" ? recettes.length : c === "Favoris" ? favs : nb[c]}</small></button>`).join("");
  const q = recherche.trim().toLowerCase();
  let l = recettes.filter(r => filtre === "Toutes" || (filtre === "Favoris" ? r.favori : r.categorie === filtre));
  if (q) l = l.filter(r => [r.titre, r.categorie, ...(r.tags || []), ...(r.ingredients || []).map(i => i.nom)].join(" ").toLowerCase().includes(q));
  l.sort((a, b) => tri === "titre" ? a.titre.localeCompare(b.titre, "fr") : tri === "temps" ? (tempsTotal(a) || 1e9) - (tempsTotal(b) || 1e9) : String(b.ajouteLe).localeCompare(String(a.ajouteLe)));
  if (!recettesChargees) { $("#liste").innerHTML = `<div class="vide">Chargement de vos recettes…</div>`; return; }
  if (!recettes.length) { $("#liste").innerHTML = `<div class="vide">Votre carnet est vide.<br><br><a class="btn plein" href="#ajouter">+ Ajouter une première recette</a><br><br>Vous aviez des recettes dans la version claude.ai ? Importez-les depuis <a href="#reglages">Réglages</a>.</div>`; return; }
  $("#liste").innerHTML = l.length ? l.map(r => `
    <a class="carte${r.vignette ? " avec-photo" : ""}" href="#recette/${esc(r.id)}">
      <span class="txt">
        <span class="cat">${esc(r.categorie)}${r.favori ? " ★" : ""}</span>
        <b>${esc(r.titre)}</b>
        <span class="meta"><span>⏱ ${duree(tempsTotal(r))}</span>${r.portions ? `<span>${r.portions} pers.</span>` : ""}<span>${esc(plateformes[r.plateforme] || "")}</span></span>
      </span>
      ${r.vignette ? `<img class="mini" src="${r.vignette}" alt="" loading="lazy">` : ""}
    </a>`).join("") : `<div class="vide">Aucune recette ne correspond.</div>`;
}

/* ---------- vue : une recette ---------- */
function vueRecette(id) {
  const r = recettes.find(x => x.id === id);
  if (!r) { app.innerHTML = `<section class="view"><a class="retour" href="#recettes">← Mes recettes</a><div class="vide">${recettesChargees ? "Cette recette n'existe plus." : "Chargement…"}</div></section>`; return; }
  if (recetteVue?.id !== id) portionsVues = r.portions || null;
  recetteVue = r;
  const f = r.portions && portionsVues ? portionsVues / r.portions : 1;
  app.innerHTML = `<article class="view">
    <a class="retour" href="#recettes">← Mes recettes</a>
    <div class="row"><span class="cat">${esc(r.categorie)}</span><span class="sous">${esc(plateformes[r.plateforme] || "")}</span></div>
    <h1 class="titre">${esc(r.titre)}</h1>
    ${(r.tags || []).length ? `<div class="tags">${r.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    ${r.vignette ? `<figure class="polaroid"><img id="photo" src="${r.vignette}" alt="Photo du plat : ${esc(r.titre)}"></figure>` : ""}
    <div class="faits">
      <div class="fait"><b>${duree(r.tempsPreparation)}</b><span>Préparation</span></div>
      <div class="fait"><b>${duree(r.tempsCuisson)}</b><span>Cuisson</span></div>
      <div class="fait"><b>${duree(tempsTotal(r))}</b><span>Total</span></div>
      <div class="fait"><b>${esc(r.difficulte || "—")}</b><span>Difficulté</span></div>
    </div>
    <div class="row">
      <button class="btn plein" id="versCourses">🛒 Ajouter aux courses</button>
      <label class="btn discret fichier">📷 ${r.vignette ? "Changer la photo" : "Ajouter une photo"}<input type="file" id="e-photo" accept="image/*"></label>
      ${"wakeLock" in navigator ? `<button class="btn discret" id="ecran" aria-pressed="${veutEcran}">${veutEcran ? "☀️ Écran gardé allumé" : "☀️ Garder l'écran allumé"}</button>` : ""}
    </div>
    <div class="colonnes">
      <div>
        <h2 class="sec">Ingrédients ${r.portions ? `<span class="portions"><button data-p="-1" aria-label="Moins de personnes">−</button><span>${portionsVues} pers.</span><button data-p="1" aria-label="Plus de personnes">+</button></span>` : ""}</h2>
        <ul class="ing">${(r.ingredients || []).map(i => `<li><span class="q">${esc(qte(i, f))}</span><span>${esc(i.nom)}</span></li>`).join("")}</ul>
      </div>
      <div>
        <h2 class="sec">Étapes</h2>
        <ol class="etapes">${(r.etapes || []).map(e => `<li>${esc(e)}</li>`).join("")}</ol>
        ${r.astuces ? `<p class="note"><b>Astuce :</b> ${esc(r.astuces)}</p>` : ""}
      </div>
    </div>
    ${r.sourceUrl ? `<p>Publication d'origine : <a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">ouvrir le lien</a></p>` : ""}
    ${r.texteOriginal ? `<details><summary>Voir le texte d'origine</summary><pre>${esc(r.texteOriginal)}</pre></details>` : ""}
    <div class="edition">
      <div class="field"><label for="e-titre">Titre</label><input type="text" id="e-titre" value="${esc(r.titre)}"></div>
      <div class="field"><label for="e-cat">Catégorie</label><select id="e-cat">${[...new Set([...CATEGORIES, r.categorie])].map(c => `<option ${c === r.categorie ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
      <div class="field"><label for="e-tags">Étiquettes <span class="hint">(séparées par des virgules)</span></label><input type="text" id="e-tags" value="${esc((r.tags || []).join(", "))}"></div>
      <div class="row">
        <button class="btn" id="e-enreg">Enregistrer</button>
        ${r.vignette ? `<button class="btn discret" id="e-sansphoto">Retirer la photo</button>` : ""}
        <button class="btn discret" id="e-fav">${r.favori ? "★ Retirer des favoris" : "☆ Favori"}</button>
        <button class="btn danger" id="e-suppr">Supprimer</button>
      </div>
    </div>
    <p class="statut" id="e-statut"></p>
  </article>`;

  // Grande photo : chargée à part, elle remplace la vignette dès qu'elle arrive (gardée sur l'appareil pour les visites suivantes).
  desabonnerPhoto?.(); desabonnerPhoto = null;
  if (r.vignette) desabonnerPhoto = onSnapshot(docPhoto(id), s => { const img = $("#photo"); if (img && s.exists() && s.data().image) img.src = s.data().image; }, () => {});
  $("#e-photo").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    toast("Enregistrement de la photo…");
    try { await enregistrerPhoto(id, f); toast("Photo enregistrée."); } catch (err) { toast("Photo non enregistrée : " + (err.code || err.message)); }
  };
  const sansPhoto = $("#e-sansphoto");
  if (sansPhoto) sansPhoto.onclick = () => retirerPhoto(r).then(() => toast("Photo retirée."), err => toast("Erreur : " + err.code));
  app.querySelector(".colonnes").onclick = e => {
    const b = e.target.closest("[data-p]");
    if (b) { portionsVues = Math.max(1, (portionsVues || 1) + Number(b.dataset.p)); vueRecette(id); }
  };
  $("#versCourses").onclick = () => {
    let n = 0;
    for (const i of r.ingredients || []) { ajouterArticle(courses, { nom: i.nom, quantite: i.quantite == null ? null : Number(i.quantite) * f, unite: i.unite || "", de: r.titre }); n++; }
    sauverCourses();
    toast(`${n} ingrédient${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""} aux courses${r.portions ? ` (pour ${portionsVues} pers.)` : ""}.`);
  };
  const btnEcran = $("#ecran");
  if (btnEcran) btnEcran.onclick = async () => {
    if (veutEcran) liberEcran(); else { veutEcran = true; await bloquerEcran(); }
    vueRecette(id);
  };
  const st = $("#e-statut");
  $("#e-enreg").onclick = async () => {
    try {
      await enregistrerRecette({ ...r, titre: $("#e-titre").value.trim() || r.titre, categorie: $("#e-cat").value, tags: $("#e-tags").value.split(",").map(s => s.trim()).filter(Boolean) });
      toast("Modifications enregistrées.");
    } catch (e) { st.className = "statut err"; st.textContent = "Enregistrement impossible (" + e.code + ")."; }
  };
  $("#e-fav").onclick = () => enregistrerRecette({ ...r, favori: !r.favori }).catch(e => toast("Erreur : " + e.code));
  $("#e-suppr").onclick = async e => {
    if (!e.target.dataset.ok) { e.target.dataset.ok = "1"; e.target.textContent = "Confirmer la suppression"; st.className = "statut"; st.textContent = "Touchez à nouveau pour supprimer définitivement."; return; }
    await Promise.all([deleteDoc(doc(colRecettes(), r.id)), deleteDoc(docPhoto(r.id))]).catch(err => toast("Erreur : " + err.code));
    location.hash = "#recettes";
  };
}
// Mode cuisine : l'écran ne se met pas en veille pendant qu'on suit la recette.
async function bloquerEcran() {
  try { verrouEcran = await navigator.wakeLock.request("screen"); verrouEcran.addEventListener("release", () => { verrouEcran = null; }); }
  catch { veutEcran = false; toast("Impossible de garder l'écran allumé ici."); }
}
function liberEcran() { veutEcran = false; if (verrouEcran) { verrouEcran.release().catch(() => {}); verrouEcran = null; } }
// Android relâche le verrou quand l'appli passe en arrière-plan : on le reprend au retour.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && veutEcran && !verrouEcran && route().v === "recette") bloquerEcran(); });

/* ---------- vue : ajouter ---------- */
function vueAjouter() {
  const cle = lire("cle-api");
  app.innerHTML = `<section class="view">
    <h1 class="titre">Ajouter une recette</h1>
    ${cle ? "" : `<p class="note">Pour retranscrire, il faut d'abord enregistrer votre clé API Claude dans <a href="#reglages">Réglages</a>.</p>`}
    <div class="carton">
      <label class="photo">📷 Choisir des captures d'écran<br><span class="hint">ou partagez-les depuis la Galerie : Partager → Ma Boîte à Recettes</span>
        <input type="file" id="fichiers" accept="image/*" multiple></label>
      <div class="vignettes" id="vignettes"></div>
      <div class="field"><label for="texte">Texte de la publication <span class="hint">(si vous l'avez copié)</span></label>
        <textarea id="texte" placeholder="Collez ici la légende : ingrédients, étapes… emojis et hashtags compris.">${esc(brouillon.texte)}</textarea></div>
      <div class="field"><span class="lbl">Photo du plat <span class="hint">(facultatif : votre photo, ou une capture de l'image du plat)</span></span>
        <div class="row"><label class="btn discret fichier">📷 ${brouillon.photo ? "Changer la photo" : "Choisir une photo"}<input type="file" id="photo-plat" accept="image/*"></label>
        <span id="photo-apercu">${brouillon.photo ? `<img class="mini" src="${URL.createObjectURL(brouillon.photo)}" alt="Photo choisie">` : ""}</span></div></div>
      <div class="field"><label for="url">Lien de la publication <span class="hint">(facultatif)</span></label>
        <input type="url" id="url" placeholder="https://www.instagram.com/…" value="${esc(brouillon.url)}" autocomplete="off"></div>
      <div class="row">
        <button class="btn plein" id="go" ${cle ? "" : "disabled"}>✍️ Retranscrire et classer</button>
        <button class="btn discret" id="stop" hidden>Arrêter</button>
      </div>
      <p class="statut" id="statut" role="status"></p>
    </div>
    <p class="sous">Les vidéos ne sont pas lues : si la recette n'est dite qu'à l'oral, faites une capture de l'écran où elle s'affiche.</p>
  </section>`;
  majVignettes();
  $("#texte").oninput = e => { brouillon.texte = e.target.value; };
  $("#url").oninput = e => { brouillon.url = e.target.value; };
  $("#fichiers").onchange = e => { ajouterImages(e.target.files); e.target.value = ""; };
  $("#vignettes").onclick = e => { const b = e.target.closest("[data-rm]"); if (b) { brouillon.images.splice(Number(b.dataset.rm), 1); majVignettes(); } };
  $("#photo-plat").onchange = e => { const f = e.target.files[0]; if (f) { brouillon.photo = f; vueAjouter(); } };
  $("#stop").onclick = () => ctl?.abort();
  $("#go").onclick = lancerRetranscription;
}
function ajouterImages(liste) {
  for (const f of liste) if (f.type.startsWith("image/") && brouillon.images.length < 6) brouillon.images.push(f);
  majVignettes();
}
function majVignettes() {
  const v = $("#vignettes"); if (!v) return;
  v.innerHTML = brouillon.images.map((f, i) => `<div><img src="${URL.createObjectURL(f)}" alt="Capture ${i + 1}"><button data-rm="${i}" aria-label="Retirer la capture ${i + 1}">×</button></div>`).join("");
}
document.addEventListener("paste", e => {
  if (route().v !== "ajouter") return;
  const imgs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith("image/"));
  if (imgs.length) { e.preventDefault(); ajouterImages(imgs); toast("Capture ajoutée."); }
});

async function lancerRetranscription() {
  const st = $("#statut");
  const url = brouillon.url.trim(), texte = brouillon.texte.trim(), images = [...brouillon.images];
  st.className = "statut";
  if (!texte && !images.length) { st.className = "statut err"; st.textContent = "Ajoutez une capture d'écran ou collez le texte de la publication."; return; }
  ctl = new AbortController();
  $("#go").disabled = true; $("#stop").hidden = false;
  st.textContent = "Claude lit la publication… (10 à 40 secondes)";
  try {
    const res = await retranscrire({ cle: lire("cle-api"), modele: lire("modele") || "precis", url, texte, images, signal: ctl.signal });
    const r = { ...res, sourceUrl: /^https?:\/\//i.test(url) ? url : "", plateforme: plateforme(url), texteOriginal: texte.slice(0, 6000), favori: false, ajouteLe: new Date().toISOString() };
    const id = await enregistrerRecette(r);
    recettes.push({ id, ...r });
    if (brouillon.photo) await enregistrerPhoto(id, brouillon.photo).catch(() => toast("Recette enregistrée, mais pas la photo : réessayez depuis la fiche."));
    brouillon = { url: "", texte: "", images: [], photo: null };
    toast(`« ${r.titre} » rangée dans ${r.categorie}.`);
    location.hash = "#recette/" + id;
  } catch (e) {
    st.className = "statut err";
    st.textContent = e instanceof ErreurRecette ? e.message : "Enregistrement impossible (" + (e.code || e.message) + ").";
  } finally {
    const go = $("#go"); if (go) go.disabled = false;
    const stop = $("#stop"); if (stop) stop.hidden = true;
  }
}

// Contenu reçu par le bouton « Partager » d'Android (rangé par le service worker).
async function recupererPartage() {
  if (!new URLSearchParams(location.search).has("partage")) return;
  history.replaceState(null, "", location.pathname + "#ajouter");
  try {
    const cache = await caches.open("boite-partage");
    const infos = await (await cache.match("partage/infos"))?.json();
    if (!infos) return;
    const lien = infos.url || (infos.text.match(/https?:\/\/\S+/) || [""])[0];
    const reste = infos.text.replace(lien, "").trim();
    brouillon.url = lien || brouillon.url;
    if (reste) brouillon.texte = [infos.title, reste].filter(Boolean).join("\n");
    for (let i = 0; i < infos.images; i++) {
      const rep = await cache.match(`partage/image-${i}`);
      if (rep) { const b = await rep.blob(); brouillon.images.push(new File([b], `capture-${i}.jpg`, { type: b.type || "image/jpeg" })); }
    }
    for (const k of await cache.keys()) await cache.delete(k);
    if (!infos.images && !reste) setTimeout(() => toast("Lien reçu. Ajoutez une capture de la recette ou collez son texte."), 600);
  } catch {}
}

/* ---------- vue : courses ---------- */
function vueCourses() {
  app.innerHTML = `<section class="view">
    <div class="row between"><h1 class="titre">Courses</h1><span class="sous" id="c-compte"></span></div>
    <form class="ajout" id="ajout"><input type="text" id="saisie" placeholder="Ajouter un article (ex. 2 l lait)" aria-label="Ajouter un article" autocomplete="off"><button class="btn plein">Ajouter</button></form>
    <div id="rayons"></div>
    <div class="row" id="c-actions">
      <button class="btn" id="envoyer">📤 Envoyer la liste</button>
      <button class="btn discret" id="retirer">Retirer les articles cochés</button>
      <button class="btn danger" id="vider">Tout vider</button>
    </div>
  </section>`;
  $("#ajout").onsubmit = e => { e.preventDefault(); const v = $("#saisie").value.trim(); if (!v) return; ajouterArticle(courses, lireSaisie(v)); $("#saisie").value = ""; sauverCourses(); };
  $("#rayons").onchange = e => { const c = courses.find(x => x.id === e.target.dataset.id); if (c) { c.coche = e.target.checked; sauverCourses(); } };
  $("#rayons").onclick = e => { const b = e.target.closest("[data-suppr]"); if (b) { courses = courses.filter(x => x.id !== b.dataset.suppr); sauverCourses(); } };
  $("#retirer").onclick = () => { courses = courses.filter(c => !c.coche); sauverCourses(); };
  $("#vider").onclick = e => {
    if (!e.target.dataset.ok) { e.target.dataset.ok = "1"; e.target.textContent = "Confirmer : tout vider"; return; }
    courses = []; sauverCourses();
  };
  $("#envoyer").onclick = async () => {
    const txt = texteListe(courses);
    if (navigator.share) { try { await navigator.share({ text: txt }); return; } catch (e) { if (e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(txt); toast("Liste copiée : collez-la dans un SMS ou WhatsApp."); } catch { toast("Copie impossible sur cet appareil."); }
  };
  majCourses();
}
function majCourses() {
  if (!$("#rayons")) return;
  const reste = courses.filter(c => !c.coche).length;
  $("#c-compte").textContent = courses.length ? `${reste} à prendre · ${courses.length - reste} dans le panier` : "";
  $("#c-actions").hidden = !courses.length;
  if (!courses.length) { $("#rayons").innerHTML = `<div class="vide">Votre liste est vide.<br>Ouvrez une recette et touchez « 🛒 Ajouter aux courses », ou ajoutez un article ci-dessus.</div>`; return; }
  const groupes = {};
  for (const c of courses) (groupes[c.rayon || AUTRES] ||= []).push(c);
  $("#rayons").innerHTML = ORDRE_RAYONS.filter(r => groupes[r]).map(r => {
    const l = groupes[r].slice().sort((a, b) => (a.coche - b.coche) || a.nom.localeCompare(b.nom, "fr"));
    return `<div class="rayon"><h3>${esc(r)}<small>${l.filter(c => !c.coche).length}/${l.length}</small></h3>${l.map(c => `
      <div class="article${c.coche ? " coche" : ""}">
        <input type="checkbox" id="a-${esc(c.id)}" data-id="${esc(c.id)}" ${c.coche ? "checked" : ""}>
        <label for="a-${esc(c.id)}">${libelleQte(c) ? `<span class="q">${esc(libelleQte(c))}</span>` : ""}<span>${esc(c.nom)}</span>${c.de?.length ? `<span class="de">${esc(c.de.join(" · "))}</span>` : ""}</label>
        <button class="suppr" data-suppr="${esc(c.id)}" aria-label="Retirer ${esc(c.nom)}">×</button>
      </div>`).join("")}</div>`;
  }).join("");
}

/* ---------- vue : réglages ---------- */
function vueReglages() {
  const modele = lire("modele") || "precis";
  app.innerHTML = `<section class="view">
    <h1 class="titre">Réglages</h1>
    <div class="carton">
      <h2 class="sec">Clé API Claude</h2>
      <p class="sous">Elle reste sur cet appareil. À saisir une fois sur le téléphone et une fois sur le PC. Créez-la sur console.anthropic.com → API Keys.</p>
      <div class="field"><label for="cle">Clé</label><input type="password" id="cle" placeholder="sk-ant-…" value="${esc(lire("cle-api") || "")}" autocomplete="off"></div>
      <div class="row"><button class="btn plein" id="cle-ok">Enregistrer et tester</button><button class="btn discret" id="cle-suppr">Effacer de cet appareil</button></div>
      <p class="statut" id="cle-statut"></p>
      <div class="field"><label for="modele">Qualité de retranscription</label>
        <select id="modele">${Object.entries(MODELES).map(([k, m]) => `<option value="${k}" ${k === modele ? "selected" : ""}>${esc(m.nom)} : ${esc(m.cout)}</option>`).join("")}</select></div>
    </div>
    <div class="carton">
      <h2 class="sec">Sauvegarde</h2>
      <label class="btn discret" style="text-align:center;position:relative">📥 Importer un fichier de recettes (.json)<input type="file" id="import" accept=".json,application/json" style="position:absolute;inset:0;opacity:0"></label>
      <div class="row"><button class="btn discret" id="export-json">💾 Sauvegarder (.json)</button><button class="btn discret" id="export-csv">📊 Exporter pour Excel (.csv)</button></div>
      <p class="statut" id="s-statut"></p>
    </div>
    <div class="carton">
      <h2 class="sec">Compte</h2>
      <p>Connecté : <b>${esc(utilisateur.email || utilisateur.displayName || "")}</b></p>
      <button class="btn danger" id="deco">Se déconnecter</button>
    </div>
  </section>`;
  const st = $("#cle-statut");
  $("#cle-ok").onclick = async () => {
    const v = $("#cle").value.trim();
    if (!v) { st.className = "statut err"; st.textContent = "Collez votre clé d'abord."; return; }
    st.className = "statut"; st.textContent = "Vérification…";
    const r = await testerCle(v);
    if (r.ok) ecrire("cle-api", v);
    st.className = "statut " + (r.ok ? "ok" : "err"); st.textContent = r.ok ? "Clé enregistrée sur cet appareil. ✔" : r.message;
  };
  $("#cle-suppr").onclick = () => { ecrire("cle-api", null); $("#cle").value = ""; st.className = "statut"; st.textContent = "Clé effacée de cet appareil."; };
  $("#modele").onchange = e => { ecrire("modele", e.target.value); toast("Réglage enregistré."); };
  $("#import").onchange = e => importer(e.target.files[0]);
  $("#export-json").onclick = () => telecharger("mes-recettes.json", JSON.stringify(recettes, null, 2), "application/json");
  $("#export-csv").onclick = () => telecharger("mes-recettes.csv", csv(), "text/csv;charset=utf-8");
  $("#deco").onclick = () => signOut(auth);
}

async function importer(fichier) {
  const st = $("#s-statut");
  if (!fichier) return;
  try {
    let data = JSON.parse(await fichier.text());
    if (!Array.isArray(data)) data = data.recettes || [];
    const valides = data.filter(r => r && r.titre && Array.isArray(r.ingredients));
    const existants = new Set(recettes.map(r => r.titre.toLowerCase()));
    const nouvelles = valides.filter(r => !existants.has(String(r.titre).toLowerCase()));
    for (let i = 0; i < nouvelles.length; i += 400) {
      const lot = writeBatch(db);
      for (const r of nouvelles.slice(i, i + 400)) { const { id, ...corps } = r; lot.set(id ? doc(colRecettes(), String(id)) : doc(colRecettes()), corps); }
      await lot.commit();
    }
    st.className = "statut ok";
    st.textContent = `${nouvelles.length} recette${nouvelles.length > 1 ? "s" : ""} importée${nouvelles.length > 1 ? "s" : ""}` + (valides.length > nouvelles.length ? `, ${valides.length - nouvelles.length} déjà présente(s) ignorée(s).` : ".");
  } catch (e) {
    st.className = "statut err"; st.textContent = "Fichier illisible : choisissez le fichier .json de sauvegarde.";
  }
}
function telecharger(nom, contenu, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([contenu], { type }));
  a.download = nom; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function csv() {
  const cell = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const tete = ["Titre", "Catégorie", "Étiquettes", "Portions", "Préparation (min)", "Cuisson (min)", "Difficulté", "Ingrédients", "Étapes", "Plateforme", "Lien", "Ajoutée le"];
  const lignes = recettes.map(r => [r.titre, r.categorie, (r.tags || []).join(", "), r.portions ?? "", r.tempsPreparation ?? "", r.tempsCuisson ?? "", r.difficulte,
    (r.ingredients || []).map(i => (qte(i, 1) + " " + i.nom).trim()).join("\n"), (r.etapes || []).map((e, i) => i + 1 + ". " + e).join("\n"),
    plateformes[r.plateforme] || "", r.sourceUrl || "", r.ajouteLe ? new Date(r.ajouteLe).toLocaleDateString("fr-FR") : ""].map(cell).join(";"));
  return "﻿" + [tete.map(cell).join(";"), ...lignes].join("\r\n");   // point-virgule + BOM : s'ouvre directement dans Excel français
}

/* ---------- démarrage ---------- */
async function demarrer() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  await recupererPartage();
  if (!firebaseConfig) return vueSansConfig();
  const fb = initializeApp(firebaseConfig);
  auth = getAuth(fb);
  db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  getRedirectResult(auth).catch(e => vueConnexion("Connexion impossible (" + e.code + ")."));
  onAuthStateChanged(auth, u => {
    desabonnements.splice(0).forEach(f => f());
    utilisateur = u; recettes = []; courses = []; recettesChargees = false;
    if (!u) return vueConnexion();
    $("#nav").hidden = false;
    ecouterDonnees();
    afficher();
  });
}
demarrer();
