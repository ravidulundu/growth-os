# Faz 1 — Discovery / Kapsam

## 1) PRD-lite (v0.1)

### Problem

X odaklı içerik üretiminde üç temel sorun var:

1. Üretim hızı ve stil tutarlılığı düşük (fikir var, publish gecikiyor).
2. İlk saat performansını hızlı okuyup iterasyon yapmak zor.
3. Dağınık akış (notlar, scheduler, analiz farklı araçlarda).

### Çözüm

Tek panelde çalışan bir **kişisel X Growth OS**:

- Stil odaklı içerik üretimi (tweet/thread/reply taslakları)
- Basit yayın planlama (queue + zamanlama)
- İlk saat odaklı analytics (publish sonrası 15/60/180 dk gözlem)
- Kütüphane (taslaklar, yayınlanan içerikler, iyi performans örnekleri)

### Hedef Sonuçlar

- **TTFV-1 (First Publish):** kullanıcı onboarding sonrası ilk içeriğini yayınlayabilmeli.
- **TTFV-2 (First Analytics):** ilk yayın için ilk saat metriğini görebilmeli.
- Kullanıcı 1 oturumda üretim -> yayın -> gözlem döngüsünü tamamlayabilmeli.

### MVP Scope

#### MVP-0 (Kişisel kullanım)

- Tek kullanıcı, tek X hesap
- OAuth ile hesap bağlama
- Generator: tweet/thread taslağı üretme
- Scheduler: tekil zamanlama + manuel publish
- Analytics: ilk saat metrik özeti (minimum set)
- Dashboard: bugün yayınlananlar + ilk saat snapshot
- Library: taslak/yayınlanan içerik listesi ve etiketleme

#### MVP-1 (Ürünleşmeye hazır çekirdek)

- Çoklu workspace/tenant iskeleti
- Temel ekip rolleri (owner/editor/viewer)
- Hesap bazlı izolasyon ve erişim kontrolü
- Kullanım ölçümü (API kullanım, feature kullanım)
- Plan/kredi katmanına uygun sayaç altyapısı (faturalama değil, ölçüm)
- Güvenlik/logging/audit izi temel seti

### Out of Scope (Faz 1 ve MVP dışı)

- Full autopilot otomasyon (agresif auto-reply, auto-DM, toplu etkileşim)
- Geniş tarihsel BI/raporlama (7-30-90 gün derin analiz, cohort, attribution)
- Gelişmiş fiyatlandırma/ödeme entegrasyonu
- Gelişmiş A/B orkestrasyon motoru
- Çoklu sosyal kanal (LinkedIn, Instagram vb.)

---

## 2) Hedef Kullanıcı Akışları + TTFV KPI

### Akış A — İlk Yayın (TTFV-1)

1. Kullanıcı kayıt olur / giriş yapar.
2. X hesabını bağlar (OAuth).
3. Generator’da konu + format seçer.
4. Taslağı düzenler ve publish eder (hemen veya planlı).

**KPI:**

- `TTFV-1 median <= 20 dk`
- `TTFV-1 p90 <= 45 dk`
- `Activation rate (ilk 24 saatte en az 1 publish) >= %60`

### Akış B — İlk Analytics Görme (TTFV-2)

1. Publish edilen içerik Analytics ekranına düşer.
2. İlk saat penceresinde temel metrikler görünür.
3. Kullanıcı bir aksiyon alır (ör. varyant üret, yeniden planla, not al).

**KPI:**

- `TTFV-2 median <= 90 dk` (publish sonrası)
- `First-hour analytics view rate >= %70`
- `Insight-to-action rate >= %30` (analytics gördükten sonra yeni taslak/iyileştirme)

### Akış C — Döngü Tamamlama

Üret -> Yayınla -> İlk saat gözle -> Yeni varyant üret.

**KPI:**

- `Loop completion (aynı gün 2. içerik üretimi) >= %35`

---

## 3) User Story + Acceptance Criteria

## MVP-0 (Kişisel)

### US-0.1 Hesap Bağlama

**Story:** Kullanıcı olarak X hesabımı güvenli şekilde bağlamak istiyorum.

**Acceptance Criteria:**

- OAuth akışı başarıyla tamamlanırsa hesap “Connected” görünür.
- Token/secret plaintext tutulmaz; şifreli saklanır.
- Bağlantı koparsa kullanıcıya yeniden bağlama çağrısı gösterilir.

### US-0.2 İçerik Üretme

**Story:** Kendi stilime yakın tweet/thread taslağı üretmek istiyorum.

**Acceptance Criteria:**

- En az 3 içerik tipi seçilebilir: tweet, thread(3), reply.
- Her üretimde kullanıcı prompt girdisi ve üretilen çıktı kaydedilir.
- Kullanıcı düzenleyip kütüphaneye kaydedebilir.

### US-0.3 Yayınlama/Planlama

**Story:** İçeriği hemen yayınlayabilmek veya ileri tarihe planlayabilmek istiyorum.

**Acceptance Criteria:**

- “Publish now” ve “Schedule” seçenekleri çalışır.
- Planlanan içerik doğru saatte tek sefer gönderilir.
- Başarısız gönderimlerde retry ve hata mesajı görünür.

### US-0.4 İlk Saat Analytics

**Story:** Yayın sonrası ilk saat performansını görmek istiyorum.

**Acceptance Criteria:**

- Minimum metrik seti: impressions, likes, replies, reposts.
- 15/60/180 dk snapshot görünür.
- Veri çekilemezse “stale/failed” durumu açıkça işaretlenir.

### US-0.5 Kütüphane

**Story:** Taslaklarımı ve yayınlanan içeriklerimi tek listede yönetmek istiyorum.

**Acceptance Criteria:**

- Filtreleme: status (draft/scheduled/published), tarih, etiket.
- İçerik detayı açılıp düzenlenebilir.
- Silme işlemi soft-delete olarak loglanır.

## MVP-1 (Ürünleşmeye hazır çekirdek)

### US-1.1 Workspace ve Rol Yönetimi

**Story:** Birden fazla ekip üyesiyle güvenli çalışma alanı yönetmek istiyorum.

**Acceptance Criteria:**

- Owner/editor/viewer rolleri uygulanır.
- Her rolün ekran ve aksiyon yetkisi sınanır.
- Workspace dışı verilere erişim engellenir.

### US-1.2 Çoklu Hesap Altyapısı

**Story:** Workspace içinde birden fazla X hesabını izole şekilde yönetmek istiyorum.

**Acceptance Criteria:**

- Hesaplar workspace bazında izole edilir.
- Her içerik kaydı bir `account_id` ile zorunlu eşleşir.
- Yanlış hesaptan publish engellenir (preflight kontrol).

### US-1.3 Kullanım Ölçümü

**Story:** API ve özellik kullanımını plan/kredi modeline hazır şekilde izlemek istiyorum.

**Acceptance Criteria:**

- Endpoint bazlı istek sayacı tutulur.
- Hata/429 oranı günlük raporlanır.
- Kullanıcı bazlı aylık kullanım özeti üretilebilir.

### US-1.4 Audit & Güvenlik İzleri

**Story:** Kritik işlemler için denetlenebilir bir iz bırakmak istiyorum.

**Acceptance Criteria:**

- Login, token refresh, publish, role değişimi audit log’a yazılır.
- Log kayıtlarında PII minimize edilir.
- En az 90 gün audit saklama uygulanır.

---

## 4) Veri Gereksinimleri ve Retention

| Veri Türü               | Amaç                       | Minimum Alanlar                                            | Retention                            |
| ----------------------- | -------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| Kullanıcı Profili       | Kimlik, yetki, deneyim     | user_id, email(hash), role, created_at                     | Hesap aktif olduğu sürece + 30 gün   |
| OAuth Token Metadata    | X erişimi                  | account_id, token_encrypted, scopes, expires_at            | Aktif + 30 gün, revoke sonrası 7 gün |
| İçerik Kayıtları        | Üretim ve yayın geçmişi    | content_id, type, prompt, draft, published_post_id, status | 24 ay                                |
| Scheduler Job           | Güvenilir planlama         | job_id, account_id, run_at, retry_count, state             | 180 gün                              |
| Analytics Snapshot      | İlk saat öğrenme döngüsü   | post_id, t15/t60/t180 metrics, fetched_at                  | 12 ay (ham), 24 ay (aggregate)       |
| Audit Log               | Güvenlik ve izlenebilirlik | actor_id, action, entity, result, ip_hash, ts              | 12 ay (min), öneri 24 ay             |
| Hata ve Performans Logu | Operasyonel stabilite      | req_id, endpoint, status, latency, error_code              | 90 gün                               |

**Notlar:**

- PII minimizasyonu zorunlu: e-posta ve IP verileri hash/pseudonymized tutulmalı.
- “Silme talebi” geldiğinde kullanıcıya ait içerik ve profil verileri SLA içinde silinmeli.

---

## 5) X API Entegrasyonu: Kapsam / Sınırlar

### Kapsama Dahil

- OAuth tabanlı kullanıcı yetkilendirmesi
- İçerik yayınlama endpoint’i
- Kullanıcı içerik zaman akışı çekimi (stil ve geçmiş içerik)
- Post bazlı engagement metrikleri (ilk saat odaklı)

### Kapsam Dışı (MVP)

- Toplu otomasyon (seri auto-reply, auto-DM)
- Politik açıdan riskli engagement manipülasyonları
- Geniş ölçekli historical full archive çekimleri

### Teknik Sınırlar (Erken Tasarım Kuralları)

- Endpoint bazlı rate limit kabulü: tüm istemci çağrıları için throttling zorunlu.
- 429 yönetimi: exponential backoff + jitter + idempotent retry.
- Günlük/aylık kullanım bütçesi: pay-per-usage için hard cap + alarm.
- Scope minimizasyonu: sadece gereken izinler (least privilege).
- Uyum önceliği: otomasyon davranışı policy-safe sınırda kalır, manuel onaylı akış tercih edilir.

### Operasyonel Guardrail’ler

- `RateLimitGuard`: account + endpoint seviyesinde kota kontrolü
- `CostGuard`: günlük kredi tüketimi eşik alarmı (%70/%90/%100)
- `PolicyGuard`: otomatik aksiyonları whitelist akışlarla sınırla
- `Fallback`: API erişimi bozulursa manual export/schedule kuyruğu bozulmadan bekletilir

---

## 6) Risk Register (v0.1)

| ID   | Risk                                 | Olasılık | Etki       | Erken Sinyal                             | Mitigasyon                                               | Sahip         |
| ---- | ------------------------------------ | -------- | ---------- | ---------------------------------------- | -------------------------------------------------------- | ------------- |
| R-01 | X API rate limit aşımı               | Orta     | Yüksek     | 429 oranı > %2                           | throttling, queue, backoff, cache                        | Backend       |
| R-02 | Pay-per-usage maliyet sapması        | Orta     | Yüksek     | günlük bütçe > %70                       | endpoint bütçesi, hard cap, alarm                        | Product + Eng |
| R-03 | Policy/uyum ihlali (aşırı otomasyon) | Orta     | Çok Yüksek | aksiyon blokları / uyarılar              | manual-on-top, otomasyon kısıtı, policy review checklist | Product       |
| R-04 | Token güvenliği zafiyeti             | Düşük    | Çok Yüksek | şüpheli erişim logları                   | encryption at rest, key rotation, audit                  | Security      |
| R-05 | Analytics kapsamının şişmesi         | Yüksek   | Orta       | backlog’da sürekli yeni metrik talepleri | first-hour KPI freeze, phase-gate                        | PM            |
| R-06 | Veri saklama/mahremiyet uyumsuzluğu  | Düşük    | Yüksek     | silme taleplerinde gecikme               | retention policy + deletion workflow                     | Backend       |
| R-07 | Tek kişiye bağımlı geliştirme riski  | Orta     | Orta       | kritik bilgi tek kişide                  | runbook + karar kayıtları                                | Founder       |

---

## 7) Gün 1 Milestone Planı

### Gün 1 Hedefleri

- Scope lock: MVP-0 ve MVP-1 sınırları onaylanır.
- User story + acceptance criteria kilitlenir.
- Basit wireframe seti tamamlanır:
  - Dashboard
  - Generator
  - Library
  - Scheduler
  - Analytics
  - Settings
- Risk ve bağımlılık listesi imzalanır.

### Gün 1 Çıkış Kriteri (Definition of Done)

- PRD-lite dokümanı takımca onaylı
- En az 10 kritik acceptance criteria test edilebilir yazılmış
- TTFV KPI’ları sayısal hedefe bağlanmış
- X API kapsam/sınır notu teknik backlog’a aktarılmış

---

## 8) Bağımlılıklar ve Kararlar

### Kritik Bağımlılıklar

- X Developer Portal erişimi
- App oluşturma ve gerekli scope’ların alınması
- Güvenli secret yönetimi altyapısı

### Şimdi Alınması Gereken Kararlar

1. MVP-0’da tek hesap zorunlu mu, yoksa “1 aktif + 1 read-only” toleransı var mı?
2. First-hour analytics için minimum metrik seti kesinleştirilsin mi (impressions/likes/replies/reposts)?
3. Otomasyon sınırı: MVP-0’da yalnızca manuel onaylı publish mi?

---

## 9) Basit Wireframe (Low-fi, metinsel)

### Dashboard

```
[Top Nav: Workspace | Account | Settings]
[KPI Cards: Today Posts | First-hour Avg Impr | Engagement Rate]
[List: Scheduled Next 24h]
[Panel: Last Published -> 15/60/180 snapshot]
[CTA: New Draft]
```

### Generator

```
[Input: Topic]
[Select: Format (Tweet / Thread / Reply)]
[Toggle: Style Profile On/Off]
[Button: Generate]
[Editor: Draft Text]
[Actions: Save Draft | Schedule | Publish Now]
```

### Library

```
[Filters: Status | Tag | Date]
[Table/List: Drafts + Published]
[Item Detail Drawer: Content | Version | Linked Metrics]
[Actions: Duplicate | Edit | Archive]
```

### Scheduler

```
[Calendar/Timeline]
[Queue List: Pending Jobs]
[Item: Content Preview + Run At + Account]
[Actions: Reschedule | Cancel | Publish Now]
```

### Analytics

```
[Post Selector]
[First-hour Cards: T+15 / T+60 / T+180]
[Mini Trend: Impressions / Likes / Replies / Reposts]
[Insight Box: What changed?]
[Action: Generate Variant]
```

### Settings

```
[Account Connection: X OAuth status]
[Security: Token health + last refresh]
[Usage: API calls + budget status]
[Retention: Data policy summary]
```
