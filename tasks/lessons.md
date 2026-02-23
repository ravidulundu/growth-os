# Lessons

## 2026-02-22

- Coverage sonucu paylaşırken kapsamı her zaman açıkça belirt: tek dosya mı, modül mü, proje geneli mi.
- "Genişleteceğiz" deniyorsa aynı turda script ve kapsamı gerçekten genişletmeden işi bitmiş sayma.
- Kalite kapısında görünen metrik ile gerçek kapsamın tutarlı olduğundan emin ol.
- AGENTS akışına göre `tasks/todo.md` ve `tasks/lessons.md` güncellemesini işin sonunda değil, adım tamamlandığı anda yap.
- Kullanıcı "sonuç" istediğinde sadece "geçti" demek yerine komut + metrik + kapsam bilgisini birlikte ver.
- Root script adı (`coverage:api`) kullanıcı beklentisinde API genelini temsil eder; tek dosya ölçümü bu script altında bırakılmamalı.
- Coverage hedefi yüksekse ilk adımda baseline ölçüm al, sonra modül öncelik sırasını çıkarıp testleri bu sırayla yaz (analytics/style/generation/scheduling/auth guard).
- Kullanıcı AGENTS uyumu uyardığında implementasyona geçmeden önce mutlaka plan+check-in yap ve bunu açıkça göster.
- Kullanıcı “dokümanı değiştirme, eksiği implemente et” dediyse test/rapor odaklı yan görevlere sapmadan doğrudan ürün açığını kapat.
- Kullanıcı açıkça istemedikçe `gh` ile PR thread/review kontrolü başlatma; sadece istenen implementasyon + test doğrulamasına odaklan.
- Aynı oturumda zaten bilinen kod için tekrar tekrar keşif/analiz komutu çalıştırma; kullanıcı soru sorduğunda doğrudan net durum ve aksiyon ver.
- PR review fix talebinde yalnız kod düzeltmek yetmez: aynı turda thread reply + resolve adımını da bitirip commit hook bloklarını kaldır.
- `--no-verify` sadece acil ve açık kullanıcı onayıyla kullanılmalı; standart akışta quality gate’i gerçekten geçirip push yapmak zorunlu.
- CI fail analizi yaparken local unstaged dosyaların etkisi ile remote commit durumunu karıştırma; PR check loguna göre kök nedeni net ayır.
- Next.js tarafında `apps/web/next-env.d.ts` otomatik değiştiğinde repo politikası gereği commit/push kapsamına dahil et; dangling local değişiklik bırakma.
- Review thread kapanışı istenirken sadece kodu düzeltmek yetmez; aynı turda her thread için birebir reply + resolve yapıp `pr:review-check` çıktısını sıfırlamadan işi bitmiş sayma.
- Programmatic auth verify endpointlerinde `Accept` header tek başına güvenilir sinyal değildir; fetch vs navigation ayrımı için `Sec-Fetch-*` başlıklarını birlikte kontrol et.
- Maliyetli dış API çağrısı olan akışlarda (LLM vb.) limit/uygunluk precheck’i çağrıdan önce koy; nihai limit kontrolünü transaction içinde ikinci kez koruyarak race riskini yönet.
- Review thread güvenlik yorumlarında yalnız davranış fix’i yetmez; env parse (`Number(...)`) gibi config güvenliği için finite/range doğrulaması ekle.
- CI branch koşullarında staging/prod ayrımını workflow `if` bloklarında açık ve tekil tut; yanlış branch eşleşmesi sessizce yanlış deploy zinciri başlatabilir.
- `publishNow` gibi "hemen çalıştır" uçlarında zaman-damgası bazlı dedupe varsayılanı çift tıklamayı engellemez; implicit dedupe için sabit/bucket anahtar üret.
- E2E mock katmanında cookie adı/shape prod ile farklıysa auth regresyonları kaçabilir; mock kontratını prod cookie adıyla birebir tut.

## 2026-02-23

- Kritik review fixlerinde “mock stub” davranışı runtime’da kalıyorsa fonksiyon bazlı patch yetmez; mode-aware client abstraction’a taşı ve çağrı noktalarını tamamen oraya bağla.
- Sessiz `catch {}` blokları görünürlüğü öldürür; rollback/fallback path’lerinde en azından `warn` log zorunlu olmalı.
- DI default bypass (`new Service()` fallback) kaldırıldığında manuel instantiate eden testleri aynı turda güncellemeden işi bitmiş sayma.
- Dış API JSON parse hatalarını `undefined` ile yutmak veri kaybı yaratır; parse hatasını explicit domain error’a map et.
- “fix tamam” demeden önce tek komutta `quality:gate:push` çalıştırıp format/lint/typecheck/unit/integration/e2e/build zincirini birlikte doğrula.
