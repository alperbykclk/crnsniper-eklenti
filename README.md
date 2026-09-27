# CRNSniper Chrome eklentisi

İTÜ OBS ders kaydı için Chrome eklentisi (Manifest V3). Lisans, hesap bağlama ve
simülasyon için [crndoldur-web](https://github.com/alperbykclk/crndoldur-web) sitesiyle çalışır.

## Geliştirirken yüklemek

1. `chrome://extensions` sayfasını aç, **Geliştirici modu**nu aç.
2. **Paketlenmemiş öğe yükle** ile bu klasörü seç.
3. Kodu değiştirdikten sonra eklenti kartındaki yenile düğmesine bas; sitenin açık sekmelerini de yenile.

## Dosyalar

- `popup.html`, `popup.js`: CRN satırları, DERS AL ve OTO BOT düğmeleri
- `bot.html`, `bot.js`: zamanlayıcılı bot sayfası (Simülasyon Modu dahil)
- `background.js`: token saklama, DERS AL ve Ctrl+Shift+K kısayolu
- `content.js`: sitede çalışır; hesap bağlama ve çıkış mesajlarını iletir
- `lib/api.js`: lisans kontrolü, OBS istekleri, sonuç kodları
- `config.js`: site ve OBS adresleri
- `ui.css`, `fonts/`: arayüz stilleri ve gömülü yazı tipleri (lisansı `fonts/LICENSE`)

## Site adresi değişirse

`config.js` içindeki `SITE_URL` ile `manifest.json` içindeki `host_permissions` ve
`content_scripts.matches` alanlarını birlikte güncelle.

## Yayınlamak

Chrome Web Store'a yüklemeden önce `manifest.json` içindeki `version` değerini artır ve
klasörün içeriğini (bu README hariç) zip olarak paketle.
