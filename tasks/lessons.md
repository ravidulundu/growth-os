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
