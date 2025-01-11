[![wakatime](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f.svg)](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f)
# Genshin music ve Sky music nightly'e Hoş geldiniz

Bu Repository Genshin ve Sky Cotl olmak üzere iki müzik uygulamasının kodlarını içerir, Bu bağlantıdan uygulamaları inceleyebilirsiniz: [specy.app](https://specy.app)

![Besteleyici](docs/assets/composer.webp)
![Oynatıcı](docs/assets/player.webp)


# Çevirilerle ilgili yardıma mı ihtiyacınız var?

Uygulamamı diğer dillere çevirme konusunda yardımcı olacak kişiler arıyorum, Eğer ilgileniyorsanız [Çeviri tartışmaları bölümüne bakın](https://github.com/Specy/genshin-music/discussions/52)



# Geliştirici modunda nasıl çalıştırılır?
Öncelikle bilgisayarınızda node.js kurulu olması gerekiyor, [buradan indirebilirsiniz](https://nodejs.org/en/),
Sonrasında bu Repository’i bilgisayarınıza indirin,
ve bağımlılıkları `npm i` komutu ile yükleyin. Bağımlılıklar yüklendikten sonra, geliştirme sunucusunu `npm run start` komutu ile çalıştırın.


Sizin için kullanışlı olabilecek 4 tane komut bulunmakta, belirli bir uygulama olarak çalıştır ve belirli bir uygulama olarak derle.

`npm run dev:sky` veya `npm run dev:genshin` komutları GenshinMusic veya SkyMusic için web uygulamalarını çalıştırır veya geçiş yapar



# Geliştirici modunda masaüstü uygulaması olarak nasıl çalıştırılır?
Öncelikle geliştirici sunucusunu başlatmanız gerekiyor, nasıl yapacağınızı [buradan](#how-to-run-in-dev-mode) öğrenin.
Sonrasında `npm run start-tauri` komutunu çalıştırın.


# Nasıl derlenir?
Hangisini derlemek istediğinize göre `npm run build:genshin` veya `npm run build:sky` komutunu kullanabilirsiniz, ikisini birden derlemek için `npm run build:all` komutunu kullanın.



# Masaüstü uygulaması olarak nasıl derlenir?

Çok fazla geliştirilmediği için masaüstü uygulamasını kullanmanızı pek tavsiye etmem, onu formalite icabı yaptım, masaüstü yerine web uygulamasını kullanın.

Uygulama masaüstü paketlemesi için tauri kullanıyor, bu da bir sanal web görüntüleyicisidir (sandboxed webview). `npm run build-tauri:genshin`, `npm run build-tauri:sky`, `npm run build-tauri:all` komutlarını kullanarak derleyebilirsiniz. Yapılandırma, değişiklik günlüğü için önceden yapılandırılmıştır; eğer bir imza anahtarınız yoksa, derleme başarısız olacaktır. Değişiklik günlüğü olmadan derlemek isterseniz, `src-tauri/tauri.conf.json` dosyasına gidin ve `updater` ayarını false olarak ayarlayın.



# Dökümantasyon
Uygulamanın dökümantasyonuna [buradan](https://github.com/Specy/genshin-music/wiki) ulaşabilirsiniz.

Çok detaylı olmasa da bazı dosya formatların nasıl çalıştığına dair yardımı dokunabilir. 

# Nasıl Katkıda bulunurum?
Ne üzerinde çalışmak istediğinizi açıklayan yeni bir issue (konu) oluşturun sonra benim konuyu atamamı bekleyin. Bu şekilde, düzeltilecek/eklenecek geçerli bir konu olup olmadığını da iletişim halinde değerlendirebiliriz.


# README.MD
<a href="./README.md">English</a> | <a href="./README-ZH.md">简体中文</a> | <a href="./README-JP.md">日本語</a> | <a href="./README-TR.md">Türkçe</a> | <a href="./README-ID.md">Indonesian</a>
