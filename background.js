importScripts("config.js", "lib/api.js");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveToken') {
        // Yeniden bağlanıldı: önceki çıkıştan kalan bekleyen işaret yeni oturumu kapatmasın
        chrome.storage.local.remove("crn_logout_signal");
        chrome.storage.local.set({
            crn_token: request.token,
            crn_user: request.user
        }, () => {
            console.log("Token başarıyla kaydedildi.");
            sendResponse({ success: true });
        });
        return true;
    }
    if (request.action === 'clearToken') {
        // Siteden çıkış: token'ı sunucuda da iptal et
        chrome.storage.local.get(['crn_token'], ({ crn_token }) => {
            revokeToken(crn_token);
            chrome.storage.local.remove(['crn_token', 'crn_user'], () => {
                sendResponse({ success: true });
            });
        });
        return true;
    }
});

chrome.runtime.onInstalled.addListener(() => {
    getDeviceId();
});

// ═══════════════════════════════════════
//  DERS AL: tek seferlik kayıt isteği
// ═══════════════════════════════════════
const setBadge = (text, color) => {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 8000);
};

// Popup ve kısayol tarafından kullanılır. { ok, message, lines } döner.
const dersAl = async () => {
    const { crn_token } = await chrome.storage.local.get(["crn_token"]);
    if (!crn_token) return { ok: false, message: "Önce hesabınızı bağlayın." };

    const rows = await getStoredRows();
    if (rows.length === 0) return { ok: false, message: "Önce en az 1 CRN girin." };

    try {
        const { data } = await verifyLicense(crn_token);
        if (!data.valid) return { ok: false, message: data.message || "Lisans geçersiz." };
    } catch (e) {
        return { ok: false, message: "Lisans sunucusuna ulaşılamadı." };
    }

    let jwt;
    try {
        jwt = await fetchObsJwt(CRN_CONFIG.OBS_URL);
    } catch (e) {
        return { ok: false, message: "JWT alınamadı, İTÜ OBS'ye giriş yaptığınızdan emin olun. (" + e.message + ")" };
    }

    try {
        const result = await registerOnce(CRN_CONFIG.OBS_URL, jwt, rows);
        if (!result.lines) return { ok: false, message: "Beklenmeyen cevap: " + result.rawText.substring(0, 80) };
        return { ok: result.ok, message: "", lines: result.lines };
    } catch (e) {
        return { ok: false, message: "Bağlantı hatası: " + e.message };
    }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'dersAl') {
        dersAl().then(sendResponse);
        return true;
    }
});

chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "ders-al") return;
    setBadge("...", "#A1A1AA");
    const result = await dersAl();
    if (result.ok) {
        const alinan = result.lines.filter(l => l.ok).length;
        setBadge(alinan + "✓", "#34D399");
    } else {
        setBadge("!", "#ff453a");
    }
    console.log("Ders Al (kısayol):", result);
});
