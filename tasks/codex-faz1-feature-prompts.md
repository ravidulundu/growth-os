# Codex Prompts — Faz 1: MVP-0 Tamamlama

> Gap analysis'te "eksik" denilen bazı alanlar zaten implement edilmiş.
> Bu prompt'lar codebase'in GERÇEK durumuna göre yazıldı.
> Tech stack: NestJS 11 + Fastify 5 + PostgreSQL 16 + BullMQ 5 + Next.js 16 + React 19 + TanStack Query 5

---

## 1. X Client — Token Auto-Refresh

```
Proje: NestJS 11 API + BullMQ Worker
Durum: RealXClient zaten var ve çalışıyor (apps/api/src/modules/x_integration/x-client.ts, satır 242-518).
  - OAuth PKCE flow tamam
  - Rate limit handling (429, retry-after header) tamam
  - Error classification (transient vs permanent) tamam
  - Retry with exponential backoff tamam

GERÇEK EKSİK: Token auto-refresh. Refresh token DB'de encrypted saklanıyor ama hiçbir yerde kullanılmıyor.
  - x_tokens tablosunda refresh_token_encrypted var (migration 003)
  - Token expire olunca X API 401 → AUTH_FAILED → publish job permanent fail
  - Kullanıcı tekrar OAuth flow başlatmak zorunda

Mevcut token fetch pattern (worker/main.ts satır 359-385):
  SELECT xt.access_token_encrypted FROM x_tokens xt
  WHERE xt.account_id = $1 AND xt.revoked_at IS NULL
  ORDER BY xt.created_at DESC LIMIT 1;
  — expires_at bile kontrol edilmiyor!

Yapılacaklar:

1. Token fetch'e expiry kontrolü ekle (apps/worker/src/main.ts, satır 359-385):
   - WHERE ... AND (xt.expires_at IS NULL OR xt.expires_at > now() - interval '5 minutes')
   - 5 dakika buffer: token expire olmadan önce refresh tetikle

2. Token refresh fonksiyonu oluştur (apps/api/src/modules/x_integration/x-integration.service.ts):

   async refreshAccessToken(accountId: string, workspaceId: string): Promise<{ accessToken: string }> {
     // 1. Mevcut token'ı fetch et (refresh_token_encrypted dahil)
     // 2. refresh_token'ı decrypt et
     // 3. X OAuth2 token endpoint'ine POST:
     //    grant_type=refresh_token&refresh_token=<token>&client_id=<id>
     // 4. Yeni access_token + refresh_token al
     // 5. Eski token'ı revoke et (revoked_at = now())
     // 6. Yeni token'ları encrypted olarak kaydet
     // 7. Yeni access_token'ı return et
   }

3. Worker'da 401 AUTH_FAILED durumunda refresh dene (apps/worker/src/main.ts):
   - publishToX() 401 alınca → refreshAccessToken() çağır
   - Refresh başarılıysa → tekrar publishPost() dene (1 retry)
   - Refresh da 401 verirse → permanent fail (kullanıcı re-auth gerekli)

4. X API refresh token endpoint desteğini RealXClient'a ekle:
   - apps/api/src/modules/x_integration/x-client.ts'e yeni method:
     refreshToken(refreshToken: string): Promise<XTokenExchangeResult>
   - XClient interface'ine ekle (satır 36-45)
   - MockXClient'a da ekle (yeni mock token dönsün)
   - Worker x-client.ts'e (apps/worker/src/x-client.ts) bu method gerekmez (worker refresh'i service üzerinden yapar)

5. Proaktif refresh: Opsiyonel ama önerilen
   - Cron job veya BullMQ repeatable job: her 30 dakikada expire'a yakın token'ları refresh et
   - Bu prompt'ta yapılması zorunlu DEĞİL, ama altyapıyı buna uygun tasarla

Kısıtlar:
- Mevcut XClient interface'ini breaking change olmadan genişlet (yeni method opsiyonel olabilir)
- Token encryption/decryption pattern'ini değiştirme (encryptSecret/decryptSecret kullan)
- Mock mode'da refresh her zaman başarılı olmalı
- Race condition: aynı anda 2 job aynı token'ı refresh etmeye çalışabilir → DB row lock kullan

Doğrulama:
  pnpm --filter @growth-os/api build && pnpm --filter @growth-os/worker build
  pnpm --filter @growth-os/api test:unit && pnpm --filter @growth-os/worker test
  # Manuel: Token expire simülasyonu → refresh → publish başarılı
```

---

## 2. Stil Çıkarımı — LLM-Powered Enrichment

```
Proje: NestJS 11 API (apps/api/src/modules/style/)
Durum: extractStyleProfile() fonksiyonu 22 alanlı StyleProfile döndürüyor (style.service.ts satır 421-467).
  - vocabulary (20 token), hookPatterns (10 tip), doList, dontList, humorSarcasmScore,
    brandSafetyNotes, sentenceRhythm, ctaPatterns — HEPSİ VAR
  - AMA: Tamamen regex/token analizi ile hesaplanıyor, LLM kullanılmıyor
  - Hook pattern'ler sabit regex'lerle tespit ediliyor (satır 91-142)
  - Vocabulary sadece frekans analizi (en sık 20 kelime)

GERÇEK EKSİK: LLM ile zenginleştirilmiş stil analizi. Regex yaklaşımı yüzeysel kalıyor:
  - "Humor/sarcasm" skoru regex ile doğru ölçülemez
  - "Do/Don't" listesi genel kalıplar, kişiye özel değil
  - "Brand safety" notları generic
  - Hook pattern'ler sadece yapısal (soru mu, liste mi), semantik analiz yok

Mevcut LLM altyapısı (generation.service.ts):
  - OpenRouter entegrasyonu var (satır 60-84)
  - Model: openai/gpt-4o-mini, temperature: 0.6
  - Stub fallback modu var (LLM_PROVIDER=stub)

prompt_templates tablosu var (schema_v0 satır 130-146) ama seed data yok.

Yapılacaklar:

1. LLM-powered style analysis fonksiyonu ekle (style.service.ts):

   async function analyzeStyleWithLLM(texts: string[]): Promise<Partial<StyleProfile>> {
     // 1. Son 20-50 tweet'i birleştir
     // 2. System prompt: "Sen bir sosyal medya stil analisti..."
     // 3. LLM'den JSON response iste: {
     //      vocabulary: string[] (20 kişiye özel kelime/ifade),
     //      humorSarcasmScore: number (0-1),
     //      doList: string[] (8 kişiye özel öneri),
     //      dontList: string[] (8 kişiye özel uyarı),
     //      brandSafetyNotes: string[] (kaçınılması gereken konular),
     //      hookPatterns: { type, examples }[] (en etkili hook tipleri + gerçek örnekler),
     //      writingPersonality: string (2-3 cümle kişilik özeti)
     //    }
     // 4. JSON.parse + validation (Zod schema)
     // 5. Regex sonuçlarıyla merge et (LLM override, regex fallback)
   }

2. extractStyleProfile() fonksiyonunu güncelle:
   - Mevcut regex analizi aynen kalsın (hızlı, LLM olmadan da çalışsın)
   - LLM_PROVIDER !== "stub" ise → analyzeStyleWithLLM() çağır
   - LLM sonuçlarını regex sonuçlarıyla merge et
   - LLM başarısız olursa → sadece regex sonuçlarını döndür (graceful degradation)

3. Yeni alan ekle: writingPersonality (StyleProfile type'a)
   - 2-3 cümlelik kişilik özeti: "Kısa, punch'lı cümleler sever. Soru ile başlayıp data ile bitirir..."
   - Bu alan sadece LLM ile doldurulabilir

4. prompt_templates seed data oluştur:
   - packages/db/migrations/010_seed_style_prompt_template.sql
   - Veya apps/api/src/shared/db/seed.ts'e ekle
   - Template: style-analysis prompt (system + user)

Kısıtlar:
- Mevcut StyleProfile type'ını breaking change olmadan genişlet (yeni alanlar optional)
- style_profiles tablosundaki JSONB yapısı esnek, şema değişikliği gerekmez
- LLM çağrısı ücretli — her extract'te değil, sadece ilk kez veya "refresh" istediğinde çağır
- Token limiti: 50 tweet * ~280 karakter = ~14K token input → gpt-4o-mini'nin limiti içinde

Doğrulama:
  pnpm --filter @growth-os/api build && pnpm --filter @growth-os/api test:unit
  # Manuel: POST /style/extract → response'ta writingPersonality alanı göründüğünü doğrula
```

---

## 3. Analytics — Chart Kütüphanesi Entegrasyonu (Recharts)

```
Proje: Next.js 16 + React 19 (apps/web)
Durum: Analytics view 259 satır (analytics-view.tsx). Metrik barlar elle div'lerle render ediliyor (satır 134-149, 171-182).
  - Recharts, Tremor, Chart.js — HİÇBİRİ kurulu değil
  - Mevcut UI: AnalyticsSummary (2 card) + SnapshotCard listesi + MetricBar (proportional div)
  - API zaten t15/t60/t24 snapshot'larını dönüyor
  - FirstHourAlert UI zaten var (satır 67-95)

GERÇEK EKSİK: Profesyonel chart/grafik görselleştirmesi.

Yapılacaklar:

1. Recharts kur:
   cd apps/web && pnpm add recharts

2. analytics-view.tsx'e yeni chart bileşenleri ekle:

   a. EngagementOverTimeChart — Line/Area chart:
      - X ekseni: window_key (t15 → t60 → t24)
      - Y ekseni: impressions, likes, replies, reposts, quotes
      - Her metrik ayrı çizgi (renk kodlu)
      - Tooltip: hover'da detay

   b. EngagementBreakdownChart — Pie/Donut chart:
      - En son snapshot'ın metrik dağılımı (likes vs replies vs reposts vs quotes)
      - Yüzde gösterimi

   c. MetricComparisonBar — Horizontal bar chart:
      - Mevcut MetricBar bileşenini Recharts BarChart ile değiştir
      - Impressions bar + engagement bar yan yana

3. analytics-view.tsx yapısal refactor (ESLint max-lines-per-function: 80 kuralı!):
   - EngagementOverTimeChart → ayrı bileşen (aynı dosyada veya ayrı dosyada)
   - EngagementBreakdownChart → ayrı bileşen
   - Mevcut AnalyticsSummary, SnapshotCard, FirstHourAlert bileşenleri zaten ayrı — iyi
   - Ana AnalyticsView max 80 satır olmalı

4. Responsive tasarım:
   - ResponsiveContainer kullan (Recharts built-in)
   - Mobilde chart'lar stack, desktop'ta grid

Kısıtlar:
- Mevcut API endpoint'lerini değiştirme — chart'lar mevcut snapshot verisini kullanır
- useStudioController hook'unun return type'ını değiştirme
- Tailwind class'ları ile uyumlu ol (mevcut UI pattern'ini takip et)
- SSR uyumu: Recharts client-side only — dynamic import veya "use client" kullan

Doğrulama:
  pnpm --filter @growth-os/web build
  pnpm lint -- apps/web/components/studio/views/analytics-view.tsx  (max-lines-per-function geçmeli)
```

---

## 4. Scheduler — Takvim Görünümü (Calendar UI)

```
Proje: Next.js 16 + React 19 (apps/web)
Durum: Scheduler view 80 satır (scheduler-view.tsx). Sadece HTML table ile job listesi gösteriyor.
  - Takvim kütüphanesi kurulu DEĞİL
  - Mevcut UI: "Publish Now" + "Refresh Jobs" butonları + jobs table (state, attempts, run_at, last_error)
  - API: GET /scheduling/jobs/:workspaceId → job listesi (id, state, attempt_count, run_at, last_error_code)
  - POST /scheduling/schedule body'sinde runAt alanı var (ISO tarih)

GERÇEK EKSİK: Görsel takvim. Kullanıcı hangi gün/saatte ne planlandığını göremez.

Yapılacaklar:

1. Hafif takvim bileşeni seçimi ve kurulumu:
   - ÖNERİ: Kendi takvim grid'ini yaz (bağımlılık eklemeden)
   - VEYA: pnpm add date-fns (tarih işlemleri) — react-calendar gibi heavy lib'e gerek yok
   - Tailwind ile grid-based aylık/haftalık görünüm

2. Yeni bileşen: SchedulerCalendar
   - apps/web/components/studio/views/scheduler-calendar.tsx

   Props:
     - jobs: Array<{ id, state, run_at, content_title? }>
     - onSlotClick: (date: Date) => void (yeni schedule oluşturma)

   Görünüm modları:
     a. Haftalık (varsayılan): 7 gün x 24 saat grid
        - Her slot: saatlik blok
        - Planlanmış job'lar renkli chip olarak göster (state'e göre renk)
        - Yeşil: completed, Mavi: queued, Sarı: in_progress, Kırmızı: failed
     b. Aylık: 30 gün grid
        - Her güne düşen job sayısı badge olarak göster

3. scheduler-view.tsx güncelle:
   - Toggle: Liste / Takvim görünümü
   - Varsayılan: Takvim (haftalık)
   - Liste görünümü mevcut tablo olarak kalsın

4. API endpoint'e ek alan gerekebilir:
   - GET /scheduling/jobs/:workspaceId response'una content title ekle
   - Mevcut: id, state, attempt_count, run_at, last_error_code
   - Ekle: content_title (JOIN contents ON publish_jobs.content_id = contents.id)
   - Bu değişiklik scheduling.service.ts'te listJobs() fonksiyonunda yapılır

5. Slot click → schedule modal:
   - Tıklanan slot'un tarih/saatini pre-fill et
   - Mevcut "Publish Now" / "Schedule" formunu modal olarak göster

Kısıtlar:
- Ağır kütüphane ekleme (react-big-calendar, fullcalendar → overkill)
- date-fns yeterli (lightweight tarih işlemleri)
- Mevcut scheduler-view.tsx'in API call pattern'ini koru (useStudioController)
- Her bileşen max 80 satır (ESLint kuralı)
- Tailwind ile stil ver — yeni CSS dosyası oluşturma

Doğrulama:
  pnpm --filter @growth-os/web build
  pnpm lint -- apps/web/components/studio/views/scheduler-view.tsx
  pnpm lint -- apps/web/components/studio/views/scheduler-calendar.tsx
```

---

## 5. First-Hour Alert — Bildirim Delivery (Webhook/Email)

```
Proje: NestJS 11 API + BullMQ Worker
Durum: First-hour alert LOGIC zaten var (analytics.service.ts satır 107-172).
  - ok/watch/critical seviye hesaplama tamam
  - Threshold'lar env ile konfigüre edilebilir
  - GET /analytics/content/:workspaceId/:contentId/first-hour-alert endpoint'i var
  - AMA: Sadece pasif — kullanıcı endpoint'i çağırırsa gösterir

GERÇEK EKSİK: Proaktif bildirim. Post yayınlandıktan 60 dakika sonra otomatik alert.

Mevcut metrics pipeline:
  - Worker'da processMetricsJob(): t15/t60/t24 window'larında metrik toplar
  - storeMetricsSnapshot() (worker/main.ts satır 127-175): snapshot'ı DB'ye yazar
  - t60 snapshot kaydedildikten SONRA alert tetiklenmeli

Mevcut email altyapısı:
  - Nodemailer (apps/api/src/modules/auth/better-auth.ts satır 156-211)
  - SMTP config mevcut (magic link için kullanılıyor)
  - Ama email gönderimi auth modülüne sıkı bağlı — ayrı email service yok

Yapılacaklar:

1. Shared email service oluştur:
   - apps/api/src/shared/email/email.service.ts
   - Nodemailer transport'unu auth'tan çıkar, shared yap
   - sendEmail(to, subject, htmlBody) → Promise<void>
   - Mevcut auth magic link email'ini bu service'i kullanacak şekilde refactor et

2. Alert evaluation + delivery fonksiyonu (worker/main.ts veya ayrı dosya):

   async function evaluateAndDeliverFirstHourAlert(params: {
     workspaceId: string;
     publishedPostId: string;
     windowKey: "t60";
   }) {
     // 1. DB'den snapshot al
     // 2. Threshold'lara göre level hesapla (analytics.service.ts'teki logic'i çağır veya duplicate et)
     // 3. Level "critical" veya "watch" ise → bildirim gönder
     // 4. Bildirim kanalları:
     //    a. Email (workspace owner'ın email'ine)
     //    b. Opsiyonel: webhook URL (workspace ayarlarında tanımlıysa)
     // 5. notification_log tablosuna kaydet (idempotency — aynı alert 2 kez gönderilmesin)
   }

3. Worker'da t60 snapshot sonrası tetikle:
   - storeMetricsSnapshot() fonksiyonunda, windowKey === "t60" ise:
   - evaluateAndDeliverFirstHourAlert() çağır
   - Veya ayrı bir BullMQ job olarak queue'ya ekle (tercih: ayrı job — daha temiz)

4. notification_log tablosu (yeni migration):
   - packages/db/migrations/010_notification_log.sql (veya sonraki numara):
     CREATE TABLE notification_log (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       workspace_id UUID NOT NULL,
       notification_type TEXT NOT NULL,  -- 'first_hour_alert'
       reference_id UUID NOT NULL,       -- published_post_id
       channel TEXT NOT NULL,            -- 'email' | 'webhook'
       level TEXT NOT NULL,              -- 'watch' | 'critical'
       delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       CONSTRAINT uq_notification_reference_channel UNIQUE (reference_id, channel, notification_type)
     );
   - UNIQUE constraint: aynı post + kanal + tip = tek bildirim

5. Email template:
   - Subject: "⚠️ First-Hour Alert: [Post Title] — [WATCH/CRITICAL]"
   - Body: impressions, engagement rate, threshold karşılaştırması, link to analytics

Kısıtlar:
- Mevcut analytics.service.ts'teki threshold logic'i çoğaltma — import et veya shared function yap
- Email gönderimi async olmalı, metric storage'ı bloklamamsalı
- Webhook URL opsiyonel — yoksa sadece email
- Worker'da email göndermek için SMTP config gerekir (env'den oku)

Doğrulama:
  pnpm --filter @growth-os/api build && pnpm --filter @growth-os/worker build
  pnpm --filter @growth-os/api test:unit && pnpm --filter @growth-os/worker test
  pnpm db:migrate  (yeni migration)
```

---

## Çalıştırma Sırası

1. **#3** Recharts entegrasyonu — en bağımsız, UI-only, backend değişikliği yok
2. **#4** Takvim görünümü — UI-only, API'ye küçük ek (content_title)
3. **#2** LLM stil analizi — mevcut altyapıyı genişletme, yeni endpoint yok
4. **#5** First-hour alert delivery — yeni migration + email service + worker değişikliği
5. **#1** Token auto-refresh — en riskli, auth flow'a dokunuyor, dikkatli test gerekir
