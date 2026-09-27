// Popup, bot sayfası ve background tarafından ortak kullanılan yardımcılar.
// config.js'ten sonra yüklenmelidir.

const VAL_MESSAGES = {
    "VAL01": "Genel Problem", "VAL02": "Kayıt zaman engeli",
    "VAL03": "Dönem zaten alındı", "VAL04": "Ders planında yok",
    "VAL05": "Kredi sınırı aşıldı", "VAL06": "Kontenjan Dolu", "VAL07": "AA ile verilmiş",
    "VAL08": "Bölüm şartı uymuyor", "VAL09": "Ders çakışıyor",
    "VAL11": "Önşart sağlanmadı", "VAL12": "Dönemde açılmadı",
    "VAL13": "Geçici engelli", "VAL14": "Sistem yanıt vermiyor",
    "VAL15": "Maks. 12 CRN", "VAL16": "Sistem Meşgul",
    "VAL18": "Engellendi", "VAL19": "Önlisans dersi",
    "VAL20": "1 ders bırakılabilir", "VAL21": "İSTEK LİMİTİ (BAN!)",
    "VAL22": "CC ve üstü alınmış"
};

const SUCCESS_CODES = ["successResult", "Ekleme İşlemi Başarılı", "SUCCESS"];

// Zamanla düzelebilecek hatalar: bot aynı CRN'yi denemeye devam eder.
// (kayıt henüz açılmadı, kontenjan dolu, sistem yanıt vermiyor / meşgul)
const TRANSIENT_CODES = ["VAL02", "VAL06", "VAL14", "VAL16"];

// Kalıcı olsa da yedeğe geçmenin anlamsız ya da zararlı olduğu hatalar:
// ders zaten alınmış, CRN sınırı dolmuş, istek limiti (ban).
const NO_FALLBACK_CODES = ["VAL03", "VAL15", "VAL21"];

// OBS istek limiti: gelirse hiçbir CRN için istek atmaya devam edilmez,
// yoksa OBS hesabının engellenmesi ağırlaşabilir.
const BAN_CODE = "VAL21";

// Bilgisayar saatinin sunucu saatinden farkını ölçer: { offset, rtt } (ms).
// offset pozitifse bilgisayar geride. En kısa gidiş-dönüşlü ölçüm kullanılır.
const measureClockOffset = async (samples = 5) => {
    let best = null;
    for (let i = 0; i < samples; i++) {
        try {
            const t0 = Date.now();
            const res = await fetch(CRN_CONFIG.SITE_URL + "/api/time", { cache: "no-store" });
            const t1 = Date.now();
            if (!res.ok) continue;
            const { now } = await res.json();
            const rtt = t1 - t0;
            if (!best || rtt < best.rtt) best = { rtt, offset: Math.round(now + rtt / 2 - t1) };
        } catch (e) { }
    }
    if (!best) throw new Error("Sunucu saati alınamadı");
    return best;
};

// Lisans dönemi boyunca sabit kalan cihaz kimliği. Eklenti silinirse kaybolur;
// bu durumda yeni lisans ya da admin'in cihaz sıfırlaması gerekir.
const getDeviceId = async () => {
    const { crn_device_id } = await chrome.storage.local.get(["crn_device_id"]);
    if (crn_device_id) return crn_device_id;
    const deviceId = "dev_" + crypto.randomUUID();
    await chrome.storage.local.set({ crn_device_id: deviceId });
    return deviceId;
};

// Sunucudan lisans durumunu sorgular. { status, data } döner; ağ hatasında fırlatır.
const verifyLicense = async (token) => {
    const deviceId = await getDeviceId();
    const res = await fetch(CRN_CONFIG.SITE_URL + "/api/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: deviceId, token: token })
    });
    const data = await res.json();
    return { status: res.status, data };
};

// Eklenti token'ını sunucuda iptal eder. Hata olsa da çıkışı engellemez.
const revokeToken = async (token) => {
    if (!token) return;
    try {
        await fetch(CRN_CONFIG.SITE_URL + "/api/extension/logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token })
        });
    } catch (e) { }
};

const fetchObsJwt = async (baseUrl) => {
    const res = await fetch(baseUrl + "/ogrenci/auth/jwt", { credentials: "include" });
    if (!res.ok) throw new Error("Status " + res.status);
    const text = await res.text();
    return text.replace(/\"/g, "");
};

// Tek bir ders kayıt isteği atar, OBS'nin ham cevabını metin olarak döner.
const postRegistration = async (baseUrl, jwt, crns) => {
    const res = await fetch(baseUrl + "/api/ders-kayit/v21", {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": "Bearer " + jwt
        },
        body: JSON.stringify({ "ECRN": crns, "SCRN": [] })
    });
    return res.text();
};

// OBS cevabını { crn, code, msg, success, fatal, fallbackAllowed } listesine çevirir.
// JSON değilse null döner.
const parseRegistrationResult = (text) => {
    try {
        const jsonObj = JSON.parse(text);
        if (!jsonObj.ecrnResultList) return null;
        return jsonObj.ecrnResultList.map(item => {
            const code = item.resultCode;
            const success = SUCCESS_CODES.includes(code);
            const msg = success ? "Alındı" : (VAL_MESSAGES[code] || code || "Bilinmeyen Hata");
            // Bilinmeyen kodlar geçici sayılır: bot denemeye devam eder
            const fatal = !success && code in VAL_MESSAGES && !TRANSIENT_CODES.includes(code);
            const fallbackAllowed = fatal && !NO_FALLBACK_CODES.includes(code);
            return { crn: String(item.crn).trim(), code, msg, success, fatal, fallbackAllowed };
        });
    } catch (e) {
        return null;
    }
};

// Popup'ta girilen satırlar: [{ asCrn, yedekCrn }]
const getStoredRows = async () => {
    const data = await chrome.storage.local.get(["crns"]);
    return (data.crns || [])
        .map(c => ({ asCrn: (c.asCrn || "").trim(), yedekCrn: (c.yedekCrn || "").trim() }))
        .filter(c => c.asCrn !== "");
};

// Tek seferlik kayıt (DERS AL): önce As CRN'ler gönderilir; kalıcı hata alan
// satırların Yedek CRN'leri ikinci bir istekte denenir.
// { ok, lines: [{ text, ok }] } döner, cevap JSON değilse { ok:false, rawText }.
const registerOnce = async (baseUrl, jwt, rows) => {
    const text = await postRegistration(baseUrl, jwt, rows.map(r => r.asCrn));
    const results = parseRegistrationResult(text);
    if (!results) return { ok: false, rawText: text };

    const asResults = new Map(results.map(r => [r.crn, r]));
    // İstek limitine takıldıysa yedekler için ikinci istek atılmaz
    const banned = results.some(r => r.code === BAN_CODE);
    const fallbackRows = banned ? [] : rows.filter(r => {
        const res = asResults.get(r.asCrn);
        return r.yedekCrn && res && res.fallbackAllowed;
    });

    let backupResults = new Map();
    if (fallbackRows.length > 0) {
        const backupText = await postRegistration(baseUrl, jwt, fallbackRows.map(r => r.yedekCrn));
        backupResults = new Map((parseRegistrationResult(backupText) || []).map(r => [r.crn, r]));
    }

    const lines = rows.map(r => {
        const as = asResults.get(r.asCrn) || { msg: "Cevap yok", success: false };
        if (!fallbackRows.includes(r)) return { text: r.asCrn + ": " + as.msg, ok: as.success };
        const backup = backupResults.get(r.yedekCrn) || { msg: "Cevap yok", success: false };
        return {
            text: r.asCrn + ": " + as.msg + " → Yedek " + r.yedekCrn + ": " + backup.msg,
            ok: backup.success
        };
    });
    if (banned) lines.push({ text: "OBS istek limitine takıldınız, bir süre bekleyin.", ok: false });
    return { ok: lines.some(l => l.ok), lines };
};
