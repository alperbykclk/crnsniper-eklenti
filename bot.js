chrome.storage.local.get(['crn_token'], (storage) => {
    if (!storage.crn_token) {
        // Token yoksa bot sekmesini kapat
        document.body.innerHTML = '<div class="session-closed">Oturum kapatıldı. Sekme kapatılıyor...</div>';
        setTimeout(() => window.close(), 1500);
        return;
    }
    initBot();
});

function initBot() {
    // ═══════════════════════════════════════
    //  Dashboard Referanslar & Log Toggle
    // ═══════════════════════════════════════
    const statCountdown = document.getElementById("stat-countdown");
    const pillStatus = document.getElementById("pill-status");
    const pillProgress = document.getElementById("pill-progress");
    const logDiv = document.getElementById("bot-logs");
    const crnContainer = document.getElementById("crn-list-container");
    const crnCountSpan = document.getElementById("crn-count");
    const heroSub = document.getElementById("hero-sub");

    document.getElementById("log-toggle").onclick = () => {
        document.getElementById("log-toggle").classList.toggle("open");
        document.getElementById("log-body").classList.toggle("open");
    };

    const chkLocalhost = document.getElementById("chk-localhost");
    const simBanner = document.getElementById("sim-banner");
    chkLocalhost.addEventListener("change", (e) => {
        if (e.target.checked) {
            simBanner.classList.add("active");
            document.getElementById("row-prod").style.display = "none";
            document.getElementById("row-sim").style.display = "flex";
            document.getElementById("bot-time").style.display = "none";
        } else {
            simBanner.classList.remove("active");
            document.getElementById("row-prod").style.display = "flex";
            document.getElementById("row-sim").style.display = "none";
            document.getElementById("bot-time").style.display = "block";
        }
    });

    const isSimulation = () => chkLocalhost.checked;

    // ═══════════════════════════════════════
    //  CRN satırları: her satır bir As CRN ve isteğe bağlı Yedek CRN
    //  state: "waiting" | "active" | "success" | "failed"
    // ═══════════════════════════════════════
    let rows = [];

    const setCard = (row, cls, badgeText) => {
        row.el.classList.remove("success", "warning", "error");
        if (cls) row.el.classList.add(cls);
        // Rozet değişince pano gibi yukarıdan çevrilir; aynı metin tekrar gelirse oynamaz
        if (row.badgeEl.textContent !== badgeText) {
            row.badgeEl.classList.remove("flip");
            void row.badgeEl.offsetWidth;
            row.badgeEl.classList.add("flip");
        }
        row.badgeEl.textContent = badgeText;
        row.badgeEl.title = badgeText;
    };

    const el = (tag, cls, text) => {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    // Her satır bir kulvar: kulvar numarası, beyaz göğüs numarası (AS/YEDEK + CRN),
    // durum rozeti. Koşucunun yeri .success/.warning/.error sınıflarından gelir (bot.html).
    const renderRows = (stored) => {
        crnContainer.replaceChildren();
        rows = stored.map((c, i) => {
            const card = el("div", "crn-card");
            const lane = el("div", "lane");
            const rail = el("div", "rail");
            const runner = el("div", "runner");

            const bib = el("div", "bib");
            const kindEl = el("span", "bib-kind", "AS");
            const codeEl = el("span", "code", c.asCrn);
            bib.append(kindEl, codeEl);

            const tagCol = el("div", "tagcol");
            const badgeEl = el("span", "badge", "Bekleniyor");
            tagCol.appendChild(badgeEl);
            if (c.yedekCrn) tagCol.appendChild(el("span", "sub", "Yedek: " + c.yedekCrn));

            runner.append(bib, tagCol);
            rail.appendChild(runner);
            lane.appendChild(rail);
            card.append(el("span", "lane-no", String(i + 1)), lane);
            crnContainer.appendChild(card);
            return { as: c.asCrn, yedek: c.yedekCrn, current: c.asCrn, state: "waiting", el: card, codeEl, kindEl, badgeEl };
        });

        crnCountSpan.textContent = rows.length;
        updateProgress();

        if (rows.length === 0) {
            crnContainer.appendChild(el("div", "lane-empty", "Henüz CRN eklenmedi. Eklenti penceresinden CRN gir."));
        }
    };

    // Popup'ta son girilen CRN'leri yükle; başlatırken tüm satırlar aktif olur
    const loadRows = async () => {
        renderRows(await getStoredRows());
        return rows.length > 0;
    };

    const activateRows = () => {
        rows.forEach(row => {
            row.state = "active";
            row.current = row.as;
            row.codeEl.textContent = row.as;
            row.kindEl.textContent = "AS";
            setCard(row, null, "Bekleniyor");
        });
        updateProgress();
    };

    const setStatus = (text, color) => {
        pillStatus.textContent = text;
        pillStatus.className = "pill pill-" + color;
    };

    const updateProgress = () => {
        const total = rows.length;
        const alinan = rows.filter(r => r.state === "success").length;
        pillProgress.textContent = alinan + " / " + total;
        if (alinan > 0 && alinan < total) {
            pillProgress.className = "pill pill-blue";
        } else if (alinan === total && total > 0) {
            pillProgress.className = "pill pill-green";
        }
    };

    // kind: "ok" | "warn" | "info" | "err". Satırın rengi ve işareti (CSS ile çizilen
    // onay / uyarı / ok / çarpı) bu türden gelir; mesaj metni ikon taşımaz.
    const LOG_KINDS = ["ok", "warn", "info", "err"];
    const log = (kind, msg) => {
        const t = new Date().toLocaleTimeString("tr-TR");
        const line = el("div", "log-line log-" + (LOG_KINDS.includes(kind) ? kind : "info"));
        // Sunucudan gelen metin HTML olarak yorumlanmasın (yalnızca textContent)
        line.append(el("span", "t", "[" + t + "]"), el("span", "m", msg));
        logDiv.append(line);
        logDiv.scrollTop = logDiv.scrollHeight;

        // Auto-open log on first message
        if (!document.getElementById("log-body").classList.contains("open")) {
            document.getElementById("log-toggle").classList.add("open");
            document.getElementById("log-body").classList.add("open");
        }
    };

    let timerInterval = null;
    let spamTimer = null;
    let stopTimer = null;
    let attemptCount = 0;
    let countdownInterval = null;
    let botActive = false;
    let targetMs = 0;
    let jwtToken = null;
    // Token'ın alındığı adres: istekler hep buraya gider. Çalışırken Simülasyon
    // Modu değiştirilse bile OBS token'ı siteye, eklenti token'ı OBS'e gitmez.
    let tokenBaseUrl = null;

    // Bilgisayar saatinin sunucu saatinden farkı (ms). Zamanlayıcı serverNow()'a göre çalışır.
    let clockOffset = 0;
    const serverNow = () => Date.now() + clockOffset;

    const syncClock = async () => {
        try {
            const { offset, rtt } = await measureClockOffset();
            clockOffset = offset;
            const sn = (Math.abs(offset) / 1000).toFixed(1);
            const yon = offset > 0 ? "geride" : "ileride";
            if (Math.abs(offset) < 200) {
                log("info", "Bilgisayar saati doğru (fark " + offset + " ms, ölçüm ±" + Math.round(rtt / 2) + " ms)");
            } else {
                log("warn", "Bilgisayar saatiniz " + sn + " sn " + yon + ", zamanlayıcı sunucu saatine göre ayarlandı.");
            }
        } catch (e) {
            log("warn", "Sunucu saati alınamadı, bilgisayar saati kullanılıyor.");
        }
    };

    // Kayıt saatleri İstanbul saatidir (UTC+3, yaz saati uygulaması yok);
    // bilgisayarın saat dilimi farklı olsa da hedef doğru hesaplanır.
    const IST_OFFSET_MS = 3 * 60 * 60 * 1000;
    const istanbulTargetMs = (timeVal, nowMs) => {
        const [h, m, s] = timeVal.split(":").map(n => parseInt(n || "0", 10));
        const ist = new Date(nowMs + IST_OFFSET_MS); // UTC alanları İstanbul saatini verir
        let target = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), h, m, s || 0) - IST_OFFSET_MS;
        if (target <= nowMs) target += 24 * 60 * 60 * 1000;
        return target;
    };
    const formatIstanbul = (ms) => new Date(ms).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul" });

    const btnStart = document.getElementById("btn-start");
    const btnStartNow = document.getElementById("btn-start-now");
    const btnStop = document.getElementById("btn-stop");
    const btnTest = document.getElementById("btn-test");
    const timeInput = document.getElementById("bot-time");
    const rowProd = document.getElementById("row-prod");
    const rowSim = document.getElementById("row-sim");
    const rowStop = document.getElementById("row-stop");

    const playAlarm = () => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [440, 554, 659].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
            gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.4);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + i * 0.15);
            osc.stop(ctx.currentTime + i * 0.15 + 0.4);
        });
    };

    const getJwt = async () => {
        log("info", "JWT Token alınıyor...");
        try {
            if (isSimulation()) {
                // Site için host izni olduğundan "tabs" izni olmadan URL ile aranabilir
                const simUrl = CRN_CONFIG.SITE_URL + "/simulasyon";
                const simTabs = await chrome.tabs.query({ url: simUrl + "*" });
                if (simTabs.length === 0) {
                    throw new Error("Simülasyon sayfası (" + simUrl + ") açık değil!");
                }
                // Simülasyon sunucusu istekleri hesaba göre ayırır: OBS JWT'si
                // yerine eklenti token'ı kullanılır.
                const { crn_token } = await chrome.storage.local.get(["crn_token"]);
                if (!crn_token) throw new Error("Hesap bağlı değil");
                jwtToken = crn_token;
                tokenBaseUrl = CRN_CONFIG.SITE_URL;
            } else {
                jwtToken = await fetchObsJwt(CRN_CONFIG.OBS_URL);
                tokenBaseUrl = CRN_CONFIG.OBS_URL;
            }
            log("ok", "JWT alındı");
            return true;
        } catch (e) {
            log("err", "JWT alınamadı: " + e.message);
            return false;
        }
    };

    const finishIfDone = () => {
        if (rows.some(r => r.state === "active")) return false;

        if (rows.every(r => r.state === "success")) {
            log("ok", "TÜM DERSLER ALINDI!");
            setStatus("Tamamlandı", "green");
            // Onay işareti CSS ile çizilir (.countdown.done.all)
            statCountdown.textContent = "";
            statCountdown.className = "countdown done all";
            heroSub.textContent = "Tüm dersler başarıyla alındı!";
        } else {
            log("warn", "İşlem bitti (kalan dersler kalıcı hata aldı).");
            setStatus("Bitti", "yellow");
            statCountdown.textContent = "BİTTİ";
            statCountdown.className = "countdown done";
            heroSub.textContent = "Süreç tamamlandı.";
        }
        stopBot();
        return true;
    };

    const markSuccess = (row) => {
        row.state = "success";
        setCard(row, "success", "Alındı");
    };

    // Tek bir OBS cevabını satırlara uygular:
    //  başarılı → ALINDI, geçici hata → denemeye devam,
    //  kalıcı hata → yedek varsa yedeğe geç, yoksa satırı bitir.
    const applyResults = (pending, results) => {
        const byCrn = new Map(results.map(r => [r.crn, r]));
        const alinan = [];
        const detay = [];

        pending.forEach(row => {
            const res = byCrn.get(row.current);
            if (!res) {
                detay.push(row.current + " (Bekleniyor)");
                return;
            }
            if (res.success) {
                markSuccess(row);
                alinan.push(row.current);
                return;
            }
            if (!res.fatal) {
                setCard(row, "warning", res.msg);
                detay.push(row.current + " (" + res.msg + ")");
                return;
            }
            if (row.current === row.as && row.yedek && res.fallbackAllowed) {
                log("warn", row.as + ": " + res.msg + " → Yedek " + row.yedek + " deneniyor");
                row.current = row.yedek;
                row.codeEl.textContent = row.yedek;
                row.kindEl.textContent = "YEDEK";
                setCard(row, "warning", "Yedeğe geçildi");
                detay.push(row.yedek + " (yedek)");
                return;
            }
            row.state = "failed";
            setCard(row, "error", res.msg);
            detay.push(row.current + " (" + res.msg + ")");
        });

        if (alinan.length > 0) {
            playAlarm();
            log("ok", "ALINDI: " + alinan.join(", "));
        }
        updateProgress();

        // İstek limiti: aynı cevaptaki başarılar işlendikten sonra tamamen dur;
        // devam etmek OBS hesabının engellenmesini ağırlaştırır
        if (results.some(r => r.code === BAN_CODE)) {
            log("err", "OBS istek limiti (VAL21). Hesabınızın engellenmemesi için bot durduruldu. Bir süre bekleyip tekrar deneyin.");
            rows.filter(r => r.state === "active").forEach(row => setCard(row, "error", "İstek limiti"));
            stopBot();
            setStatus("İstek limiti", "yellow");
            heroSub.textContent = "OBS istek limitine takıldınız.";
            return;
        }

        if (!finishIfDone() && detay.length > 0) log("info", "Kalan: " + detay.join(" | "));
    };

    const sendSpamRequest = async () => {
        const pending = rows.filter(r => r.state === "active");
        if (!jwtToken || !tokenBaseUrl || pending.length === 0) return;

        const crns = pending.map(r => r.current);
        log("info", "İstek: " + crns.join(", "));
        try {
            const text = await postRegistration(tokenBaseUrl, jwtToken, crns);
            const results = parseRegistrationResult(text);

            if (results) {
                applyResults(pending, results);
            } else if (/başarı|success/i.test(text)) {
                // JSON olmayan başarı cevabı: yalnızca metinde geçen CRN'leri işaretle
                const found = new Set([...text.matchAll(/\d{5}/g)].map(m => m[0]));
                const matched = pending.filter(r => found.has(r.current));
                if (matched.length > 0) {
                    matched.forEach(markSuccess);
                    playAlarm();
                    log("ok", "ALINDI: " + matched.map(r => r.current).join(", "));
                    updateProgress();
                    finishIfDone();
                } else {
                    log("warn", "Beklenmeyen cevap: " + text.substring(0, 80));
                }
            } else {
                log("warn", "Beklenmeyen cevap: " + text.substring(0, 80));
            }
        } catch (e) {
            log("warn", "Bağlantı hatası: " + e.message);
        }
    };

    const stopBot = () => {
        botActive = false;
        chkLocalhost.disabled = false;
        clearInterval(timerInterval);
        clearTimeout(spamTimer);
        clearTimeout(stopTimer);
        clearInterval(countdownInterval);
        rowStop.style.display = "none";
        if (isSimulation()) {
            rowSim.style.display = "flex";
        } else {
            rowProd.style.display = "flex";
            timeInput.style.display = "block";
        }
        if (rows.some(r => r.state === "active")) setStatus("Durduruldu", "yellow");
        log("info", "Bot durduruldu.");
    };

    const loopSpam = async () => {
        if (!botActive) return;
        await sendSpamRequest();
        if (!botActive) return;

        attemptCount++;
        const intervalMs = attemptCount <= 5 ? 1000 : 3000;
        spamTimer = setTimeout(loopSpam, intervalMs);
    };

    const startSpam = async () => {
        if (!jwtToken) {
            const success = await getJwt();
            if (!success) { stopBot(); return; }
        }
        setStatus("Aktif", "green");
        statCountdown.textContent = "AKTİF";
        statCountdown.className = "countdown active pulse";
        heroSub.textContent = "Dersler alınıyor...";
        log("info", "Başladı (ilk 5 deneme 1 sn, sonra 3 sn aralık)");

        attemptCount = 0;
        loopSpam();

        clearTimeout(stopTimer);
        stopTimer = setTimeout(() => {
            if (botActive) {
                log("info", "10 dk doldu, otomatik durduruluyor.");
                stopBot();
            }
        }, 10 * 60 * 1000);
    };

    const showRunningControls = () => {
        botActive = true;
        chkLocalhost.disabled = true;
        rowProd.style.display = "none";
        rowSim.style.display = "none";
        timeInput.style.display = "none";
        rowStop.style.display = "flex";
    };

    // Lisansı sunucuda doğrular, geçerliyse true döner.
    const checkLicense = async () => {
        const storage = await chrome.storage.local.get(["crn_user", "crn_token"]);
        if (!storage.crn_token) {
            log("err", "Lütfen önce eklenti arayüzünden giriş yapın!");
            return false;
        }

        log("info", "Lisansınız kontrol ediliyor...");
        try {
            const { data } = await verifyLicense(storage.crn_token);
            if (data.valid) {
                log("ok", "Lisans onaylandı. Hoş geldin, " + (storage.crn_user?.email || 'Kullanıcı') + ".");
                return true;
            }
            log("err", "Lisans hatası: " + (data.message || "Bilinmeyen hata"));
        } catch (err) {
            log("warn", "Lisans sunucusuna ulaşılamadı!");
        }
        return false;
    };

    // Her başlatmada JWT yeniden alınır (önceki çalışmadan kalan token eskimiş olabilir)
    const prepareRun = async () => {
        if (!(await loadRows())) return false;
        jwtToken = null;
        tokenBaseUrl = null;
        activateRows();
        return true;
    };

    btnStartNow.onclick = async () => {
        if (!(await loadRows())) { log("err", "Önce ana eklentiden CRN girin!"); return; }
        if (!(await checkLicense())) return;

        await prepareRun();
        log("info", "Hemen başlatıldı");
        showRunningControls();
        startSpam();
    };

    btnTest.onclick = async () => {
        if (!(await prepareRun())) { log("warn", "Önce ana eklentiden CRN girin!"); return; }
        log("info", "Test modu (simülasyon)");
        showRunningControls();
        startSpam();
    };

    btnStart.onclick = async () => {
        if (!(await loadRows())) { alert("Önce ana eklentiden CRN girin!"); return; }

        const timeVal = timeInput.value;
        if (!timeVal) { alert("Lütfen saat seçin!"); return; }

        if (!(await checkLicense())) return;

        await syncClock();
        targetMs = istanbulTargetMs(timeVal, serverNow());

        await prepareRun();
        showRunningControls();
        setStatus("Beklemede", "blue");
        heroSub.textContent = "Hedef: " + formatIstanbul(targetMs) + " (İstanbul)";
        statCountdown.className = "countdown active";
        log("info", "Hedef: " + formatIstanbul(targetMs) + " (İstanbul saati)");

        let jwtFetched = false;

        // Geri sayım göstergesi
        countdownInterval = setInterval(() => {
            const rem = targetMs - serverNow();
            if (rem <= 0) {
                statCountdown.textContent = "00:00";
                clearInterval(countdownInterval);
            } else {
                const m = Math.floor(rem / 60000);
                const s = Math.floor((rem % 60000) / 1000);
                statCountdown.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
            }
        }, 1000);

        timerInterval = setInterval(async () => {
            if (!botActive) return;
            const remaining = targetMs - serverNow();
            if (remaining <= 45000 && remaining > 0 && !jwtFetched) {
                jwtFetched = true;
                // Uzun beklemede saat kayabilir: hedeften hemen önce farkı yeniden ölç
                await syncClock();
                await getJwt();
            }
            if (remaining <= 0) {
                clearInterval(timerInterval);
                clearInterval(countdownInterval);
                log("info", "Hedef saat geldi, istekler başlıyor");
                startSpam();
            }
        }, 100);
    };

    btnStop.onclick = stopBot;

    loadRows();
}
