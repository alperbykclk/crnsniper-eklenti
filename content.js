// Bu script sitemizde çalışır.
// Websitesi "window.postMessage" ile token yolladığında onu yakalayıp eklenti arka planına iletir.
// Eklentiden çıkış yapıldığında da siteye çıkış yaptırır.

// Eklentiden çıkış yapıldığında popup crn_logout_signal yazar. Site o an açık
// değilse işaret bekler; site bir sonraki açılışında çıkışı onaylayınca silinir.
const sendPendingLogout = () => {
    chrome.storage.local.get(["crn_logout_signal"], ({ crn_logout_signal }) => {
        if (crn_logout_signal) {
            window.postMessage({ type: "CRN_EXTENSION_LOGOUT" }, window.location.origin);
        }
    });
};

window.addEventListener("message", function(event) {
    // Sadece kendi web sitemizden gelen mesajları kabul et
    const allowedOrigins = [CRN_CONFIG.SITE_URL];
    if (event.source !== window || !allowedOrigins.includes(event.origin)) return;
    const type = event.data?.type;

    if (type === "CRN_LOGIN_SUCCESS") {
        console.log("CRNSniper Web Auth: Token yakalandı, eklentiye iletiliyor...");
        chrome.runtime.sendMessage({ action: "saveToken", token: event.data.token, user: event.data.user }, (response) => {
            if (response && response.success) {
                // Eklentiye kaydettik, websitesine geri dönüt ver
                window.postMessage({ type: "CRN_EXTENSION_ACK" }, window.location.origin);
            }
        });
    }

    if (type === "CRN_LOGOUT") {
        console.log("CRNSniper Web Auth: Logout yakalandı, eklentiden siliniyor...");
        chrome.runtime.sendMessage({ action: "clearToken" });
    }

    // Site (AuthListener) dinlemeye hazır: bekleyen çıkış varsa ilet
    if (type === "CRN_SITE_READY") sendPendingLogout();

    // Site çıkışı yaptı: bekleyen işareti sil
    if (type === "CRN_EXTENSION_LOGOUT_ACK") chrome.storage.local.remove("crn_logout_signal");
}, false);

// Sayfa React'ten önce ya da sonra yüklenebilir: CRN_SITE_READY kaçırılmışsa
// diye yüklenirken de bir kez dene.
sendPendingLogout();

// Site açıkken eklentiden çıkış yapılırsa hemen ilet.
// Token'ın silinmesini dinlemiyoruz: süresi dolan ya da başka tarayıcıda yeniden
// bağlanan token'ın temizlenmesi siteden atmamalı (popup.js logout).
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.crn_logout_signal?.newValue) {
        console.log("CRNSniper Eklenti: Çıkış yapıldı, websitesine çıkış sinyali gönderiliyor...");
        window.postMessage({ type: "CRN_EXTENSION_LOGOUT" }, window.location.origin);
    }
});
