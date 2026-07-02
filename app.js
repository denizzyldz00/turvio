// =====================================================================
// Turvio VR (gozluk uygulamasi) - app.js
// - Bilgisayardan disa aktarilan tek dosyayi (.turvio) "Tur Ekle" ile
//   iceri alir; tur bilgisini ve gorselleri cihazda (IndexedDB) saklar.
// - Kayitli turlari listeler; secilen turu immersive WebXR ile 360 + hotspot
//   olarak oynatir (kafa takibi WebXR'dan, tiklama kumanda lazeri/fare ile).
// - Tamamen CEVRIMDISI: internet/ag yok; her sey yerel dosya + yerel depo.
// - Not: PC surumundeki izleme (spectator) ekrani BURADA YOK; gozlukten
//   telefon/tablete yansitma Meta'nin kendi Casting ozelligiyle yapilir.
// =====================================================================

'use strict';

const THREE = AFRAME.THREE;

// Hotspot panellerinin izleyiciye uzakligi (metre)
const HOTSPOT_RADIUS = 8;

// ---------------------------------------------------------------------
// IndexedDB - basit soz (promise) sarmalayici
// stores: 'tours' (id -> tur bilgisi), 'images' (tourId/dosya -> Blob)
// ---------------------------------------------------------------------
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('turvio-vr', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tours')) db.createObjectStore('tours');
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbPut(store, key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(store, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll(store) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAllKeys(store) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(store, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------
// DOM referanslari
// ---------------------------------------------------------------------
const elHome = document.getElementById('homeScreen');
const elTourList = document.getElementById('tourList');
const elHomeEmpty = document.getElementById('homeEmpty');
const elFileInput = document.getElementById('fileInput');

const elPlayerUi = document.getElementById('playerUi');
const elBackBtn = document.getElementById('backBtn');
const elSceneTitle = document.getElementById('sceneTitle');
const elSceneNav = document.getElementById('sceneNav');
const elVrHint = document.getElementById('vrHint');
const elLoadingSpinner = document.getElementById('loadingSpinner');
const elToast = document.getElementById('toast');

const elScene = document.querySelector('a-scene');
const elSky = document.getElementById('sky');
const elHotspots = document.getElementById('hotspots');

let toastTimer = null;
function toast(message, ms) {
  elToast.textContent = message;
  elToast.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { elToast.style.display = 'none'; }, ms || 3500);
}

function showSpinner() { elLoadingSpinner.classList.add('visible'); }
function hideSpinner() { elLoadingSpinner.classList.remove('visible'); }

// ---------------------------------------------------------------------
// ANA MENU: tur listesi
// ---------------------------------------------------------------------
async function renderTourList() {
  const tours = await idbGetAll('tours');
  tours.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  elTourList.innerHTML = '';
  elHomeEmpty.style.display = tours.length ? 'none' : 'flex';

  tours.forEach((tour) => {
    const count = tour.scenes ? Object.keys(tour.scenes).length : 0;
    const card = document.createElement('div');
    card.className = 'tour-card';
    card.innerHTML =
      '<h3></h3><div class="meta">' + count + ' sahne</div>' +
      '<span class="del">🗑 Sil</span>';
    card.querySelector('h3').textContent = tour.name || 'İsimsiz Tur';

    card.addEventListener('click', () => {
      openTour(tour.id);
      tryEnterVR(); // kullanici tikladigi an (jest icinde) dogrudan VR'a gir
    });
    card.querySelector('.del').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('"' + (tour.name || 'Tur') + '" silinsin mi?')) {
        await deleteTour(tour.id);
        renderTourList();
      }
    });
    elTourList.appendChild(card);
  });
}

async function deleteTour(tourId) {
  await idbDelete('tours', tourId);
  const keys = await idbGetAllKeys('images');
  for (const k of keys) {
    if (typeof k === 'string' && k.indexOf(tourId + '/') === 0) {
      await idbDelete('images', k);
    }
  }
}

// ---------------------------------------------------------------------
// TUR EKLE: .turvio dosyasini iceri al
// Dosya bicimi: { turvioVersion, name, firstScene, scenes, images{ dosya: dataURL } }
// ---------------------------------------------------------------------
elFileInput.addEventListener('change', async () => {
  const file = elFileInput.files && elFileInput.files[0];
  elFileInput.value = ''; // ayni dosya tekrar secilebilsin
  if (!file) return;

  toast('Tur içe alınıyor, lütfen bekleyin...', 60000);
  try {
    const text = await file.text();
    const obj = JSON.parse(text);

    if (!obj || typeof obj !== 'object' || typeof obj.scenes !== 'object') {
      toast('Bu dosya geçerli bir Turvio tur dosyası değil.');
      return;
    }

    const tourId = 'tur_' + Date.now();

    // Gorselleri Blob olarak sakla (dataURL -> Blob)
    const images = obj.images || {};
    for (const fileName of Object.keys(images)) {
      const resp = await fetch(images[fileName]);
      const blob = await resp.blob();
      await idbPut('images', tourId + '/' + fileName, blob);
    }

    await idbPut('tours', tourId, {
      id: tourId,
      name: obj.name || 'İsimsiz Tur',
      firstScene: obj.firstScene || null,
      scenes: obj.scenes,
      createdAt: Date.now()
    });

    await renderTourList();
    toast('✓ Tur eklendi: ' + (obj.name || 'İsimsiz Tur'));
  } catch (err) {
    toast('Tur eklenemedi: dosya okunamadı veya bozuk.');
  }
});

// ---------------------------------------------------------------------
// OYNATICI
// ---------------------------------------------------------------------
let currentTour = null;
let currentSceneId = null;
let transitioning = false;
let vrSupported = false; // baslangicta ogrenilir; tura tiklayinca dogrudan VR icin

// Aci -> 3B konum (Pannellum yaw/pitch ile hizali; a-sky "0 -90 0")
function sphericalToPosition(pitchDeg, yawDeg) {
  const pitch = (pitchDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  return {
    x: HOTSPOT_RADIUS * Math.cos(pitch) * Math.sin(yaw),
    y: HOTSPOT_RADIUS * Math.sin(pitch),
    z: -HOTSPOT_RADIUS * Math.cos(pitch) * Math.cos(yaw)
  };
}

// Hotspot paneli gorseli (canvas ile; sistem fontu -> cevrimdisi calisir).
// a-text KULLANILMAZ (varsayilan fontu internetten yukler).
function makeHotspotImage(title) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.beginPath();
  ctx.arc(256, 78, 58, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(124, 108, 240, 0.92)';
  ctx.fill();
  ctx.lineWidth = 7; ctx.strokeStyle = '#ffffff'; ctx.stroke();

  ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 11; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(256, 108); ctx.lineTo(256, 66); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(256, 44); ctx.lineTo(234, 74); ctx.lineTo(278, 74); ctx.closePath(); ctx.fill();

  const text = String(title || '');
  let fontSize = 46;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  do {
    ctx.font = 'bold ' + fontSize + 'px "Segoe UI", Arial, sans-serif';
    fontSize -= 2;
  } while (ctx.measureText(text).width > 480 && fontSize > 18);

  ctx.lineWidth = 8; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeText(text, 256, 200);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 256, 200);

  return canvas.toDataURL('image/png');
}

// Panoramayi karartip/aydinlatarak yumusak gecis.
// ONEMLI: window.requestAnimationFrame (ve kisilebildigi icin setInterval)
// IMMERSIVE VR'da guvenilmez. EN SAGLAMI A-Frame'in TICK dongusu: A-Frame,
// VR'da kareleri WebXR ile cizerken tick HER KARE calisir. Bu yuzden gecis
// 'sky-fader' bileseninin tick'iyle surulur -> gozlukte de sorunsuz calisir.
AFRAME.registerComponent('sky-fader', {
  init: function () { this.active = null; },
  tick: function (time, dt) {
    const a = this.active;
    if (!a) return;
    a.elapsed += (dt || 16);
    const t = Math.min(a.elapsed / a.duration, 1);
    const v = a.from + (a.to - a.from) * t;
    const mesh = elSky.getObject3D('mesh');
    if (mesh && mesh.material) mesh.material.color.setRGB(v, v, v);
    if (t >= 1) { const resolve = a.resolve; this.active = null; resolve(); }
  },
  fade: function (from, to, duration) {
    return new Promise((resolve) => {
      // Onceki gecis bitmeden yenisi gelirse eskiyi cozup birak
      if (this.active) { const r = this.active.resolve; this.active = null; r(); }
      this.active = { from: from, to: to, duration: duration, elapsed: 0, resolve: resolve };
    });
  }
});

function tweenSkyBrightness(from, to, duration) {
  const comp = elScene && elScene.components ? elScene.components['sky-fader'] : null;
  if (comp) return comp.fade(from, to, duration);
  // Yedek: bilesen henuz yoksa rengi aninda uygula
  const mesh = elSky.getObject3D('mesh');
  if (mesh && mesh.material) mesh.material.color.setRGB(to, to, to);
  return Promise.resolve();
}

// ImageBitmap'i a-sky dokusuna uygular. Yon bitmap olusturulurken 'flipY'
// ile ayarlandigi icin texture.flipY=false; masaustu ile birebir ayni durur.
// Eski doku dispose edilir (uzun turda VRAM birikmesin).
function applySkyBitmap(bitmap) {
  const mesh = elSky.getObject3D('mesh');
  if (!mesh || !mesh.material) return false;
  const texture = new THREE.Texture(bitmap);
  texture.flipY = false;
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  else if (THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
  texture.needsUpdate = true;
  const old = mesh.material.map;
  mesh.material.map = texture;
  mesh.material.needsUpdate = true;
  if (old && old !== texture && typeof old.dispose === 'function') old.dispose();
  return true;
}

// Sahne dokusunu bir Blob'tan yukler: once dusuk cozunurluklu on gorsel
// (aninda; donma olmasin), sonra arka planda tam cozunurluk. createImageBitmap
// ayri is parcaciginda cozdugu icin kare akisi kilitlenmez.
let skyLoadToken = 0;
function setSkyFromBlob(blob) {
  const token = ++skyLoadToken;
  return new Promise((resolve) => {
    let settled = false, safety = null;
    const done = () => { if (!settled) { settled = true; if (safety) clearTimeout(safety); resolve(); } };
    safety = setTimeout(done, 30000);

    const orient = { imageOrientation: 'flipY' };
    (async () => {
      try {
        const small = await createImageBitmap(
          blob,
          Object.assign({ resizeWidth: 2048, resizeHeight: 1024, resizeQuality: 'low' }, orient)
        );
        if (token !== skyLoadToken) { done(); return; }
        applySkyBitmap(small);
        done();

        const full = await createImageBitmap(blob, orient);
        if (token !== skyLoadToken) { if (full.close) full.close(); return; }
        applySkyBitmap(full);
      } catch (e) {
        done();
      }
    })();
  });
}

function buildHotspots(sceneId) {
  while (elHotspots.firstChild) elHotspots.removeChild(elHotspots.firstChild);

  const scene = currentTour.scenes[sceneId];
  (scene.hotspots || [])
    .filter((h) => currentTour.scenes[h.targetSceneId] && h.targetSceneId !== sceneId)
    .forEach((h) => {
      const target = currentTour.scenes[h.targetSceneId];
      const pos = sphericalToPosition(h.pitch, h.yaw);

      const panel = document.createElement('a-plane');
      panel.setAttribute('width', 2.2);
      panel.setAttribute('height', 1.1);
      panel.setAttribute('position', pos.x + ' ' + pos.y + ' ' + pos.z);
      panel.setAttribute('material', {
        shader: 'flat', src: makeHotspotImage(target.title),
        transparent: true, alphaTest: 0.05
      });
      panel.classList.add('clickable');
      panel.addEventListener('loaded', () => panel.object3D.lookAt(0, 0, 0));
      panel.addEventListener('mouseenter', () => panel.object3D.scale.set(1.15, 1.15, 1.15));
      panel.addEventListener('mouseleave', () => panel.object3D.scale.set(1, 1, 1));
      panel.addEventListener('click', () => loadScene(h.targetSceneId));
      elHotspots.appendChild(panel);
    });
}

function updateSceneUi(activeSceneId) {
  const scene = currentTour.scenes[activeSceneId];
  elSceneTitle.textContent = scene ? scene.title : '';
  Array.from(elSceneNav.children).forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.sceneId === activeSceneId);
  });
}

function buildSceneNav(firstSceneId) {
  elSceneNav.innerHTML = '';
  Object.keys(currentTour.scenes).forEach((id) => {
    const btn = document.createElement('button');
    btn.textContent = currentTour.scenes[id].title;
    btn.dataset.sceneId = id;
    btn.addEventListener('click', () => { if (currentSceneId !== id) loadScene(id); });
    elSceneNav.appendChild(btn);
  });
  updateSceneUi(firstSceneId);
}

async function updateVrHint() {
  if (!navigator.xr || !navigator.xr.isSessionSupported) {
    elVrHint.textContent = 'Bu cihazda VR desteği bulunamadı. Tur, dokunarak/fareyle gezilebilir.';
    return;
  }
  try {
    const supported = await navigator.xr.isSessionSupported('immersive-vr');
    elVrHint.innerHTML = supported
      ? '🥽 VR hazır — sağ alttaki <b>VR</b> simgesine dokunun.'
      : '🥽 VR başlatılamadı. Tur bu ekranda da gezilebilir.';
  } catch (e) {
    elVrHint.textContent = 'Tur, dokunarak/fareyle gezilebilir.';
  }
}

// Bir sahneyi yukler (gorsel Blob'u yerel depodan alinir)
async function loadScene(sceneId, isFirst) {
  if (transitioning) return;
  const scene = currentTour.scenes[sceneId];
  if (!scene) return;

  transitioning = true;
  showSpinner();
  elHotspots.setAttribute('visible', false);

  try {
    if (!isFirst) await tweenSkyBrightness(1, 0, 400);

    const fileName = String(scene.image || '').split('/').pop();
    const blob = await idbGet('images', currentTour.id + '/' + fileName);
    if (blob) {
      await setSkyFromBlob(blob);
    }

    currentSceneId = sceneId;
    buildHotspots(sceneId);
    updateSceneUi(sceneId);

    elHotspots.setAttribute('visible', true);
    await tweenSkyBrightness(0, 1, 600);
  } catch (e) {
    // Gecis sirasinda hata olursa arayuz kilitlenmesin
  } finally {
    hideSpinner();
    transitioning = false;
  }
}

// ---------------------------------------------------------------------
// Ekranlar arasi gecis (menu <-> oynatici)
// ---------------------------------------------------------------------
// Gercek VR destekleniyorsa turu dogrudan immersive VR'da acar.
// enterVR() kullanici jesti (tura tiklama) icinde cagrilmali; o yuzden
// bu, click isleyicisinde openTour ile birlikte SENKRON cagrilir.
function tryEnterVR() {
  if (!vrSupported) return;
  try { if (elScene && elScene.enterVR) elScene.enterVR(); } catch (e) {}
}

async function openTour(tourId) {
  const tour = await idbGet('tours', tourId);
  if (!tour) { toast('Tur bulunamadı.'); return; }
  tour.scenes = tour.scenes || {};

  const ids = Object.keys(tour.scenes);
  if (ids.length === 0) { toast('Bu turda kayıtlı sahne yok.'); return; }

  currentTour = tour;
  currentSceneId = null;

  elHome.style.display = 'none';
  elPlayerUi.style.display = 'block';
  document.body.classList.add('playing');
  document.title = 'Turvio VR - ' + (tour.name || 'Sanal Tur');

  const firstScene = (tour.firstScene && tour.scenes[tour.firstScene]) ? tour.firstScene : ids[0];
  buildSceneNav(firstScene);
  updateVrHint();

  const start = () => loadScene(firstScene, true);
  if (elScene.hasLoaded) start();
  else elScene.addEventListener('loaded', start, { once: true });
}

function backToHome() {
  // VR oturumundaysak once cikmayi dene
  try {
    if (elScene.renderer && elScene.renderer.xr && elScene.renderer.xr.isPresenting) {
      elScene.exitVR();
    }
  } catch (e) {}

  currentTour = null;
  currentSceneId = null;
  skyLoadToken++; // devam eden doku yuklemesini gecersiz kil

  // Sahneyi siyaha dondur, hotspotlari temizle
  const mesh = elSky.getObject3D('mesh');
  if (mesh && mesh.material) {
    if (mesh.material.map && mesh.material.map.dispose) mesh.material.map.dispose();
    mesh.material.map = null;
    mesh.material.color.setRGB(0, 0, 0);
    mesh.material.needsUpdate = true;
  }
  while (elHotspots.firstChild) elHotspots.removeChild(elHotspots.firstChild);

  elPlayerUi.style.display = 'none';
  document.body.classList.remove('playing');
  elHome.style.display = 'flex';
  document.title = 'Turvio VR';
  renderTourList();
}

elBackBtn.addEventListener('click', backToHome);

// ------------------------- Baslangic -------------------------
// Cevrimdisi calisma icin servis calisanini kaydet (https veya localhost'ta calisir)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Surum etiketi: guncellemenin gozluge ulasip ulasmadigini ANA EKRANDA gormek icin.
// Ana ekranda "Turvio VR · v3" gorunuyorsa yeni surum calisiyordur.
const APP_VERSION = 'v3';
const brandSmall = document.querySelector('.brand small');
if (brandSmall) brandSmall.textContent = 'VR · ' + APP_VERSION;

// Sahne gecis fade'ini suren bileseni sahneye ekle (A-Frame tick ile calisir)
if (elScene) elScene.setAttribute('sky-fader', '');

// VR destegini onceden ogren (tura tiklayinca dogrudan VR'a girebilmek icin)
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr')
    .then((s) => { vrSupported = s; })
    .catch(() => {});
}

renderTourList();
