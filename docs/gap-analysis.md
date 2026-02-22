# Growth OS - Eksik Analizi (Gap Analysis)

> Tarih: 2026-02-22
> Kaynak: `deep-research-report(1).md` vs mevcut codebase karsilastirmasi
> Durum: Proje MVP-0 asamasinda; bazi cekirdek moduller calisiyor, bazi alanlar hic baslanmamis.

---

## Ozet Tablo

| Alan                        | Rapor Hedefi    | Mevcut Durum          | Eksik Seviyesi |
| --------------------------- | --------------- | --------------------- | -------------- |
| OAuth2 PKCE (X)             | MVP-0 Gun 2     | Calisiyor (mock+real) | DUSUK          |
| Stil Cikarimi               | MVP-0 Gun 4     | Temel var             | ORTA           |
| Tweet/Thread Uretimi        | MVP-0 Gun 5     | Temel var             | ORTA           |
| Quote/Reply Onerileri       | MVP-0 Gun 5     | YOK                   | YUKSEK         |
| AI Coach Sohbet             | MVP-0+          | YOK                   | YUKSEK         |
| Icerik Kutuphanesi          | MVP-0 Gun 5     | Temel CRUD var        | ORTA           |
| Scheduler/Queue             | MVP-0 Gun 6     | Calisiyor             | DUSUK          |
| Analitik Dashboard          | MVP-0 Gun 7     | Temel snapshot var    | ORTA           |
| Gercek X Client             | MVP-0 Gun 2-7   | Sadece Mock           | YUKSEK         |
| Rakip Analizi               | MVP-1 Gun 11-13 | YOK                   | YUKSEK         |
| Multi-Account UI            | MVP-1 Gun 11-13 | Sema var, UI yok      | ORTA           |
| Plan/Kredi Sistemi          | MVP-1 Gun 23-24 | YOK                   | YUKSEK         |
| Stripe Odeme                | MVP-1 Gun 25-26 | YOK                   | YUKSEK         |
| Landing Page + Waitlist     | MVP-1 Gun 29-30 | YOK                   | YUKSEK         |
| Growth Loops (Referral vb.) | MVP-1           | YOK                   | YUKSEK         |
| Prod Deployment             | MVP-1 Gun 29-30 | Sadece docker-compose | ORTA           |

---

## 1. Stil Cikarimi (Style Extraction) - ORTA EKSIK

### Mevcut

- `POST /style/extract` calisiyor
- Temel metrikler: avgLength, hashtagRatio, emojiRatio, ctaRatio, preferredTone

### Raporda Hedeflenen Ama Eksik Olan

- [ ] **Vocabulary listesi** (20+ kelime/ifade) - rapor "vocabulary" alanini sart kosuyor
- [ ] **Humor/sarcasm seviyesi** - tone disinda ayri bir skor
- [ ] **Hook pattern cikarimi** (en az 10 kalip + ornek) - su an yok
- [ ] **Do/Don't listesi** (en az 8 madde) - kullanicinin "yapma" ve "yap" kaliplari
- [ ] **CTA pattern cesitlendirme** - su an sadece oran var, kalip listesi yok
- [ ] **Format tercihi** (thread vs single) - otomatik tespit yok
- [ ] **Brand safety notes** - kacinilacak konular/kelimeler
- [ ] **Cumle ritmi analizi** - kisa/uzun cumle desen tespiti
- [ ] **Dil/argo kullanimi** - informal/formal derecelendirme

### Aksiyon

Style profile JSON schema genisletilmeli; LLM prompt'una bu alanlarin hepsi eklenmeli.

---

## 2. Icerik Uretimi (Content Generation) - ORTA EKSIK

### Mevcut

- `POST /generation/draft` - tweet ve thread uretimi calisiyor
- Version yonetimi var
- OpenRouter + stub LLM entegrasyonu var

### Raporda Hedeflenen Ama Eksik Olan

- [ ] **Quote tweet onerisi** - viral/trending tweet'lere baglanan yanit uretimi
- [ ] **Reply onerisi** - 5 cesit (insight, counterpoint, witty, question, resource)
- [ ] **AI Coach sohbet modulu** - strateji + fikir bankasi; chat-based arayuz
- [ ] **Format sablonlari** - Micro, Hook+Value+CTA, listicle, story gibi secenekler
- [ ] **Hook scoring** - uretilen icerige "hook kalitesi" puani verme (XLab benzeri)
- [ ] **Guardrail'ler** - "ayni cumleleri tekrarlama", "spammy CTA yok", "kiskirticiya/yaniltici iddiaya karsi" kontroller prompt seviyesinde
- [ ] **Claim & credibility filtresi** - sayisal iddialar icin "kanit sor" veya "tahmini" isareti

### Aksiyon

- Content type enum'a `reply` ve `quote` eklenmeli
- Format sablonlari `prompt_templates` tablosuna seed edilmeli
- AI Coach icin ayri bir chat endpoint tasarlanmali

---

## 3. Icerik Kutuphanesi (Library) - ORTA EKSIK

### Mevcut

- `contents` + `content_versions` tablolari var
- Library view UI'da temel liste/filtreleme var
- Draft/version yonetimi calisiyor

### Raporda Hedeflenen Ama Eksik Olan

- [ ] **Template sistemi** - tekrar kullanilabilir icerik sablonlari
- [ ] **Content Series** - birbiriyle iliskili icerik gruplari
- [ ] **Evergreen queue** - tekrar yayinlanabilir "zamansiz" icerikler
- [ ] **Repurpose akisi** - eski icerikten yeni format uretme
- [ ] **Ilham kutuphanesi / Swipe file** - kayitli viral ornek tweet'ler (TweetHunter 2M library benzeri kisisel versiyon)
- [ ] **Tag/kategori sistemi** - icerik organizasyonu (tags alani schemada var ama UI'da kullanilmiyor)
- [ ] **Performans iliskilendirme** - library'de her item'in publish sonrasi metriklerini gosterme

### Aksiyon

- Evergreen queue icin yeni bir `is_evergreen` flag + rotation logic
- Template CRUD endpoint'leri + UI
- Tag filtreleme UI'a baglanmali

---

## 4. Zamanlama ve Yayinlama (Scheduler) - DUSUK EKSIK

### Mevcut

- BullMQ + Redis queue calisiyor
- State machine (queued -> in_progress -> completed/failed)
- Exponential backoff + jitter
- Similarity check (duplicate engel)
- Safe mode (human review gereksinimi)
- Dedupe key

### Raporda Hedeflenen Ama Eksik Olan

- [ ] **Optimal saat onerisi** - kullanicinin kitlesine gore "en iyi yayinlama saati" (Typefully benzeri)
- [ ] **Slot tabanli planlama** - Sabah/Ogle/Aksam slot'lari (takvim gorunumu)
- [ ] **Evergreen queue rotasyonu** - otomatik tekrar yayinlama zamanlayicisi
- [ ] **Thread delay** - thread tweet'leri arasinda gecikme ayari
- [ ] **Takvim gorunumu (Calendar UI)** - su an liste bazli; gorsel takvim yok
- [ ] **"Copy-to-X" fallback** - API limit asiminda tek tikla kopyalama + X compose'a yonlendirme
- [ ] **"Publish reminder"** - otomatik yerine push/email hatirlatma modu

### Aksiyon

- Calendar UI oncelikli (UX etkisi yuksek)
- Optimal saat hesaplama icin analytics verisi yeterli oldugunda implement edilebilir

---

## 5. Analitik ve Olcum (Analytics) - ORTA EKSIK

### Mevcut

- `post_metric_snapshots` tablosu (t15, t60, t24, manual)
- Temel endpoint'ler calisiyor
- Usage events loglaniyor

### Raporda Hedeflenen Ama Eksik Olan

- [ ] **Ilk saat alerting** - 15/60 dk pencerelerinde performans uyarilari (Slack/Email webhook)
- [ ] **Hook tipi analizi** - hangi hook kalibinin daha iyi performans gosterdigini raporlama
- [ ] **Saat bazli dagilim** - posting saatlerine gore performans grafiği
- [ ] **Trend analizi** - haftalar arasi karsilastirma (W1 vs W4)
- [ ] **Dashboard grafikleri** - su an sadece ham veri; gorsel chart/grafik yok
- [ ] **"North Star Metric" paneli** - haftalik uretilip yayinlanan + hedef engagement esigini gecen post sayisi
- [ ] **Churn / retention metrikleri** - kullanici bazli (urunlestirme icin)
- [ ] **"Time to first value"** - ilk publish + ilk analytics goruntuleme suresi
- [ ] **Public analytics profile** - paylasabilir performans sayfasi (TweetHunter benzeri)

### Aksiyon

- Chart kutuphanesi entegrasyonu (Recharts veya Tremor)
- Alert sistemi icin webhook/notification altyapisi
- Hook tipi analizi icin content_versions.metadata ile metric cross-reference

---

## 6. Rakip Analizi - HIC BASLANMAMIS

### Raporda Tanimlanan

- 10-30 rakip hesap secimi
- Son 30 gun icerik turu/uzunluk/konu/etkilesim paterni cikarma
- "En iyi hook kaliplari" raporu
- Posting saatleri analizi
- "Steal their strategy" yaklaşımı (XPatla benzeri)

### Mevcut

- Hicbir altyapi yok (ne DB semasi ne endpoint ne UI)

### Aksiyon

- [ ] `competitor_accounts` tablosu olustur
- [ ] `competitor_posts` tablosu + ingestion pipeline
- [ ] Rakip hook/pattern analiz servisi
- [ ] Rakip paneli UI (Analytics view icine veya ayri view)
- [ ] Rate limit'e dikkat: baska kullanicilarin timeline'ini cekmek ek API kredi maliyeti getirir

---

## 7. Gercek X Client (Production API) - YUKSEK ONCELIK

### Mevcut

- `XClient` interface tanimli
- `MockXClient` tam calisir (test/dev)
- OAuth PKCE flow kodu var ama gercek X API'ye bagli degil

### Eksik

- [ ] **RealXClient implementasyonu** - gercek HTTP istekleri (fetch/axios)
- [ ] **Token refresh logic** - access token suresi doldugunda otomatik yenileme
- [ ] **Rate limit header parsing** - `x-rate-limit-*` header'larini okuma ve proaktif yavaslatma
- [ ] **429 recovery** - Too Many Requests durumunda backoff + retry
- [ ] **Pagination** - timeline cekiminde cursor-based pagination (3200 post limiti)
- [ ] **Error mapping** - X API hata kodlarini anlamli uygulama hatalarina cevirme
- [ ] **Webhook/streaming** - (opsiyonel) gercek zamanli bildirimler

### Aksiyon

Bu, projenin "gercekten calisir" hale gelmesi icin EN KRITIK eksik.
`X_CLIENT_MODE=real` icin tam implementasyon gerekli.

---

## 8. Multi-Account ve Workspace - ORTA EKSIK

### Mevcut

- DB seması var (workspaces, workspace_members, x_accounts)
- SessionAuthGuard workspace-scoped erisim kontrolu yapiyor
- Tek hesap akisi calisiyor

### Eksik

- [ ] **Multi-account UI** - birden fazla X hesabi baglama ve arasinda gecis
- [ ] **Hesap bazli style profile** - her hesap icin ayri stil profili (sema destekliyor ama UI yok)
- [ ] **Workspace davet/yonetim ekrani** - uye ekleme/cikarma
- [ ] **Rol bazli UI kisitlamalari** - owner vs editor vs viewer farkli gorunumler
- [ ] **Workspace switcher** - birden fazla workspace arasinda gecis

### Aksiyon

Settings view genisletilmeli; workspace management UI oncelikli.

---

## 9. Plan/Kredi Sistemi - HIC BASLANMAMIS

### Raporda Tanimlanan

- Free: 30 uretim/ay + 7 gun analytics
- Creator ($19): 300 uretim/ay + 60 gun + 3 hesap
- Growth ($49): sinirsiz draft + gelismis analytics
- Team ($99+): koltuk + onay + audit + SLA
- Kredi bazli metering (1 kredi = 1 AI uretim)

### Mevcut

- `usage_events` tablosu var (temel event loglama)
- `plan_key` alani workspaces tablosunda var ama kullanilmiyor

### Eksik

- [ ] **Plan tanimlari** - plan limitleri ve ozellik matrisi (DB veya config)
- [ ] **Kredi/limit kontrolu** - her uretim isteginde kalan hak kontrolu
- [ ] **Kullanim sayaci** - gunluk/aylik uretim sayisi takibi
- [ ] **Limit asimi engeli** - plan limitine ulasildiginda 402/429 donme
- [ ] **Plan yukseltme/dusurme akisi**
- [ ] **Metering dashboard** - kullaniciya kalan hakki gosteren UI

### Aksiyon

`plans` config tablosu + middleware seviyesinde limit enforcement gerekli.

---

## 10. Odeme Entegrasyonu (Stripe) - HIC BASLANMAMIS

### Raporda Tanimlanan

- Stripe ile odeme alma
- Plan yonetimi + fatura e-postalari
- Yillik/aylik faturalama opsiyonu

### Eksik

- [ ] **Stripe SDK entegrasyonu**
- [ ] **Checkout Session olusturma**
- [ ] **Webhook handler** (payment_intent.succeeded, subscription.updated, vb.)
- [ ] **Musteri portali** - fatura gecmisi, kart guncelleme
- [ ] **Plan degisikligi** - upgrade/downgrade proration
- [ ] **Fatura e-posta entegrasyonu**
- [ ] **Pricing sayfasi UI**

### Aksiyon

Stripe entegrasyonu MVP-1'in en buyuk is parcasi. Oncelik: Checkout + Webhook + Plan sync.

---

## 11. Guvenlik Sertlestirme - ORTA EKSIK

### Mevcut (Iyi Temel)

- AES-256-GCM token sifreleme
- PKCE OAuth2
- CORS allowlist
- Audit logging
- Pre-push quality gate
- CodeQL scanning

### Raporda Hedeflenen Ama Eksik Olan

- [ ] **KMS entegrasyonu** - su an cevresel degisken bazli; production icin AWS KMS/GCP KMS
- [ ] **WAF** - Web Application Firewall (prod deployment)
- [ ] **OWASP BOLA testleri** - workspace izolasyon testleri (SessionAuthGuard var ama dedicated test yok)
- [ ] **Password storage** - su an magic link; eger password eklendiyse OWASP rehberine uyum
- [ ] **Rate limiting (API seviyesi)** - endpoint bazli rate limit (X rate limit'den ayri, kendi API'n icin)
- [ ] **IP-based rate limiting** - brute force korumasi
- [ ] **Token sizinti testi** - CI'da secret scanning (GitGuardian / truffleHog)
- [ ] **Security headers** - Helmet.js veya benzeri (HSTS, CSP, X-Frame-Options)
- [ ] **SOC2-ready log pipeline** - urunlestirme hedefi icin

### Aksiyon

- API rate limiting (express-rate-limit veya NestJS throttler) hemen eklenebilir
- Security headers hemen eklenebilir
- KMS ve WAF deployment asamasinda ele alinacak

---

## 12. Frontend / UI Eksikleri - ORTA EKSIK

### Mevcut

- 6 view: Dashboard, Generator, Library, Scheduler, Analytics, Settings
- Magic link login sayfasi
- TanStack Query ile API entegrasyonu
- Radix UI + shadcn/ui + Tailwind

### Eksik

- [ ] **Takvim gorunumu** - scheduler icin gorsel takvim (su an liste)
- [ ] **Chart/grafik** - analytics icin gorsel grafikler (su an ham veri)
- [ ] **Rich text editor** - tweet/thread duzenleme icin daha iyi editor
- [ ] **Responsive tasarim** - mobil uyumluluk (test edilmemis)
- [ ] **Dark mode** - tema destegi
- [ ] **Onboarding wizard** - yeni kullanici icin adim adim rehber (su an basit checklist var)
- [ ] **Toast/notification sistemi** - islem sonucu bildirimleri
- [ ] **Loading/skeleton states** - veri yuklenirken gorsel geri bildirim
- [ ] **Error boundary** - hata durumlarinda kullanici dostu mesajlar
- [ ] **Keyboard shortcuts** - hizli erisim (power user UX)

### Aksiyon

Chart kutuphanesi ve takvim gorunumu en buyuk UX iyilestirmeleri olacak.

---

## 13. Test ve Kalite - DUSUK EKSIK

### Mevcut (Iyi Temel)

- 17+ test dosyasi
- Node.js native test runner
- Playwright E2E
- Coverage gate (%70 minimum)
- Pre-push quality gate

### Eksik

- [ ] **Load testing** - publish worker rate-limit/backoff davranisi (429 simulasyonu)
- [ ] **Security testleri** - BOLA/workspace izolasyon testleri
- [ ] **E2E test genisletme** - su an sadece auth flow; generator, scheduler, analytics akislari
- [ ] **Visual regression** - UI degisikliklerini yakalama
- [ ] **Contract testing** - API sozlesmesi degisiklikleri icin (Pact veya benzeri)
- [ ] **Smoke test genisletme** - `scripts/smoke-test.mjs` kapsaminin genisletilmesi
- [ ] **Mock X Client edge case'leri** - daha fazla hata senaryosu (network timeout, partial response)

### Aksiyon

E2E test kapsamini genisletmek oncelikli; load test urunlestirme oncesi gerekli.

---

## 14. Deployment ve Altyapi - ORTA EKSIK

### Mevcut

- Docker Compose (PostgreSQL + Redis + MailHog)
- GitHub Actions CI pipeline
- `deploy-hook.mjs` script (staging/prod)

### Eksik

- [ ] **Production Docker dosyalari** - her app icin Dockerfile (multi-stage build)
- [ ] **Kubernetes/ECS manifesti** - orchestration
- [ ] **CDN yapilandirmasi** - frontend static asset'ler
- [ ] **SSL/TLS sertifika yonetimi**
- [ ] **Environment management** - staging vs production .env yonetimi (Vault, SSM)
- [ ] **Monitoring stack** - Sentry entegrasyonu (raporda bahsediliyor)
- [ ] **Product analytics** - PostHog entegrasyonu (raporda bahsediliyor)
- [ ] **Uptime monitoring** - health check + alerting
- [ ] **Backup stratejisi** - PostgreSQL otomatik backup
- [ ] **Log aggregation** - ELK/Loki veya benzeri

### Aksiyon

Dockerfile'lar + Sentry + PostHog ilk adim; Kubernetes/ECS urunlestirme asamasinda.

---

## 15. Landing Page ve GTM - HIC BASLANMAMIS

### Raporda Tanimlanan

- Landing page + waitlist
- Onboarding akisi
- Demo data
- Changelog
- Referral sistemi
- Community (Telegram/Discord)
- "Built with..." showcase

### Eksik

- [ ] **Landing page** - urun tanitim sayfasi
- [ ] **Waitlist form** - beta erken erisim kaydi
- [ ] **Pricing sayfasi** - plan karsilastirmasi
- [ ] **Changelog** - urun guncellemeleri sayfasi
- [ ] **Referral sistemi** - davet ile kredi kazanma
- [ ] **Community entegrasyonu** - Discord/Telegram link + embed
- [ ] **Demo/sandbox** - yeni kullanicilara ornek veri ile deneyim

### Aksiyon

Landing page ve waitlist, urunlestirme oncesi ilk gorunurluk icin oncelikli.

---

## Oncelik Siralaması (Onerilen)

### Faz 1 - MVP-0 Tamamlama (Kisisel Kullanim Icin Calisan Urun)

1. **Gercek X Client implementasyonu** - projenin kalbi
2. **Stil cikarimi zenginlestirme** - vocabulary, hooks, do/don't
3. **Chart/grafik entegrasyonu** - analytics gorunurlugu
4. **Takvim gorunumu** - scheduler UX
5. **Ilk saat alerting** - "fast feedback loop"

### Faz 2 - MVP-1 Temeli (Urunlestirmeye Hazirlik)

6. **Quote/Reply onerisi** - engagement arttirici ozellik
7. **Rakip analizi** - stratejik deger
8. **Plan/kredi sistemi** - monetizasyon altyapisi
9. **Stripe entegrasyonu** - odeme
10. **Multi-account UI** - coklu hesap yonetimi

### Faz 3 - Launch Hazirlik

11. **Landing page + waitlist**
12. **Production deployment** (Dockerfile, monitoring)
13. **Security sertlestirme** (rate limiting, headers, KMS)
14. **AI Coach** - chat-based strateji modulu
15. **Growth loops** (referral, public analytics)

---

## Metrikler

| Metrik                          | Deger            |
| ------------------------------- | ---------------- |
| Toplam eksik madde              | ~85              |
| HIC BASLANMAMIS alan            | 4                |
| YUKSEK eksik alan               | 3                |
| ORTA eksik alan                 | 7                |
| DUSUK eksik alan                | 2                |
| Tahmini MVP-0 tamamlama (Faz 1) | 5 ana is parcasi |
| Tahmini MVP-1 tamamlama (Faz 2) | 5 ana is parcasi |
