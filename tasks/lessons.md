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
- `pnpm lint -- <path>` repo scriptinde tüm ağacı lint ediyorsa hedef dosya doğrulamasını `pnpm exec eslint <path>` ile ayrıca çalıştır; değişiklik etkisini baseline lint borcundan net ayır.
- Büyük React hook refactorlarında önce return key sözleşmesini çıkar; alt hook’ları concern bazında bölüp ana hook’ta sadece composition+spread yaparak API regressionsuz satır/complexity düşür.
- Guard gibi yüksek-complexity auth akışlarında DB lookup tekrarlarını query-map + generic resolver ile merkezileştir; canActivate içinde sadece orchestration bırakmak hem complexity hem regression riskini birlikte düşürür.
- Uzun service method refactorlarında DB transaction, queue enqueue ve recovery path’lerini ayrı helper’lara böl; `schedule` gibi public methodlar orchestration-only kaldığında complexity düşerken davranış sabit kalır.
- Error mapping refactorlarında status normalize + message resolve + exception factory adımlarını ayrı helper’lara böl; mapping object lookup ile özel-case davranışını korurken fonksiyon complexity’si hızla düşer.
- Better Auth init refactorlarında env ve plugin çözümlemelerini helper’lara ayırırken dynamic import, `getPool()` ve cookie/trusted-origin kararlarını ana compose akışında aynı sırada bırak; bu sıra auth boot davranışını etkileyebilir.
- Helper extraction sırasında lint `max-params` sınırını baştan hesaba kat; parametreleri context object’e toplayarak ikinci tur düzeltme ihtiyacını azalt.
- Constructor complexity düşürürken `??`/fallback zincirlerini tek fonksiyonda toplama; alan-bazlı resolver helper’lara bölerek hem complexity limitini koru hem fallback sırasını davranış değişmeden görünür tut.
- Parametre-refactor (options object) işlerinde önce call-site grep ile kapsamı sabitle, sonra signature ve çağrıları aynı committe birlikte taşı; yarım geçiş typecheck kırılmalarını azaltır.
- Büyük UI component refactorlarında önce section sınırlarını çıkar, sonra her section’ı local alt bileşene taşı; ana componenti yalnız composition bırakmak max-lines ve complexity hedefini en düşük riskle tutturur.
- DB seed doğrulamalarında lint zinciri baseline’a takılsa da hedef dosya için `pnpm exec eslint <file>` ile lokal temizlik doğrulanmalı; `db:seed` için ise DB erişimi (`DATABASE_URL`/port) hazır değilse `ECONNREFUSED` kaçınılmazdır.
- Altyapı düzeltmesi yapıldıktan sonra varsayım yapma; container health + port listen + hedef komutu aynı turda tekrar çalıştırıp sonucu kesinleştir.
- Router complexity düşürmede route koşullarını tek callback’te tutma; handler map + `dispatchRoute` modeli ana callback’i stabilize eder ve route başına complexity kontrolünü kolaylaştırır.
- Uzun test callback refactorlarında en düşük riskli yol: tek test senaryosunu bozmadan fixture kurulumunu ve assertion bloklarını küçük helper’lara ayırmak; bu yöntem davranışı koruyup max-lines ihlalini temizler.
- Kullanıcı AGENTS’deki alt-ajan çağırma kuralını hatırlattığında, sonraki görevde agent kullanım kararını açıkça bu maddeye referanslayarak uygula (tek ajan=tek görev, keşif/paralel analiz delegasyonu).
- NestJS + Fastify rate limit entegrasyonunda global throttler guard için tracker çözümlemesini `x-forwarded-for` -> `req.ip` -> `req.raw.socket.remoteAddress` sırasıyla merkezileştir; aksi halde reverse-proxy arkasında limit anahtarı tutarsız olur.
- Migration checksum korumasında legacy satırlar `NULL checksum` taşıyacağı için hard-fail yerine warning+continue yap; aksi halde yeni koruma canlı ortamda ilk çalıştırmada kesinti yaratır.
- Eşik bazlı konfig kararlarında (ör. `noUncheckedIndexedAccess`) sabit varsayım yapma; kullanıcı eşik değerini güncellediyse aynı turda yeniden ölçüp final kararı o eşiğe göre ver.
- Root `pnpm install` non-interactive ortamda `node_modules` yeniden oluşturma prompt’una düşebilir; doğrulamayı deterministik yapmak için gerektiğinde `pnpm install --force` ile tekrar koş.
- Biçimlendirme doğrulamasında (`pnpm format:check`) yeni eklenen kural dosyasını suçlamadan önce baseline listesini ayrıştır; fail mesajında yeni değişiklik etkisi ile mevcut repo borcunu net ayır.
- `Pool.connect` gibi overload içeren fonksiyonlarda `Awaited<ReturnType<...>>` tip türetimi `void`’a düşebilir; transaction helper parametrelerinde doğrudan `PoolClient` kullan.
- `noUncheckedIndexedAccess` açık repo’larda test fixture insert’lerinde `rows[0]` ve `array[0]` erişimini her zaman `assert.ok` guard’ı ile normalize et; aksi halde geniş kapsamlı TS2532 dalgası üretir.
- `max-lines-per-function` test callback’lerinde sınırı aştığında davranışı bozmadan çözüm: uzun mock setup ve assertion akışını bağımsız helper fonksiyonlara taşıyıp test gövdesini compose katmanı olarak bırak.
- Worker token auto-refresh eklerken iki ayrı bağlamı ayır: publish öncesi açık transaction içinde `FOR UPDATE` ile refresh et, publish sırasında alınan `AUTH_FAILED` sonrası ise yeni transaction açıp refresh+tek retry uygula; nested transaction ve race riskini birlikte azaltır.
- Worker `main.ts` gibi yoğun dosyalarda patch sonrası hedef lint çalıştırmasını (`pnpm exec eslint <dosya>`) hemen koştur; özellikle complexity kuralı helper extraction sonrası tekrar yükseliyorsa aynı turda düzelt.
- LLM enrichment eklerken maliyet kontrolü için “ilk kez veya force refresh” kapısı zorunlu olmalı; aksi halde her extract çağrısında ücretli model çağrısı yapılır ve profile kalitesi/maliyet dengesi bozulur.
- Recharts entegrasyonunda TS tipleri için `JSX.Element` ve `Tooltip formatter` imzalarına dikkat et; `ReactNode` ve varsayılan `Tooltip` kullanımı Next build aşamasındaki tip kırılmalarını hızlıca önler.
- Shared magic-link helpers should encapsulate SMTP delivery and the existing dev logging contract so auth flows keep behaving the same while other modules can reuse the service.
- Takvim/scheduler gibi yeni UI akışlarında backend response alanı (ör. `content_title`) da gerekiyorsa aynı turda service query + web `JobRow` type + hook tüketimini birlikte güncelle; aksi halde UI hızlıca “data shape drift” hatasına düşer.
- Worker metrics sonrası bildirim eklerken alert teslimatını mutlaka non-blocking (`void ...catch`) tetikle; snapshot persistence yolunu hiçbir harici kanal (SMTP/webhook) bekletmemeli.
- Frontend teslimlerinde işlevsel olmak yetmez; Studio gibi yüzeyi yüksek ürünlerde tema/typography/motion/shell bütünlüğünü ilk turdan güçlü kur, aksi halde kullanıcı güveni hızla düşer.
- Route görevlerinde kök sayfayı landing’e çevirirken korunan uygulama yüzeyini mutlaka yeni path’e (`/studio`) taşı ve login callback/redirect hedeflerini aynı turda hizala; aksi halde kullanıcı boş/yanlış ekrana düşer.
- Auth debug’da aynı endpoint için “process down” ve “uygulama içi 500” nedenlerini ayrı doğrula; önce port erişimini (`curl /health`) doğrulamadan kod refactor’a atlama.
- Magic-link akışında dev/test ortamında SMTP fail’i kullanıcı akışını kırmamalı; kontrollü fallback (warn + dev link log) ile 500 yerine başarılı response korunmalı.
- “Eskiden çalışıyordu” regresyonlarında doğrudan `git log -p` ile akışı etkileyen dosyalarda (controller/service/.env.example) commit seviyesinde RCA çıkar; varsayımla değil commit ID + diff ile konuş.
- Kullanıcı “bug commitlenmedi” dediğinde `git diff HEAD -- <paths>` + `git show HEAD:<file>` kontrolünü birlikte yap; “exists on disk, not in HEAD” bulgusu uncommitted kırılmanın doğrudan kanıtıdır.
- “Server ayakta” demeden önce sadece process listesi değil canlı endpoint doğrulaması ver (`curl /health`, `curl web-root`) ve kullanılan portları mutlak belirt; aksi halde yanlış pozitif rapor çıkar.
- Next.js hydration mismatch’te `<html>`/`<body>` attribute farkı ve extension imzası (ör. `trancy-tr`) görülüyorsa önce extension kaynaklı DOM mutasyonunu kabul et; `suppressHydrationWarning` ile root seviyede kontrollü guard uygula.
- `quality:gate` fail’inde önce formatı temizleyip hemen tam lint listesini al; component refactorlarını alt bileşenlere bölmeden sadece küçük editlerle zorlamak zaman kaybettirir.
- Next.js `/api/*` 500’lerinde her zaman önce backend health’i doğrula; API down ise hata uygulama mantığından değil web rewrite/proxy katmanından gelir.
- Runtime komutu verirken kullanıcıda `pnpm` PATH olmayabileceğini varsay; uzun loop komutlarını `corepack pnpm ...` formunda vererek `command not found` döngüsünü engelle.
- Worker testlerinde `src/main.ts` importu top-level BullMQ/PG handle açıyorsa testler bitince süreç kapanmayabilir; test için explicit `closeWorkerRuntimeResourcesForTests()` helper export edip `after()` içinde kapat.

## 2026-02-24

- `EADDRINUSE` döngülerinde önce port sahipliğini (`ss -ltnp | rg :PORT`) doğrula, sonra stale `next/pnpm` süreçlerini temizleyip tek süreçle yeniden başlat.
- Web/API zinciri olan 500 hatalarında web proxy endpoint’i yerine doğrudan API endpoint’ini (`:4000`) de test ederek uygulama hatası ile bağlantı hatasını kesin ayır.
- Alt-ajan çıktısı alınca API/Web kontratını hemen çapraz doğrula; bu turdaki `priceId` vs `planKey` sapması gibi uyuşmazlıklar testten önce yakalanmalı.
- Stripe webhook signature doğrulaması ekleniyorsa Nest bootstrap’ta `rawBody` açık değilse doğrulama sahada kırılır; endpoint kodundan önce transport ayarını garantile.
- `strict-peer-dependencies=true` olan repolarda install bloklarını tek seferlik CLI override (`--strict-peer-dependencies=false`) ile aç; kalıcı politika dosyasını değiştirme.
- `max-lines-per-function` test callback’lerinde hızlı çözüm: setup/assertion bloklarını named helper’lara ayırıp ana `test(...)` gövdesini orkestrasyon olarak bırak.
- Playwright `reuseExistingServer` açıkken e2e sonuçları yerel açık dev server env’ine bağımlı olur; varsayılanı kapatıp yalnız opt-in (`PLAYWRIGHT_REUSE_EXISTING_SERVER=1`) ile açmak deterministik çalışır.
- Next.js e2e webServer komutunda `next dev` aynı repo içinde ikinci kez kalkarsa `.next/dev/lock` çakışır; stabil çözüm `pnpm build && pnpm start` zinciridir.
- Root route davranışı landing’e çevrildiğinde auth e2e’lerde `/`→`/login` varsayımını hemen güncelle; aksi halde gerçek auth kırığıyla UX değişikliğini birbirine karıştırırsın.
- Kullanıcının ortamında çalıştırılabilir bir adım varsa not olarak bırakma; komutu doğrudan çalıştırıp sonucu paylaş.
- Kod değişikliği yaptığım her turda final yanıtından önce en az hedefli lint + typecheck çalıştır ve çıktıyı açıkça raporla.
- Kullanıcı “codebase’de kontrol et” dediğinde doğrulamayı root komutlarla (`pnpm lint`, `pnpm typecheck`) tüm monorepo için çalıştır.
- Her kod değişikliğinden sonra en azından hedefli format (`pnpm format` veya ilgili dosya formatı) + lint + typecheck adımlarını tamamlamadan işi bitmiş sayma.
- Sentry `beforeSend` callback tipleri paketlere göre `ErrorEvent` beklentisine kayabilir; sanitize fonksiyonunu generic (`<TEvent extends Event>`) tutarak typecheck kırılmasını önle.
- Telemetry entegrasyonunda free-tier güvenliği yalnız sampling ile bırakma; günlük event cap’i de kod içinde (env configurable) enforce et.
- `max-lines-per-function` ihlali tek dosyada görünse bile root `pnpm lint` tüm monorepo’yu tarar; feature turunda çıkan diğer yeni fonksiyon ihlallerini de aynı turda kapatmadan işi bitmiş sayma.
- `noUncheckedIndexedAccess` açıkken `Record<string, number>` erişimleri `undefined` dönebilir; fallback için obje içinden tekrar okumak yerine ayrı sabit default değeri kullan.
- Scheduling/manual fallback gibi opsiyonel email akışlarında SMTP yoksa endpoint’i fail ettirme; rezervasyonu geri alıp `reminderSkipped` ile graceful degrade et.
- Yeni tablo kullanan integration test eklendiğinde `pnpm db:migrate` adımını aynı turda doğrulama zincirine koy; aksi halde test koşumu relation-not-found ile sahte negatif üretir.
- Global retention/lifecycle işlerinde tek büyük cross-workspace query yerine workspace-bazlı cleanup döngüsü kullan; bu yaklaşım hem workspace isolation’ı net garanti eder hem de `audit_logs.workspace_id` zorunluluğunu doğal şekilde karşılar.
