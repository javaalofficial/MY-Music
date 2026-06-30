window.MusicPlugins.register({
  id: 'smart-lyrics-premium-v2-9',
  name: '🎤 Lirik Pro Smart (v2.9 - Ultimate Engine)',
  init: function(api) {
    let lyricsContainer = null;
    let currentSongId = null;
    let syncedData = [];
    let isSynced = false;
    let lastActiveIdx = -1;
    
    // VARIABEL ANIMASI & UX STATE
    let isUserScrolling = false;
    let scrollTimeout = null;
    let activeScrollAnimation = null;
    let tempUnsavedLyrics = null; 

    // STATE V2.9 CORE MEMORY ENGINE
    let userSessionAdjustment = 0;   // Lapisan Sementara (RAM)
    let defaultDelay = 0;            // Lapisan Permanen (LocalStorage)
    let searchInputUserEdited = false; // Pemutus Kunci Kotak Input

    const STORAGE_KEY = 'mp_premium_lyrics_data_v2_9'; 
    const CONFIG_MODE_KEY = 'mp_premium_lyrics_mode_v2_9';
    const CONFIG_SAVE_KEY = 'mp_premium_lyrics_save_v2_9';
    const CONFIG_ANTICIPATE_KEY = 'mp_premium_lyrics_anticipate_v2_9';
    const CONFIG_SMOOTHNESS_KEY = 'mp_premium_lyrics_smoothness_v2_9';
    const CUSTOM_SERVERS_KEY = 'lric_custom_servers_v2_9';
    
    let currentMode = localStorage.getItem(CONFIG_MODE_KEY) || 'auto'; 
    let currentSaveMode = localStorage.getItem(CONFIG_SAVE_KEY) || 'ask'; 
    let currentAnticipatePct = parseInt(localStorage.getItem(CONFIG_ANTICIPATE_KEY)) || 0; 
    let currentScrollSmoothness = parseInt(localStorage.getItem(CONFIG_SMOOTHNESS_KEY)) || 50;

    // --- ENGINE PENYIMPANAN AMAN ---
    function getFullCache() {
      try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : {};
      } catch (e) { return {}; }
    }

    function calculateStoragePercentage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        return Math.min(100, (raw.length / 5242880) * 100);
      } catch(e) { return 0; }
    }

    function saveToCache(id, type, content, isManual = false, ignoreWarning = false) {
      try {
        let cache = getFullCache();
        let existingIgnore = cache[id] ? !!cache[id].ignoreWarning : false;
        let finalIgnore = ignoreWarning || existingIgnore;

        const newDataStr = JSON.stringify({ type, content, lastAccessed: Date.now(), isManual, ignoreWarning: finalIgnore });
        
        if (currentMode === 'auto') {
          let safetyCounter = 50;
          while (JSON.stringify(cache).length + newDataStr.length > 4800000 && safetyCounter > 0) {
            let items = Object.entries(cache)
              .filter(([_, val]) => !val.isManual)
              .sort((a, b) => (a[1].lastAccessed || 0) - (b[1].lastAccessed || 0));
            if (items.length > 0) delete cache[items[0][0]]; else break; 
            safetyCounter--;
          }
        }

        cache[id] = { type, content, lastAccessed: Date.now(), isManual, ignoreWarning: finalIgnore };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
        updateStorageUI();
      } catch (e) { console.error("Storage Error:", e); }
    }

    function updateStorageUI() {
      const p = calculateStoragePercentage();
      const bar = document.getElementById('v28-quota-bar');
      const txt = document.getElementById('v28-quota-text');
      
      if (bar && txt) {
        bar.style.width = p.toFixed(1) + '%';
        txt.textContent = p.toFixed(1) + '%';
        if (p < 80) bar.style.backgroundColor = 'var(--accent2)';
        else if (p < 95) bar.style.backgroundColor = '#fbbf24';
        else bar.style.backgroundColor = 'var(--danger)';
      }
    }

    function getTotalDelay() {
      return defaultDelay + userSessionAdjustment;
    }

    // --- SUNTIKAN UI LUXURY DASHBOARD KE TAB PEMUTAR UTAMA ---
    const playerSection = document.getElementById('sec-player');
    if (!playerSection) {
      api.showNotification("Gagal memuat UI Lirik: Tab Player tidak ditemukan.");
      return;
    }

    // Suntikkan style CSS kustom untuk animasi kedipan merah v2.9 & Modal
    const styleTag = document.createElement('style');
    styleTag.textContent = `
      @keyframes v29RedAlert {
        0% { background-color: rgba(239, 68, 68, 0.3); border-color: #ef4444; box-shadow: 0 0 8px #ef4444; }
        50% { background-color: rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.05); box-shadow: none; }
        100% { background-color: rgba(239, 68, 68, 0.3); border-color: #ef4444; box-shadow: 0 0 8px #ef4444; }
      }
      .v29-alarm-red {
        animation: v29RedAlert 0.6s infinite ease-in-out !important;
        color: #fca5a5 !important;
      }
      .v29-input-sub {
        background: rgba(0,0,0,0.3);
        border: 1px solid var(--border);
        color: var(--text);
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 11px;
        outline: none;
        width: 100%;
        box-sizing: border-box;
      }
    `;
    document.head.appendChild(styleTag);

    const lyricPanel = document.createElement('div');
    lyricPanel.className = 'panel';
    lyricPanel.style.padding = '0'; 
    lyricPanel.style.overflow = 'hidden';
    lyricPanel.style.display = 'flex';
    lyricPanel.style.flexDirection = 'column';
    lyricPanel.style.marginTop = '10px';

    lyricPanel.innerHTML = `
      <div id="v28-lyrics-canvas" style="min-height: 250px; max-height: 380px; overflow-y: auto; position: relative; text-align: center; white-space: pre-wrap; font-size: 16px; line-height: 2; padding: 0 20px; background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.25) 100%); scroll-behavior: auto; will-change: scroll-position;">
        <span style="color: var(--muted); display:block; padding-top:40px;">Pilih lagu untuk melihat lirik...</span>
      </div>

      <div id="v28-status-bar" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg); padding: 8px 14px; font-size: 10px; border-top: 1px solid rgba(255,255,255,0.03); transition: all 0.3s;" title="Status bar interaktif & tips onboarding harian">
        <span style="color:var(--muted)" id="v28-status-text">⏳ Menunggu...</span>
      </div>

      <div id="v28-ask-save-banner" style="display: none; background: rgba(16, 185, 129, 0.15); padding: 8px 14px; font-size: 11px; color: #a7f3d0; justify-content: space-between; align-items: center; border-top: 1px solid rgba(16, 185, 129, 0.2);">
        <span>💡 Lirik pas?</span>
        <button id="v28-confirm-save-btn" style="background: #10b981; color: #fff; border: none; padding: 5px 12px; font-size: 10px; font-weight: 700; border-radius: 6px; cursor: pointer;" title="Simpan berkas lirik ini ke memori lokal secara permanen">💾 SIMPAN PERMANEN</button>
      </div>

      <div id="v28-warning-banner" style="display: none; background: linear-gradient(90deg, rgba(251,191,36,0.12) 0%, rgba(245,158,11,0.18) 100%); padding: 8px 14px; font-size: 11px; color: #fef08a; justify-content: space-between; align-items: center; border-top: 1px solid rgba(245,158,11,0.2);">
        <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
          <span>⚠️ Audio Modifikasi. Lirik telat?</span>
          <button id="v28-fix-instan-btn" style="background: #f59e0b; color: #000; border: none; padding: 5px 10px; font-size: 10px; font-weight: 700; border-radius: 6px; cursor: pointer;" title="Klik TEPAT saat penyanyi mulai bersuara untuk kalibrasi otomatis via AI">KALIBRASI AI</button>
        </div>
        <button id="v28-close-warning-btn" style="background: none; border: none; color: rgba(254,240,138,0.5); font-size: 16px; font-weight: 700; cursor: pointer; padding: 0 4px;" title="Tutup peringatan ini">×</button>
      </div>

      <div style="padding: 12px 14px; background: rgba(255,255,255,0.02); border-top: 1px solid var(--border);">
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" id="v28-manual-input" placeholder="Ketik judul lagu..." style="flex: 1; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); background: rgba(0,0,0,0.5); color: var(--text); font-size: 12px; outline: none;" title="Kotak input manual pencarian teks lirik">
          <button id="v29-bg-save-btn" style="padding: 9px 12px; background: #9b59b6; color: white; border: none; border-radius: 10px; font-weight: bold; font-size: 13px; cursor: pointer;" title="Cari dan tabung lirik senyap di latar belakang tanpa menghentikan visual aktif">+</button>
          <button id="v28-manual-btn" class="btn primary" style="font-size: 11px; padding: 0 16px; border-radius:10px; height: 36px;" title="Cari lirik sekarang dari server terpilih">Cari</button>
          <button id="v28-main-ai-btn" style="padding: 0 14px; height: 36px; background: linear-gradient(90deg, #4f46e5, #7c3aed); color: white; border: none; border-radius: 10px; font-weight: 600; font-size: 11px; cursor: pointer; box-shadow: 0 4px 10px rgba(124,58,237,0.15);" title="Paksa pemicuan AI Spreader Engine untuk mengukur persentase lirik">🤖 AI</button>
        </div>
      </div>

      <details id="v28-advanced-settings" style="padding: 12px 14px; border-top: 1px solid var(--border); background: rgba(0,0,0,0.15);">
        <summary style="font-size: 11px; font-weight: 600; color: var(--muted); cursor: pointer; outline: none; list-style: none; display: flex; justify-content: space-between; align-items: center;">
          <span>⚙️ Advanced Settings / Options</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span id="v29-open-help-btn" style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; color: #fff; font-size: 10px; font-weight: bold;" title="Buka Panduan Onboarding Kilat">❓</span>
            <span style="font-size: 9px; opacity: 0.6;">▼ Klik untuk buka</span>
          </div>
        </summary>
        
        <div style="margin-top: 14px; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text);">
            <span>Kapasitas Terpakai:</span>
            <div style="display: flex; align-items: center; gap: 8px; width: 50%;">
              <div style="flex: 1; height: 6px; background: rgba(0,0,0,0.4); border-radius: 3px; overflow: hidden;">
                <div id="v28-quota-bar" style="width: 0%; height: 100%; background: var(--accent2); transition: width 0.4s ease;"></div>
              </div>
              <span id="v28-quota-text" style="font-weight: 700; font-size:10px;">0.0%</span>
            </div>
          </div>
          
          <div style="display: flex; gap: 8px;">
            <select id="v28-save-select" style="flex:1; background: rgba(0,0,0,0.3); color: var(--text); border: 1px solid var(--border); font-size: 10px; border-radius: 8px; padding: 6px; outline:none; cursor:pointer;" title="Mode otorisasi penyimpanan berkas lirik baru">
              <option value="ask" ${currentSaveMode === 'ask'?'selected':''}>🖐️ Izin Simpan (Aman)</option>
              <option value="auto" ${currentSaveMode === 'auto'?'selected':''}>📥 Auto-Simpan (Cepat)</option>
            </select>
            <select id="v28-mode-select" style="flex:1; background: rgba(0,0,0,0.3); color: var(--text); border: 1px solid var(--border); font-size: 10px; border-radius: 8px; padding: 6px; outline:none; cursor:pointer;" title="Mode manajemen kuota memori lokal">
              <option value="auto" ${currentMode === 'auto'?'selected':''}>🤖 Auto-Hapus (Disarankan)</option>
              <option value="manual" ${currentMode === 'manual'?'selected':''}>🙋 Manual</option>
            </select>
          </div>

          <div style="height: 1px; background: rgba(255,255,255,0.05); margin: 4px 0;"></div>
          
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; color: var(--text); font-weight: 600;">🌐 Sektor Multi-Server API:</label>
            <div style="display: flex; gap: 6px;">
              <select id="v29-server-select" style="flex:1; background: rgba(0,0,0,0.3); color: var(--text); border: 1px solid var(--border); font-size: 10px; border-radius: 8px; padding: 6px; outline:none; cursor:pointer;" title="Pilih basis data server penyedia lirik aktif"></select>
              <button id="v29-delete-server" style="background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4); color: #f87171; padding: 0 10px; border-radius: 8px; font-size: 11px; cursor: pointer;" title="Hapus server kustom terpilih">🗑️</button>
            </div>
            
            <div style="background: rgba(255,255,255,0.02); padding: 8px; border-radius: 8px; border: 1px dashed rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
              <span style="font-size: 9px; font-weight: bold; color: var(--muted);">➕ TAMBAH SERVER KUSTOM API</span>
              <input type="text" id="v29-cust-name" placeholder="Nama Server (e.g., Server Cadangan)" class="v29-input-sub" title="Masukkan nama alias untuk server API kustom">
              <input type="text" id="v29-cust-url" placeholder="URL Endpoint dengan parameter {query}" class="v29-input-sub" title="Gunakan {query} untuk menyuntikkan kata kunci pencarian real-time">
              <div style="display: flex; gap: 4px;">
                <input type="text" id="v29-cust-header" placeholder="Header Name (e.g., X-API-KEY)" class="v29-input-sub" style="flex:1;" title="Nama header otentikasi opsional">
                <input type="text" id="v29-cust-val" placeholder="Header Value / Token" class="v29-input-sub" style="flex:1;" title="Isi kunci token password API privat Anda">
              </div>
              <button id="v29-add-server-submit" style="background: var(--accent2); color: #000; font-weight: 700; border: none; font-size: 10px; padding: 6px; border-radius: 6px; cursor: pointer; margin-top: 2px;" title="Simpan server kustom ke memori permanen lokal browser">Simpan Server Baru</button>
            </div>
          </div>

          <div style="height: 1px; background: rgba(255,255,255,0.05); margin: 4px 0;"></div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text);">
              <span style="font-weight: 600;">🕒 Slider Delay Linier Statis:</span>
              <span id="v29-delay-val" style="font-weight: 700; color: #f1c40f;">0.0s</span>
            </div>
            <input type="range" id="v29-delay-slider" min="-300.0" max="300.0" step="0.5" value="0.0" style="width: 100%; accent-color: #f1c40f; cursor: pointer;" title="Geser untuk mengatur pergeseran linier detik lirik. (+) menunda audio yapping, (-) memajukan audio speed-up">
            
            <div style="display: flex; gap: 6px; margin-top: 2px;">
              <button id="v29-calib-onfly" style="flex:1; background: #f1c40f; color: #000; border: none; font-weight: 700; font-size: 10px; padding: 6px; border-radius: 6px; cursor: pointer;" title="Klik TEPAT saat vokal penyanyi mulai berbunyi untuk mengukur gap intro audio">⚡ KALIBRASI AI (On-The-Fly)</button>
              <button id="v29-save-init-delay" style="flex:1; background: #555; color: #fff; border: none; font-weight: 700; font-size: 10px; padding: 6px; border-radius: 6px; cursor: pointer;" title="Kunci komitmen nilai penunda aktif ini menjadi setelan default bawaan lagu ini">Jadikan Setelan Awal</button>
            </div>
          </div>

          <div style="height: 1px; background: rgba(255,255,255,0.05); margin: 4px 0;"></div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text);">
              <span>⏩ Antisipasi Jeda (%):</span>
              <span id="v28-anticipate-val" style="font-weight: 700; color: var(--accent2);">${currentAnticipatePct}%</span>
            </div>
            <input type="range" id="v28-anticipate-slider" min="-200" max="200" step="1" value="${currentAnticipatePct}" style="width: 100%; accent-color: var(--accent2); cursor: pointer;" title="Pengaturan persentase antisipasi gap antar baris">
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text);">
              <span>📺 Toleransi Gulir Otomatis (%):</span>
              <span id="v29-smoothness-val" style="font-weight: 700; color: #2ecc71;">${currentScrollSmoothness}%</span>
            </div>
            <input type="range" id="v29-smoothness-slider" min="0" max="100" step="5" value="${currentScrollSmoothness}" style="width: 100%; accent-color: #2ecc71; cursor: pointer;" title="Mengatur tingkat kelembutan smoothing translasi visual scroll lirik agar presisi di mata">
          </div>

          <div style="height: 1px; background: rgba(255,255,255,0.05); margin: 4px 0;"></div>

          <div style="display: flex; gap: 6px; margin-top: 4px;">
            <button id="v28-force-refresh" class="btn" style="flex:1; font-size: 10px; padding: 6px;" title="Paksa hapus cache lokal dan unduh ulang dari server internet">🔄 Ambil Ulang Internet</button>
            <button id="v28-clear-all" class="btn danger" style="flex:1; font-size: 10px; padding: 6px;" title="Bersihkan total seluruh basis data lirik lokal di browser Anda">🗑️ Kosongkan Memori</button>
          </div>
        </div>
      </details>
    `;

    playerSection.appendChild(lyricPanel);
    lyricsContainer = document.getElementById('v28-lyrics-canvas');

    // ELEMENT POPUP MODAL ONBOARDING KILAT (Sektor 5)
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'v29-help-modal';
    modalOverlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); display:none; align-items:center; justify-content:center; z-index:99999; font-family:sans-serif;';
    modalOverlay.innerHTML = `
      <div style="background:#222; border:1px solid #444; border-radius:12px; max-width:380px; width:90%; padding:20px; color:#fff; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
        <h4 style="margin-top:0; margin-bottom:12px; color:#1db954; font-size:15px; display:flex; align-items:center; gap:6px;">🎶 3 Langkah Kilat Menjinakkan Lirik</h4>
        <ol style="font-size:12px; padding-left:18px; line-height:1.6; color:#ddd; margin-bottom:18px;">
          <li style="margin-bottom:6px;"><strong>Gunakan Kalibrasi AI:</strong> Jika lirik balapan/telat akibat intro panjang atau yapping, ketuk tombol <span style="color:#f1c40f;font-weight:bold;">⚡ KALIBRASI AI</span> pas penyanyi mulai bersuara.</li>
          <li style="margin-bottom:6px;"><strong>Kunci Permanen:</strong> Klik tombol <em>"Jadikan Setelan Awal"</em> agar koreksi detik terkunci otomatis selamanya untuk lagu tersebut.</li>
          <li><strong>Multi-Server Aman:</strong> Jika server utama gagal menarik data, daftarkan URL API privat cadangan Anda agar pemutar tidak mengalami deadlock.</li>
        </ol>
        <button id="v29-close-help-submit" style="width:100%; padding:8px; background:#1db954; color:#fff; border:none; font-weight:bold; font-size:12px; border-radius:6px; cursor:pointer;">Saya Mengerti!</button>
      </div>
    `;
    document.body.appendChild(modalOverlay);

    // LOGIKA EVENT MODAL WINDOW HELP
    document.getElementById('v29-open-help-btn').addEventListener('click', (e) => {
      e.preventDefault();
      modalOverlay.style.display = 'flex';
    });
    document.getElementById('v29-close-help-submit').addEventListener('click', () => {
      modalOverlay.style.display = 'none';
    });

    // EVENT LOCK SCROLL USER INTERACTION
    const lockScroll = () => {
      isUserScrolling = true;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => { isUserScrolling = false; }, 4000);
    };
    lyricsContainer.addEventListener('wheel', lockScroll, {passive: true});
    lyricsContainer.addEventListener('touchstart', lockScroll, {passive: true});
    lyricsContainer.addEventListener('touchmove', lockScroll, {passive: true});
    lyricsContainer.addEventListener('mousedown', lockScroll, {passive: true});
    
    // SETUP CONFIG LISTENER & SLIDER CHANGERS
    document.getElementById('v28-mode-select').addEventListener('change', e => {
      currentMode = e.target.value; localStorage.setItem(CONFIG_MODE_KEY, currentMode);
    });
    document.getElementById('v28-save-select').addEventListener('change', e => {
      currentSaveMode = e.target.value; localStorage.setItem(CONFIG_SAVE_KEY, currentSaveMode);
    });

    document.getElementById('v28-anticipate-slider').addEventListener('input', e => {
      currentAnticipatePct = parseInt(e.target.value);
      document.getElementById('v28-anticipate-val').textContent = currentAnticipatePct + '%';
      localStorage.setItem(CONFIG_ANTICIPATE_KEY, currentAnticipatePct);
    });

    document.getElementById('v29-smoothness-slider').addEventListener('input', e => {
      currentScrollSmoothness = parseInt(e.target.value);
      document.getElementById('v29-smoothness-val').textContent = currentScrollSmoothness + '%';
      localStorage.setItem(CONFIG_SMOOTHNESS_KEY, currentScrollSmoothness);
    });

    // SEKTOR 1: LOGIKA DELAY LINIER & SINKRONISASI SLIDER
    const delaySlider = document.getElementById('v29-delay-slider');
    const delayValText = document.getElementById('v29-delay-val');

    delaySlider.addEventListener('input', e => {
      const sliderVal = parseFloat(e.target.value);
      userSessionAdjustment = sliderVal - defaultDelay;
      delayValText.textContent = (sliderVal >= 0 ? '+' : '') + sliderVal.toFixed(1) + 's';
      setTemporaryStatus(`🕒 Koreksi Sementara: ${(sliderVal >= 0 ? '+' : '') + sliderVal.toFixed(1)}s`);
    });

    // Tombol Kalibrasi AI On-The-Fly (Sektor 1)
    document.getElementById('v29-calib-onfly').addEventListener('click', () => triggerInstantCalibration());
    document.getElementById('v28-fix-instan-btn').addEventListener('click', () => triggerInstantCalibration());

    function triggerInstantCalibration() {
      if (!syncedData || syncedData.length === 0) {
        triggerRedAlert("Gagal Kalibrasi: Data stempel baris pertama lirik tidak terbaca!");
        return;
      }
      const t_audio = api.getAudio().currentTime || 0;
      const t_LRC = syncedData[0].time; // Ambil detik baris lirik pertama asli
      
      let calculatedDelay = t_audio - t_LRC;
      // Batasi secara ketat dalam batas aman -30.0s s/d +30.0s
      calculatedDelay = Math.max(-300, Math.min(300, calculatedDelay));
      
      userSessionAdjustment = calculatedDelay - defaultDelay;
      delaySlider.value = calculatedDelay.toFixed(1);
      delayValText.textContent = (calculatedDelay >= 0 ? '+' : '') + calculatedDelay.toFixed(1) + 's';
      
      setTemporaryStatus(`🤖 AI Berhasil! Slider dihitung otomatis ke ${calculatedDelay.toFixed(1)}s`);
    }

    // Jadikan Setelan Awal Permanen Per ID Lagu
    document.getElementById('v29-save-init-delay').addEventListener('click', () => {
      if (!currentSongId) {
        triggerRedAlert("Putar lagu terlebih dahulu!");
        return;
      }
      const totalDelay = getTotalDelay();
      defaultDelay = totalDelay;
      userSessionAdjustment = 0; // Diserap total ke dalam default permanently
      localStorage.setItem(`lric_default_delay_${currentSongId}`, totalDelay);
      setTemporaryStatus("💾 Setelan awal berhasil dikunci permanen untuk lagu ini!");
    });

    // SEKTOR 2: DETEKSI USER EDIT KOTAK INPUT (PEMUTUS KUNCI)
    const manualInputEl = document.getElementById('v28-manual-input');
    manualInputEl.addEventListener('input', () => {
      searchInputUserEdited = true; // Kunci dilepas, user mengambil kendali penuh typing
    });

    // TOMBOL CARI & TOMBOL LATAR BELAKANG SENYAP (+)
    document.getElementById('v28-manual-btn').addEventListener('click', () => {
      const q = manualInputEl.value.trim();
      if (q) fetchLyricsFromInternet(queryBuilder(q), false);
    });

    document.getElementById('v29-bg-save-btn').addEventListener('click', () => {
      const q = manualInputEl.value.trim();
      if (q) fetchLyricsFromInternet(queryBuilder(q), true); // isBackground = true
    });

    document.getElementById('v28-main-ai-btn').addEventListener('click', () => triggerAI());
    
    function triggerAI() {
      const state = api.getState();
      if (state.currentIndex !== -1) triggerAISpreaderEngine(state.playlist[state.currentIndex].id);
    }

    document.getElementById('v28-confirm-save-btn').addEventListener('click', () => {
      if(tempUnsavedLyrics && tempUnsavedLyrics.id === currentSongId) {
        saveToCache(tempUnsavedLyrics.id, tempUnsavedLyrics.type, tempUnsavedLyrics.content, false);
        api.showNotification("Lirik berhasil disimpan ke memori!");
        document.getElementById('v28-ask-save-banner').style.display = 'none';
        tempUnsavedLyrics = null;
        updateStatusUI(currentSongId, getFullCache());
      }
    });

    document.getElementById('v28-close-warning-btn').addEventListener('click', () => {
      const state = api.getState();
      if (state.currentIndex !== -1) {
        const songId = state.playlist[state.currentIndex].id;
        let cache = getFullCache();
        if (cache[songId]) saveToCache(songId, cache[songId].type, cache[songId].content, cache[songId].isManual, true);
        else saveToCache(songId, 'none', '', false, true);
        document.getElementById('v28-warning-banner').style.display = 'none';
      }
    });

    document.getElementById('v28-force-refresh').addEventListener('click', () => {
      const state = api.getState();
      if (state.currentIndex !== -1) {
        const s = state.playlist[state.currentIndex];
        let cache = getFullCache();
        delete cache[s.id]; 
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
        // Reset pengunci agar sinkron dengan nama lagu default kembali
        searchInputUserEdited = false;
        fetchLyricsFromInternet(cleanSongName(s.name), false);
      }
    });

    document.getElementById('v28-clear-all').addEventListener('click', () => {
      if (confirm("Hapus semua lirik tersimpan? Lirik akan diunduh ulang saat diputar kembali.")) {
        localStorage.removeItem(STORAGE_KEY);
        syncedData = []; isSynced = false; lastActiveIdx = -1; tempUnsavedLyrics = null;
        updateStorageUI();
        updateStatusUI(null, {});
        if (lyricsContainer) lyricsContainer.innerHTML = '<span style="color:var(--muted); display:block; padding-top:40px;">Lirik kosong. Silakan muat ulang.</span>';
        document.getElementById('v28-warning-banner').style.display = 'none';
        document.getElementById('v28-ask-save-banner').style.display = 'none';
      }
    });

    // =========================================================================
    // SEKTOR 3: MANAGEMENT DINAMIS DROPDOWN MULTI-SERVER API
    // =========================================================================
    const serverSelectEl = document.getElementById('v29-server-select');
    
    function loadServerSelectorOptions() {
      serverSelectEl.innerHTML = '<option value="default">🌐 Server Utama (LRCLIB)</option>';
      const servers = JSON.parse(localStorage.getItem(CUSTOM_SERVERS_KEY)) || [];
      servers.forEach((srv, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.textContent = `⚡ ${srv.name}`;
        serverSelectEl.appendChild(opt);
      });
    }

    document.getElementById('v29-add-server-submit').addEventListener('click', () => {
      const nameIn = document.getElementById('v29-cust-name').value.trim();
      const urlIn = document.getElementById('v29-cust-url').value.trim();
      const headerIn = document.getElementById('v29-cust-header').value.trim();
      const valIn = document.getElementById('v29-cust-val').value.trim();

      if (!nameIn || !urlIn) {
        alert("Nama Server dan URL Endpoint kustom wajib diisi!");
        return;
      }

      let servers = JSON.parse(localStorage.getItem(CUSTOM_SERVERS_KEY)) || [];
      servers.push({ name: nameIn, url: urlIn, authHeader: headerIn, authValue: valIn });
      localStorage.setItem(CUSTOM_SERVERS_KEY, JSON.stringify(servers));

      // Reset form input fields
      document.getElementById('v29-cust-name').value = '';
      document.getElementById('v29-cust-url').value = '';
      document.getElementById('v29-cust-header').value = '';
      document.getElementById('v29-cust-val').value = '';

      loadServerSelectorOptions();
      setTemporaryStatus(`🟢 Berhasil menyimpan basis server: ${nameIn}`);
    });

    document.getElementById('v29-delete-server').addEventListener('click', () => {
      const selected = serverSelectEl.value;
      if (selected === "default") {
        alert("Server utama (LRCLIB) adalah proteksi default bawaan dan tidak bisa dihapus.");
        return;
      }
      let servers = JSON.parse(localStorage.getItem(CUSTOM_SERVERS_KEY)) || [];
      servers.splice(parseInt(selected), 1);
      localStorage.setItem(CUSTOM_SERVERS_KEY, JSON.stringify(servers));
      loadServerSelectorOptions();
      setTemporaryStatus("🗑️ Server kustom berhasil dibersihkan dari storage.");
    });

    // SMART RESPONSE PARSER (Anti-Crash Lintas Struktur JSON / Plain Text)
    function smartResponseParser(dataPayload) {
      let rawString = "";
      if (typeof dataPayload === "object" && dataPayload !== null) {
        // Jika skema mirip LRCLIB standar array objek atau objek tunggal langsung
        if (Array.isArray(dataPayload) && dataPayload.length > 0 && dataPayload[0].syncedLyrics) {
          return { type: 'synced', content: dataPayload[0].syncedLyrics };
        } else if (dataPayload.syncedLyrics) {
          return { type: 'synced', content: dataPayload.syncedLyrics };
        } else if (dataPayload.plainLyrics) {
          return { type: 'plain', content: dataPayload.plainLyrics };
        } else {
          // JSON Asing struktural: Ubah total ke teks string mentah untuk dipindai rekursif via regex loop
          rawString = JSON.stringify(dataPayload);
        }
      } else {
        rawString = String(dataPayload);
      }

      // Regex loop ekstraksi pola stempel waktu aman lintasan format lrc [mm:ss.xx] atau [mm:ss]
      const lrcRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/g;
      let matches;
      let linesCollected = [];

      while ((matches = lrcRegex.exec(rawString)) !== null) {
        const min = parseInt(matches[1]);
        const sec = parseInt(matches[2]);
        const msStr = matches[3] ? matches[3].substring(0, 3).padEnd(3, '0') : '0';
        const ms = parseInt(msStr);
        const timeCalc = (min * 60) + sec + (ms / 1000);
        const textContent = matches[4].replace(/\\r|\\n|\r|\n/g, '').trim();
        linesCollected.push({ time: timeCalc, text: textContent });
      }

      if (linesCollected.length > 0) {
        linesCollected.sort((a, b) => a.time - b.time);
        // Rekonstruksi string format LRC standard
        const finalLrcText = linesCollected.map(item => {
          let m = String(Math.floor(item.time / 60)).padStart(2, '0');
          let s = String(Math.floor(item.time % 60)).padStart(2, '0');
          return `[${m}:${s}.00]${item.text}`;
        }).join('');
        return { type: 'synced', content: finalLrcText };
      }

      // Fallback total sebagai teks biasa jika tidak terdeteksi penanda waktu sama sekali
      return { type: 'plain', content: rawString.replace(/[{}"\[\]]|(syncedLyrics|plainLyrics|lyrics)/gi, '').trim() };
    }

    // INTERNET FETCH CORE UPGRADE V2.9
    async function fetchLyricsFromInternet(query, isBackground = false) {
      const state = api.getState();
      if (state.currentIndex === -1) return;
      const targetId = state.playlist[state.currentIndex].id;

      const serverVal = serverSelectEl.value;
      let targetUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
      let fetchOptions = { method: 'GET', headers: {} };
      let currentServerName = "Server Utama (LRCLIB)";

      if (serverVal !== "default") {
        const servers = JSON.parse(localStorage.getItem(CUSTOM_SERVERS_KEY)) || [];
        const activeSrv = servers[parseInt(serverVal)];
        if (activeSrv) {
          currentServerName = activeSrv.name;
          // Suntikkan parameter dinamis {query}
          targetUrl = activeSrv.url.replace("{query}", encodeURIComponent(query));
          // Smart Auth Header Injection
          if (activeSrv.authHeader && activeSrv.authValue) {
            fetchOptions.headers[activeSrv.authHeader] = activeSrv.authValue;
          }
        }
      }

      if (!isBackground) {
        updateStatusText(`⏳ Menghubungi ${currentServerName}...`);
      }

      try {
        const res = await fetch(targetUrl, fetchOptions);
        if (!res.ok) throw new Error(`HTTP Error Status ${res.status}`);
        
        // Baca response payload (bisa teks/json)
        const contentType = res.headers.get("content-type") || "";
        let responseData;
        if (contentType.includes("application/json")) {
          responseData = await res.json();
        } else {
          responseData = await res.text();
        }

        // Jalankan parser anti-crash lintasan lintas struktur
        const parsedResult = smartResponseParser(responseData);

        if (isBackground) {
          // MODE LATAR BELAKANG SENYAP: Simpan langsung ke cache tanpa mengganggu visualisasi berjalan
          saveToCache(targetId, parsedResult.type, parsedResult.content, false);
          api.showNotification(`✅ [Latar Belakang] Berhasil menabung lirik untuk "${query}"!`);
          updateStatusUI(currentSongId, getFullCache());
        } else {
          // MODE UTAMA DISPLAY RESMI
          if (targetId === currentSongId) {
            if (parsedResult.type !== 'none' && currentSaveMode === 'ask') {
              tempUnsavedLyrics = { id: targetId, type: parsedResult.type, content: parsedResult.content };
              updateStatusUI(targetId, getFullCache());
              processLyricData(parsedResult.type, parsedResult.content, targetId, false); 
            } else {
              saveToCache(targetId, parsedResult.type, parsedResult.content, false);
              updateStatusUI(targetId, getFullCache());
              processLyricData(parsedResult.type, parsedResult.content, targetId, true);
            }
          }
        }
      } catch (err) {
        if (!isBackground && targetId === currentSongId) {
          triggerRedAlert(`Koneksi Mati di ${currentServerName}. Mengalihkan ke Fitur Cadangan AI Spreader...`);
          // Otomatis lempar pertahanan ke Spreader untuk mencegah kemacetan total visual (Anti-Deadlock)
          setTimeout(() => { triggerAISpreaderEngine(targetId); }, 1500);
        }
      }
    }

    function queryBuilder(str) { return str; }

    // =========================================================================
    // SEKTOR 4: VISUAL STATUS & ALARM MERAH INDIKATOR
    // =========================================================================
    const statusBarEl = document.getElementById('v28-status-bar');
    const statusTextEl = document.getElementById('v28-status-text');

    function updateStatusText(msg) {
      if (statusTextEl) statusTextEl.textContent = msg;
    }

    function triggerRedAlert(errMsg) {
      if (!statusBarEl) return;
      updateStatusText(`🚨 ${errMsg}`);
      statusBarEl.classList.add('v29-alarm-red');
      // Matikan kedipan alarm merah setelah 5 detik berjalan aman
      setTimeout(() => {
        statusBarEl.classList.remove('v29-alarm-red');
      }, 5000);
    }

    let temporaryStatusTimeout = null;
    function setTemporaryStatus(msg) {
      clearTimeout(temporaryStatusTimeout);
      updateStatusText(msg);
      temporaryStatusTimeout = setTimeout(() => {
        updateStatusUI(currentSongId, getFullCache());
      }, 4000);
    }

    // =========================================================================
    // SEKTOR 5: ONBOARDING EDUKASI TIPS ROTASI (7 DETIK)
    // =========================================================================
    const tipsCollection = [
      "💡 TIPS: Jika lirik balapan akibat yapping di awal lagu, klik 'KALIBRASI AI' pas penyanyi mulai berbunyi!",
      "💡 TIPS: Tombol (+) di dekat input berfungsi menabung lirik lagu secara senyap di latar belakang.",
      "💡 TIPS: Setelah setelan delay beres, klik 'Jadikan Setelan Awal' agar terkunci selamanya di lagu ini.",
      "💡 TIPS: Tingkat kehalusan gulir translasi piringan lirik dapat disesuaikan pada Slider Toleransi Gulir."
    ];
    let activeTipsIndex = 0;
    
    setInterval(() => {
      // Rotasi berjalan hanya jika status sedang stand-by menunggu atau tidak dalam status kritis error/loading
      if (statusBarEl && !statusBarEl.classList.contains('v29-alarm-red')) {
        const txtCurrent = statusTextEl ? statusTextEl.textContent : "";
        if (txtCurrent.startsWith("💡") || txtCurrent.startsWith("⏳ Menunggu")) {
          activeTipsIndex = (activeTipsIndex + 1) % tipsCollection.length;
          updateStatusText(tipsCollection[activeTipsIndex]);
        }
      }
    }, 7000);

    // CONTROLLER UPDATE STATUS UI UTAMA
    function updateStatusUI(songId, cache) {
      if(!statusBarEl) return;
      if(!songId) { statusBarEl.innerHTML = `<span id="v28-status-text" style="color:var(--muted)">⏳ Menunggu lagu...</span>`; return; }

      let html = '';
      let hasData = false;

      if(cache[songId]) {
        hasData = true;
        if(cache[songId].type === 'none') {
           html = `<span id="v28-status-text" style="color:var(--muted)">❌ Teks tidak ditemukan</span>`;
        } else if(cache[songId].isManual) {
           html = `<span id="v28-status-text" style="color:#10b981; font-weight:600;">🛡️ Terkunci (Aman via AI)</span>`;
        } else {
           html = `<span id="v28-status-text" style="color:#3b82f6; font-weight:600;">💾 Tersimpan di Memori</span>`;
        }
      } else if (tempUnsavedLyrics && tempUnsavedLyrics.id === songId) {
        hasData = true;
        html = `<span id="v28-status-text" style="color:#8b5cf6; font-weight:600;">☁️ Terbaca dari Internet</span>`;
      } else {
        html = `<span id="v28-status-text" style="color:var(--muted)">Mencari lirik...</span>`;
      }
      
      if(hasData) {
        html += `<button id="v28-delete-single-btn" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#fca5a5; cursor:pointer; font-size:9px; padding:3px 8px; border-radius:6px; font-weight:600;">🗑️ Hapus Lirik Ini</button>`;
      }
      statusBarEl.innerHTML = html;

      // Bind ulang text pointer untuk referensi berkala tips rotasi
      lyricsContainer = document.getElementById('v28-lyrics-canvas');
      const textPointer = statusBarEl.querySelector('#v28-status-text');
      if (textPointer) {
        // Jangan timpa pointer global jika id ada di DOM
        // Re-assign element selector ke penampung static agar interval tips v2.9 tidak mati lemas
      }

      const delBtn = statusBarEl.querySelector('#v28-delete-single-btn');
      if(delBtn) {
        delBtn.addEventListener('click', () => {
          let currentCache = getFullCache();
          if(currentCache[songId]) {
            delete currentCache[songId];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentCache));
            updateStorageUI();
          }
          syncedData = []; isSynced = false; lastActiveIdx = -1; tempUnsavedLyrics = null;
          updateStatusUI(songId, getFullCache());
          loadLyricsForCurrentSong(true); 
          api.showNotification("Lirik dihapus dari memori!");
        });
      }
    }

    function cleanSongName(name) {
      let cleaned = name.replace(/\(.*?\)|\[.*?\]/g, '').replace(/_|-/g, ' ').replace(/\s+/g, ' ').trim();
      return cleaned.replace(/\b(slowed|reverb|speed up|remix|tiktok version|mashup|sped up|nightcore)\b/gi, '').trim() || name;
    }

    function checkIsModifiedAudio(name) {
      return /\b(slowed|reverb|speed up|remix|tiktok version|sped up|nightcore)\b/i.test(name);
    }

    // SINKRONISASI PEMBACAAN AWAL LAGU (SEKTOR 2: ANTI OVERWRITE LOCK)
    function loadLyricsForCurrentSong(force = false) {
      const state = api.getState();
      if (state.currentIndex === -1 || !lyricsContainer) return;

      const song = state.playlist[state.currentIndex];
      if (!force && song.id === currentSongId) return; 

      currentSongId = song.id;
      syncedData = []; isSynced = false; lastActiveIdx = -1;
      lyricsContainer.scrollTop = 0;
      tempUnsavedLyrics = null;
      
      if (document.getElementById('v28-warning-banner')) document.getElementById('v28-warning-banner').style.display = 'none';
      if (document.getElementById('v28-ask-save-banner')) document.getElementById('v28-ask-save-banner').style.display = 'none';

      // Sektor 2: Pengisian otomatis kotak input manual HANYA SATU KALI di awal lagu baru
      if (!searchInputUserEdited) {
        if (manualInputEl) manualInputEl.value = cleanSongName(song.name);
      }

      // Sektor 1: Load Delay Bawaan Permanen per ID lagu dari localStorage
      const savedDelay = localStorage.getItem(`lric_default_delay_${currentSongId}`);
      defaultDelay = savedDelay ? parseFloat(savedDelay) : 0;
      userSessionAdjustment = 0; // Reset session adjustment RAM untuk lagu baru
      
      if(delaySlider) {
        delaySlider.value = defaultDelay.toFixed(1);
        delayValText.textContent = (defaultDelay >= 0 ? '+' : '') + defaultDelay.toFixed(1) + 's';
      }

      let cache = getFullCache();
      updateStatusUI(song.id, cache);
      
      if (cache[song.id]) {
        cache[song.id].lastAccessed = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
        updateStorageUI(); 
        processLyricData(cache[song.id].type, cache[song.id].content, song.id, true);
      } else {
        lyricsContainer.innerHTML = `<span style="color: var(--muted); font-size:14px; display:block; padding-top:40px;">🌐 Membaca gelombang internet...</span>`;
        fetchLyricsFromInternet(cleanSongName(song.name), false);
      }
    }

    function processLyricData(type, content, id, isSavedStatus) {
      if (!lyricsContainer) return;
      
      const state = api.getState();
      const song = state.playlist[state.currentIndex];
      let cache = getFullCache();
      let isSongManual = cache[id] ? !!cache[id].isManual : false;
      let isSongIgnoreWarning = cache[id] ? !!cache[id].ignoreWarning : false;

      const warnBanner = document.getElementById('v28-warning-banner');
      if (warnBanner) {
        if (type === 'synced' && !isSongManual && checkIsModifiedAudio(song.name) && !isSongIgnoreWarning) {
          warnBanner.style.display = 'flex';
        } else {
          warnBanner.style.display = 'none';
        }
      }

      const askBanner = document.getElementById('v28-ask-save-banner');
      if (askBanner) {
        if (!isSavedStatus && type !== 'none' && currentSaveMode === 'ask') askBanner.style.display = 'flex';
        else askBanner.style.display = 'none';
      }

      if (type === 'synced') {
        parseLRC(content);
        renderLRC();
      } else if (type === 'plain') {
        syncedData = []; isSynced = false;
        lyricsContainer.innerHTML = `<div style="color: rgba(255,255,255,0.85); padding: 40px 0 20px 0; font-weight: 500;">${content}</div>`;
      } else {
        syncedData = []; isSynced = false;
        showAlternativeTools(id);
      }
    }

    async function triggerAISpreaderEngine(id) {
      if (!lyricsContainer) return;
      let currentText = lyricsContainer.innerHTML;
      lyricsContainer.innerHTML = `<span style="color: var(--accent2); font-size:14px; display:block; padding-top:40px;">🤖 AI Mengukur Persentase Audio...</span>`;
      
      let inputVal = manualInputEl?.value || '';
      let cleaned = cleanSongName(inputVal);
      let artist = "Various", title = cleaned;
      if (cleaned.includes('-')) { let parts = cleaned.split('-'); artist = parts[0].trim(); title = parts[1].trim(); }

      try {
        let rawLyrics = null;
        try {
          const resOVH = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
          if (resOVH.ok) {
            const result = await resOVH.json();
            if (result && result.lyrics) rawLyrics = result.lyrics.replace(/^Lyrics of.*?\r?\n/i, '');
          } else throw new Error("OVH Fail");
        } catch(e) {
          const resFallback = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleaned)}`);
          const fallbackData = await resFallback.json();
          if (fallbackData && fallbackData.length > 0 && fallbackData[0].plainLyrics) rawLyrics = fallbackData[0].plainLyrics;
        }

        if (rawLyrics) {
          let lines = rawLyrics.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          let duration = api.getAudio().duration || 180; 
          let speedRatio = duration / 180; 
          let introGap = Math.max(2.0, Math.min(4.5, duration * 0.035));
          let anticipation = 1.0 * speedRatio; 
          if (speedRatio > 1.2) anticipation = 1.65 * (speedRatio * 0.9); 
          else if (speedRatio < 0.8) anticipation = 0.65; 
          
          let activeDuration = Math.max(0, duration - introGap - 2.5); 
          let interval = activeDuration / lines.length;
          let aiBuiltLRC = lines.map((line, index) => {
            let currentSec = Math.max(0, introGap + (index * interval) - anticipation);
            let m = String(Math.floor(currentSec / 60)).padStart(2, '0');
            let s = String((currentSec % 60).toFixed(2)).padStart(5, '0');
            return `[${m}:${s}]${line}`;
          }).join('\n');

          tempUnsavedLyrics = null; 
          saveToCache(id, 'synced', aiBuiltLRC, true); 
          updateStatusUI(id, getFullCache());
          processLyricData('synced', aiBuiltLRC, id, true);
          api.showNotification("✨ Sinkronisasi sukses via AI Spreader!");
        } else throw new Error("Lyrics Not Found");
      } catch (e) {
        api.showNotification("AI Gagal menemukan referensi teks.");
        lyricsContainer.innerHTML = currentText; 
        showAlternativeTools(id);
      }
    }

    function showAlternativeTools(id) {
      lyricsContainer.innerHTML = `
        <div style="font-size:12px; color:var(--muted); margin: 30px 0 10px 0;">Teks tidak tersedia di database.</div>
        <textarea id="v28-tool-area" placeholder="Tempel lirik biasa di sini..." style="width:100%; height:90px; background:rgba(0,0,0,0.4); color:var(--text); border:1px solid var(--border); border-radius:10px; padding:10px; font-family:inherit; font-size:12px; outline:none; resize:none;"></textarea>
        <div style="margin-top:8px; margin-bottom: 20px; display:flex; gap:6px; justify-content:center;">
          <button id="v28-save-plain" class="btn primary" style="font-size:11px; padding:6px 14px; border-radius:8px;">💾 Simpan Teks</button>
          <button id="v28-build-sync" class="btn" style="font-size:11px; padding:6px 14px; background:rgba(6,182,212,0.15); color:var(--accent2); border-radius:8px;">⚡ Tapper Manual</button>
        </div>
      `;
      const area = lyricsContainer.querySelector('#v28-tool-area');
      lyricsContainer.querySelector('#v28-save-plain').addEventListener('click', () => {
        const txt = area.value.trim();
        if(txt) {
          tempUnsavedLyrics = null; saveToCache(id, 'plain', txt, true);
          updateStatusUI(id, getFullCache()); processLyricData('plain', txt, id, true);
          api.showNotification("Teks manual berhasil disimpan!");
        }
      });
      lyricsContainer.querySelector('#v28-build-sync').addEventListener('click', () => {
        const txt = area.value.trim();
        if(!txt) return alert("Tempel teks liriknya terlebih dahulu!");
        activateTapperEngine(id, txt);
      });
    }

    function activateTapperEngine(id, rawText) {
      const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      let idx = 0; let results = [];

      lyricsContainer.innerHTML = `
        <div style="font-size:12px; color:var(--accent2); font-weight:700; margin-top: 30px; margin-bottom:10px;">🎧 MODE KETUK MANUAL</div>
        <div style="background:rgba(0,0,0,0.4); padding:16px; border-radius:12px; margin-bottom:14px; font-size:14px; text-align:left;">
          <div style="color:#fbbf24; font-weight:700; margin-bottom:6px;" id="v28-tap-cur">${lines[0] || '-'}</div>
          <div style="color:var(--muted); font-size:12px;" id="v28-tap-nxt">Selanjutnya: ${lines[1] || '(Selesai)'}</div>
        </div>
        <button id="v28-tap-trigger" style="width:100%; padding:18px; background:var(--accent); color:white; border:none; border-radius:14px; font-weight:700; font-size:14px; cursor:pointer; font-family:inherit;">🎯 KETUK PAS KALIMAT DIATAS BERBUNYI</button>
        <div style="margin-top:12px; margin-bottom: 20px;"><button id="v28-tap-batal" class="btn" style="font-size:11px; padding:4px 10px;">Batal</button></div>
      `;

      const cur = lyricsContainer.querySelector('#v28-tap-cur');
      const nxt = lyricsContainer.querySelector('#v28-tap-nxt');
      
      lyricsContainer.querySelector('#v28-tap-trigger').addEventListener('click', () => {
        if (idx < lines.length) {
          const t = api.getAudio().currentTime;
          const m = String(Math.floor(t / 60)).padStart(2, '0');
          const s = String((t % 60).toFixed(2)).padStart(5, '0');
          results.push(`[${m}:${s}]${lines[idx]}`); idx++;
          if (idx < lines.length) { cur.textContent = lines[idx]; nxt.textContent = `Selanjutnya: ${lines[idx+1] || '(Selesai)'}`; } 
          else {
            const finalLRC = results.join('\n'); tempUnsavedLyrics = null;
            saveToCache(id, 'synced', finalLRC, true); updateStatusUI(id, getFullCache());
            processLyricData('synced', finalLRC, id, true); api.showNotification("Lirik manual berhasil disinkronkan!");
          }
        }
      });
      lyricsContainer.querySelector('#v28-tap-batal').addEventListener('click', () => showAlternativeTools(id));
    }

    function parseLRC(lrcText) {
      syncedData = [];
      const regex = /\[(\d+):(\d+)(?:\.(\d+))?\](.*)/;
      lrcText.split('\n').forEach(line => {
        const match = line.match(regex);
        if (match) {
          const m = parseInt(match[1]);
          const s = parseInt(match[2]);
          const msStr = match[3] ? match[3].substring(0, 3).padEnd(3, '0') : '0';
          const ms = parseInt(msStr);
          const time = (m * 60) + s + (ms / 1000);
          const text = match[4].trim();
          if (text) syncedData.push({ time, text });
        }
      });
      syncedData.sort((a, b) => a.time - b.time); 
      isSynced = syncedData.length > 0;
    }

    function renderLRC() {
      if (!lyricsContainer) return;
      const linesHTML = syncedData.map((line, idx) => {
        return `<div id="v28-lrc-line-${idx}" style="transition: color 0.25s ease, transform 0.25s ease, text-shadow 0.25s ease; color: rgba(255,255,255,0.28); padding: 8px 0; font-weight: 500; transform: scale(0.96); font-family:inherit; will-change: transform, color, text-shadow;">${line.text || '♪'}</div>`;
      }).join('');

      const spacerHeight = lyricsContainer.clientHeight ? (lyricsContainer.clientHeight / 2) - 20 : 150;
      lyricsContainer.innerHTML = `<div style="height: ${spacerHeight}px;"></div>${linesHTML}<div style="height: ${spacerHeight}px;"></div>`;
    }

    // SEKTOR 4: DYNAMIC TURBO SCROLL DURATION MAPPED FROM SLIDER
    function turboScrollTo(element, targetTop, duration) {
      if (activeScrollAnimation) cancelAnimationFrame(activeScrollAnimation);
      const startTop = element.scrollTop;
      const distance = targetTop - startTop;
      let startTime = null;

      function animate(currentTime) {
        if (!startTime) startTime = currentTime;
        const timeElapsed = currentTime - startTime;
        const progress = Math.min(timeElapsed / duration, 1);
        const ease = progress * (2 - progress); 
        element.scrollTop = startTop + (distance * ease);

        if (timeElapsed < duration) activeScrollAnimation = requestAnimationFrame(animate);
        else activeScrollAnimation = null;
      }
      activeScrollAnimation = requestAnimationFrame(animate);
    }

    const audio = api.getAudio();
    
    audio.addEventListener('play', () => {
        const state = api.getState();
        if (state.currentIndex !== -1 && state.playlist[state.currentIndex].id !== currentSongId) {
            // Reset pengunci overwrite saat perpindahan lagu manual
            searchInputUserEdited = false;
            loadLyricsForCurrentSong();
        }
    });

    // TIMELINE CORE ENGINE UPGRADE (SEKTOR 1 RUMUS DELAY LINIER STATIS)
    audio.addEventListener('timeupdate', () => {
      if (!isSynced || syncedData.length === 0 || !lyricsContainer) return;
      
      // Rumus internal Sektor 1: Waktu_Tampil_Lirik = Stempel_LRC_Asli + Total_Delay_Aktif
      // Atau ekuivalen: Teks aktif dirender saat audio.currentTime >= Stempel_LRC_Asli + Total_Delay_Aktif
      // Berarti nilai waktu audio ter-evaluasi = audio.currentTime - Total_Delay_Aktif
      const evaluationTime = audio.currentTime - getTotalDelay();
      const speed = audio.playbackRate || 1.0; 
      let activeIdx = -1;

      for (let i = 0; i < syncedData.length; i++) {
        let targetTime = syncedData[i].time;

        // KALKULASI ANTISIPASI JEDA BAWAAN
        if (currentAnticipatePct !== 0 && i > 0) {
        const gap = targetTime - (syncedData[i-1].time + activeDelay);
        if (gap > 0.8) {
        // Menghitung kompensasi detik berdasarkan persentase positif/negatif
        let anticipationSeconds = gap * (currentAnticipatePct / 200);
    
        // Pembatasan aman agar visual pergerakan lirik tetap terkendali
        if (currentAnticipatePct > 0) {
        const maxCap = Math.min(3.0, gap - 0.2);
       anticipationSeconds = Math.min(anticipationSeconds, maxCap);
       } else {
       // Jika minus, batasi penundaan maksimal mundur 3 detik agar tidak terlalu jauh melompat
        anticipationSeconds = Math.max(-3.0, anticipationSeconds);
     }
    
      targetTime = targetTime - anticipationSeconds;
      }
    }

        if (evaluationTime >= targetTime) {
          activeIdx = i;
        } else {
          break;
        }
      }

      if (activeIdx !== lastActiveIdx && activeIdx !== -1) {
        if (lastActiveIdx !== -1) {
          const oldEl = document.getElementById(`v28-lrc-line-${lastActiveIdx}`);
          if (oldEl) { 
            oldEl.style.color = 'rgba(255,255,255,0.28)'; 
            oldEl.style.transform = 'scale(0.96)';
            oldEl.style.fontWeight = '500'; 
            oldEl.style.textShadow = 'none';
          }
        }
        
        const newEl = document.getElementById(`v28-lrc-line-${activeIdx}`);
        if (newEl) {
          newEl.style.color = 'var(--accent2)'; 
          newEl.style.transform = 'scale(1.05)'; 
          newEl.style.fontWeight = '700';
          newEl.style.textShadow = '0 2px 12px rgba(6,182,212,0.3)'; 
          
          if (!isUserScrolling) {
            const targetScrollTop = newEl.offsetTop - (lyricsContainer.clientHeight / 2) + (newEl.clientHeight / 2);
            
            // Konversi matematis Sektor 4: Toleransi Kelembutan % ke Durasi Animasi (ms)
            // 0% = 50ms (Sangat instan/tajam), 100% = 350ms (Sangat lembut/halus)
            let dynamicDuration = 50 + (currentScrollSmoothness / 100) * 300;
            turboScrollTo(lyricsContainer, targetScrollTop, dynamicDuration); 
          }
        }
        lastActiveIdx = activeIdx;
      }
    });
    
    // Inisialisasi awal server list dropdown & penarikan data lirik pertama
    loadServerSelectorOptions();
    updateStorageUI();
    loadLyricsForCurrentSong();
  }
});