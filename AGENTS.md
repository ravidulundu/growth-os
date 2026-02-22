## İş Akışı Orkestrasyonu

### 1. Plan Modu Varsayılanı

- Herhangi bir **önemsiz olmayan** iş için (3+ adım veya mimari karar) plan moduna gir
- Bir şey ters giderse, **DUR** ve hemen yeniden planla — zorlayıp devam etme
- Plan modunu sadece inşa için değil, **doğrulama adımları** için de kullan
- Belirsizliği azaltmak için en başta detaylı spesifikasyon yaz

### 2. Alt-Ajan Stratejisi

- Ana bağlam penceresini temiz tutmak için alt-ajanları bolca kullan
- Araştırma, keşif ve paralel analizi alt-ajanlara devret
- Karmaşık problemler için alt-ajanlarla daha fazla hesaplama gücü kullan
- Odak için: alt-ajan başına tek görev

### 3. Kendini Geliştirme Döngüsü

- Kullanıcıdan gelen HER düzeltmeden sonra: `tasks/lessons.md` dosyasını aynı desenle güncelle
- Aynı hatayı tekrar etmeyi engelleyen kuralları kendin için yaz
- Hata oranı düşene kadar bu dersleri acımasızca iyileştir
- Oturum başında ilgili projeler için dersleri gözden geçir

### 4. Bitirmeden Önce Doğrulama

- Çalıştığını kanıtlamadan hiçbir işi tamamlandı sayma
- Gerektiğinde ana sürüm ile değişikliklerin davranış farkını karşılaştır
- Kendine sor: "Bunu bir staff engineer onaylar mı?"
- Test çalıştır, logları kontrol et, doğruluğu göster

### 5. Zarafet Talep Et (Dengeli)

- Önemsiz olmayan değişikliklerde dur ve sor: "Daha zarif bir yolu var mı?"
- Bir düzeltme hacky geliyorsa: "Şu an bildiğim her şeyi bilerek, zarif çözümü uygula"
- Basit ve bariz düzeltmelerde bunu atla — over-engineering yapma
- Sunmadan önce kendi işini zorla/sorgula

### 6. Otonom Hata Düzeltme

- Bir bug raporu verildiyse: sadece düzelt. El tutma isteme
- Logları, hataları, fail olan testleri göster — sonra çöz
- Kullanıcıdan sıfır bağlam değiştirme bekle
- Nasıl yapılacağı söylenmeden failing CI testlerini gidip düzelt

## Test Disiplini (Prod Öncesi Güvence)

### 1. Testi Kodla Birlikte Yaz

- Yeni feature/PR: **unit test** (iş kuralı) aynı PR’da gelmeli
- Bug fix: **önce bug’ı yakalayan test**, sonra fix (regresyon kilidi)
- “Proje bitince test yazarız” yaklaşımını yasakla

### 2. Test Piramidi ve Katman Seçimi

- Çoğunluk **unit**, gerekli yerde **integration**, az sayıda **E2E**
- E2E’yi “her şeyi kapsayan” değil, **kritik kullanıcı akışları** için kullan
- Entegrasyon sınırları (DB/queue/cache/external) değiştiyse **integration test** zorunlu

### 3. Release Gate (Çıkış Şartları)

- CI’da: unit + integration **yeşil** olmadan merge/release yok
- Prod’a çıkmadan önce: **smoke E2E** (2–5 test) mutlaka koşmalı
- Kritik alanlar (auth/izin/ödeme): en az 1 **E2E** + ilgili **integration** test şart

### 4. Kapsam Kuralları

- Her kritik fonksiyon için: mutlu yol + en az 1 edge-case + 1 hata senaryosu
- Yetkilendirme olan yerde: “izinli/izinsiz” senaryoları ayrı test edilmeli
- Veri bütünlüğü: idempotency, tekrar deneme (retry), race condition riski varsa test ekle

### 5. Test Kalitesi Standartları

- Her test net assertion içermeli; “çalıştı mı” testleri kabul edilmez
- Flaky desenler yasak: `sleep`, gerçek zaman bağımlılığı, test sırası bağımlılığı
- Testler deterministik olmalı: random varsa seed’le, saat varsa fake clock kullan
- Mock’ları minimumda tut; **davranışı** değil **bağımlılığı** izole et

### 6. Test İzlenebilirliği

- Test isimleri “Given/When/Then” mantığında açık olmalı
- Her test bir davranışı doğrular; bir testte çok fazla senaryo birleştirme
- Riskli alanlar için test checklist’i `tasks/todo.md` içinde görünür tutulmalı

## Token Verimliliği

- Az önce yazdığın veya düzenlediğin dosyaları tekrar okuma. İçeriğini zaten biliyorsun.
- Sonuç belirsiz değilse "doğrulamak" için komutları tekrar çalıştırma.
- İstenmedikçe büyük kod bloklarını veya dosya içeriklerini geri ekrana basma.
- İlişkili düzenlemeleri tek operasyonda topla. 1 işlemle çözülecekken 5 edit yapma.
- "Devam edeceğim..." gibi onayları atla. Sadece yap.
- Bir iş 1 tool call gerektiriyorsa 3 tane kullanma. Harekete geçmeden önce planla.
- Sonuç belirsiz değilse veya ek input gerekmiyorsa az önce yaptığını özetleme.

## Görev Yönetimi

1. **Önce Plan**: `tasks/todo.md` dosyasına işaretlenebilir maddelerle plan yaz
2. **Planı Doğrula**: Implementasyona başlamadan önce check-in yap
3. **İlerlemeyi Takip Et**: Gittikçe maddeleri tamamlandı olarak işaretle
4. **Değişiklikleri Açıkla**: Her adımda üst seviye özet ver
5. **Sonuçları Dokümante Et**: `tasks/todo.md` içine review bölümü ekle
6. **Dersleri Yakala**: Düzeltmelerden sonra `tasks/lessons.md` güncelle

## Temel Prensipler

- **Önce Sadelik**: Her değişiklik mümkün olduğunca basit olsun. Minimum kod etkisi.
- **Tembellik Yok**: Kök nedeni bul. Geçici çözüm yok. Kıdemli geliştirici standardı.
- **Minimum Etki**: Değişiklikler sadece gerekli yerlere dokunsun. Bug sokmaktan kaçın.
