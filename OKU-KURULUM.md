# Turvio VR — Gözlük Uygulaması (gozluk-app)

Bu klasör, VR gözlükte **tek başına (standalone)** çalışan Turvio oynatıcısıdır.
Bilgisayardan dışa aktarılan `.turvio` tur dosyalarını içeri alır, cihazda saklar ve
360° + hotspot ile immersive VR'da oynatır. Tamamen çevrimdışı çalışır.

> Durum (Faz 2): **Uygulama kodu tamamlandı.** Kalan tek iş, bunu gözlüğe kurulacak bir
> **APK** haline paketlemek ve gerçek gözlükte doğrulamak.

---

## Dosyalar
- `index.html` — ekranlar (tur listesi + Tur Ekle + oynatıcı) ve A-Frame sahnesi
- `app.js` — depolama (IndexedDB), içe alma, 360/hotspot oynatıcı
- `styles.css`, `manifest.webmanifest`
- `lib/aframe.min.js` — A-Frame (yerel, çevrimdışı)

---

## 1) Masaüstünde HIZLI TEST (APK'dan önce, önerilir)
APK'ya uğraşmadan önce uygulamanın çalıştığını bilgisayarda görebilirsiniz:

1. Proje kök klasöründe: **`npm run gozluk`**
2. Edge/Chrome'da aç: **http://localhost:8080**
3. **➕ Tur Ekle** → masaüstü Turvio'dan dışa aktardığınız `.turvio` dosyasını seçin.
4. Tur listede çıkar; tıklayın → tur açılır, **fareyle** 360 gezebilir, hotspotlara tıklayabilirsiniz.
   (Gözlük bilgisayara **Link** ile bağlıysa sağ alttaki VR simgesiyle gerçek VR'a da girebilirsiniz.)

Bu test, kod mantığını doğrular. Sorun görürsek burada düzeltiriz, sonra APK'ya geçeriz.

---

## 2) Gözlüğe kurma — HAZIR olanlar ve KALAN gerçek adım

**Hazır (yapıldı):**
- ✅ İkonlar (`icon-192.png`, `icon-512.png`) + manifest'e eklendi.
- ✅ Servis çalışanı (`sw.js`) — uygulama ilk açılıştan sonra **çevrimdışı** çalışır.
- ✅ Uygulama artık **kurulabilir bir PWA** (geçerli manifest + service worker + ikon).

**Kalan tek gerçek ön koşul: uygulamayı bir HTTPS web adresinde yayınlamak.**
Quest'te immersive VR yalnızca tarayıcı motorunda çalıştığı için, kurulabilir uygulama
(hem "tarayıcıdan Yükle" hem de APK yolu) uygulamanın **HTTPS bir adreste** durmasını ister.
Bu, ücretsiz ve tek seferlik bir adımdır (ör. GitHub Pages / Netlify / Cloudflare Pages).
İnternet sadece **kurulum anında** gerekir; kurulduktan sonra uygulama çevrimdışı çalışır ve
turlar zaten dosya ile aktarıldığı için müşteride kalır.

### Yol B1 — Tarayıcıdan Yükle (en basit, APK'sız)
1. `gozluk-app/` içeriğini bir HTTPS statik hosta koy.
2. Gözlüğün **tarayıcısında** o adresi aç → menüden **"Uygulamayı Yükle"** de.
3. Uygulama simgesi Quest kütüphanesine gelir; çevrimdışı çalışır.
(Geliştirici modu / SideQuest / kablo GEREKMEZ.)

### Yol B2 — APK yap ve SideQuest ile kur
1. Aynı HTTPS adresi kullanarak **PWABuilder** (web sitesi) veya **bubblewrap** (yerelde;
   `java` mevcut, Android SDK'yı bubblewrap indirir) ile **`.apk`** üret.
2. `.apk`'yı **SideQuest** ile gözlüğe yükle (geliştirici modu + USB kablo).

> ⚠️ **Cihazda doğrulama:** immersive VR'ın gerçek Quest'te açıldığı, cihazda test edilince
> kesinleşir. Uygulama kodu bundan etkilenmez.

> NOT: Hosting adımı bir hesap/karar gerektirdiği için otomatik yapılamaz; birlikte kurulur.

---

## 3) Kullanım (gözlükte)
1. Bilgisayarda tur hazırla → **"Turu Dışa Aktar"** → `.turvio` dosyası oluşur.
2. Dosyayı **USB kabloyla** gözlüğe kopyala.
3. Gözlükte **Turvio** uygulaması → **➕ Tur Ekle** → dosyayı seç.
4. Tur listeden seç → **360 VR başlar** (kafa çevirerek bak, hotspotlara tıklayarak gez).
5. İzleyen olsun istersen: gözlüğün kendi **Yayınlama (Casting)** özelliğiyle telefon/tablete yansıt.

---

## Yapılacaklar (TODO)
- [x] `manifest.webmanifest` içine PNG ikon(lar) ekle.
- [x] Servis çalışanı (çevrimdışı) ekle.
- [ ] `gozluk-app/`'i bir HTTPS statik hosta koy (kurulumun ön koşulu).
- [ ] Yol B1 (tarayıcıdan Yükle) veya Yol B2 (PWABuilder/bubblewrap → .apk) ile gözlüğe kur.
- [ ] Gerçek Quest'te immersive VR + hotspot + çevrimdışı testini yap.
- [ ] Büyük turlar için `.turvio` dosya boyutu (base64) davranışını gözden geçir.
