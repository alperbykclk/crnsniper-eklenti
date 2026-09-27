const MAX_ROWS = 12;

const screens = ["loading", "login", "inactive", "error", "main"];
const showScreen = (name) => {
    screens.forEach(s => document.getElementById("screen-" + s).classList.toggle("hidden", s !== name));
};

// Eklenti oturumunu kapatır. siteToo: kullanıcı kendisi "Çıkış"a bastıysa site de
// çıkış yapsın (content.js crn_logout_signal'i dinler). Token geçersiz olduğu için
// (401: süresi doldu ya da başka tarayıcıda bağlandı) yapılan temizlik siteyi kapatmaz.
const logout = async (siteToo) => {
    const { crn_token } = await chrome.storage.local.get(['crn_token']);
    await revokeToken(crn_token);
    if (siteToo) await chrome.storage.local.set({ crn_logout_signal: Date.now() });
    chrome.storage.local.remove(['crn_token', 'crn_user'], () => { window.location.reload(); });
};

// ═══════════════════════════════════════
//  CRN satırları
// ═══════════════════════════════════════
const rowsContainer = document.getElementById("crn-rows");

const addRow = (asCrn = "", yedekCrn = "") => {
    if (rowsContainer.children.length >= MAX_ROWS) return;
    const row = document.createElement("div");
    row.className = "crn-row";
    [asCrn, yedekCrn].forEach((value, i) => {
        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.maxLength = 5;
        input.autocomplete = "off";
        input.setAttribute("aria-label", i === 0 ? "As CRN" : "Yedek CRN");
        input.value = value;
        input.addEventListener("input", saveCrns);
        row.appendChild(input);
    });
    rowsContainer.appendChild(row);
};

const readCrns = () => {
    return Array.from(rowsContainer.children)
        .map(row => {
            const [asInput, yedekInput] = row.querySelectorAll("input");
            return { asCrn: asInput.value.trim(), yedekCrn: yedekInput.value.trim() };
        })
        .filter(c => c.asCrn !== "");
};

function saveCrns() {
    chrome.storage.local.set({ crns: readCrns() });
}

const loadCrns = async () => {
    const { crns } = await chrome.storage.local.get(["crns"]);
    (crns || []).forEach(c => addRow(c.asCrn, c.yedekCrn));
    if (rowsContainer.children.length === 0) addRow();
};

document.getElementById("btn-add-row").onclick = () => addRow();
document.getElementById("btn-remove-row").onclick = () => {
    if (rowsContainer.children.length > 1) {
        rowsContainer.lastElementChild.remove();
        saveCrns();
    }
};

// ═══════════════════════════════════════
//  DERS AL / OTO BOT
// ═══════════════════════════════════════
const resultBox = document.getElementById("result");
const showResult = (lines) => {
    resultBox.replaceChildren(...lines.map(({ text, ok }) => {
        const line = document.createElement("div");
        line.className = ok ? "ok" : "err";
        line.textContent = text;
        return line;
    }));
    resultBox.classList.remove("hidden");
};

const dersAlBtn = document.getElementById("btn-dersal");
dersAlBtn.onclick = async () => {
    if (readCrns().length === 0) {
        showResult([{ text: "Önce en az 1 CRN girin!", ok: false }]);
        return;
    }
    saveCrns();
    dersAlBtn.disabled = true;
    dersAlBtn.textContent = "...";
    const result = await chrome.runtime.sendMessage({ action: "dersAl" });
    dersAlBtn.disabled = false;
    dersAlBtn.textContent = "DERS AL";

    if (result.lines) {
        showResult(result.lines);
    } else {
        showResult([{ text: result.message, ok: false }]);
    }
};

document.getElementById("btn-bot").onclick = (e) => {
    e.preventDefault();
    const crns = readCrns();
    if (crns.length === 0) {
        alert("Önce yukarıya en az 1 CRN girin!");
        return;
    }
    chrome.storage.local.set({ crns: crns }, () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("bot.html") });
    });
};

// ═══════════════════════════════════════
//  Oturum ve lisans
// ═══════════════════════════════════════
document.getElementById("btn-web-login").onclick = () => {
    window.open(CRN_CONFIG.SITE_URL + '/login?ext=true', '_blank');
};
document.getElementById("btn-dashboard").onclick = () => {
    window.open(CRN_CONFIG.SITE_URL + '/dashboard', '_blank');
};
document.getElementById("btn-inactive-logout").onclick = () => logout(true);
document.getElementById("btn-logout").onclick = () => logout(true);
document.getElementById("btn-retry").onclick = () => window.location.reload();

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.crn_token) {
        window.location.reload();
    }
});

const init = async () => {
    const storage = await chrome.storage.local.get(['crn_token', 'crn_user']);
    if (!storage.crn_token) {
        showScreen("login");
        return;
    }

    try {
        const { status, data } = await verifyLicense(storage.crn_token);
        if (!data.valid) {
            if (status === 401) {
                logout(false);
                return;
            }
            document.getElementById("inactive-message").textContent = data.message;
            showScreen("inactive");
            return;
        }
    } catch (e) {
        showScreen("error");
        return;
    }

    document.getElementById("user-email").textContent = storage.crn_user?.email || 'Aktif';
    await loadCrns();
    showScreen("main");
};

init();
