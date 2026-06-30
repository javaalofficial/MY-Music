window.MusicPlugins.register({
  id: 'pro-audio-downloader-v1',
  name: '📥 Master Audio Downloader (Multi-API Engine)',
  init: function(api) {
    // --- STATE MANAGEMENT ---
    let activeTab = 'search';
    let customAPIs = [];
    let selectedDownloadItem = null; // Menyimpan objek trek yang siap divalidasi
    let previewPlayer = new Audio(); // Player terpisah agar tidak mengganggu musik utama
    
    const STORAGE_CUSTOM_API_KEY = 'mp_downloader_custom_apis_v1';
    
    // Sinkronisasi Custom API dari LocalStorage
    try {
      const saved = localStorage.getItem(STORAGE_CUSTOM_API_KEY);
      if (saved) customAPIs = JSON.parse(saved);
    } catch(e) { customAPIs = []; }

    // --- SUNTIKAN STYLE CSS (Luxury UI/UX Theme Sync) ---
    const styleTag = document.createElement('style');
    styleTag.textContent = `
      .dl-panel-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 12px; }
      .dl-tab-btn { flex: 1; padding: 8px; font-size: 11px; font-weight: 600; border-radius: 8px; border: 1px solid var(--border); background: rgba(255,255,255,0.02); color: var(--muted); cursor: pointer; transition: all 0.2s; text-align: center; }
      .dl-tab-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
      .dl-tab-content { display: none; flex-direction: column; gap: 10px; }
      .dl-tab-content.active { display: flex; }
      .dl-input-group { display: flex; flex-direction: column; gap: 4px; }
      .dl-input-group label { font-size: 11px; font-weight: 600; color: var(--muted); }
      .dl-row { display: flex; gap: 8px; align-items: center; }
      .dl-card-list { display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 6px; border-radius: 8px; border: 1px solid var(--border); }
      .dl-item-row { display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; gap: 8px; transition: background 0.15s; }
      .dl-item-row:hover { background: rgba(255,255,255,0.06); }
      .dl-item-info { flex: 1; min-width: 0; }
      .dl-item-title { font-size: 12px; font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dl-item-sub { font-size: 10px; color: var(--muted); }
      .dl-validation-box { background: rgba(6, 182, 212, 0.06); border: 1px solid rgba(6, 182, 212, 0.25); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; margin-top: 6px; }
      .dl-duplicate-warn { background: rgba(251, 191, 36, 0.12); border: 1px solid rgba(251, 191, 36, 0.3); color: #fef08a; padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 500; }
      .dl-progress-container { background: rgba(0,0,0,0.4); border: 1px solid var(--border); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
      .dl-progress-bar-bg { height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; position: relative; }
      .dl-progress-bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg, var(--accent), var(--accent2)); border-radius: 4px; transition: width 0.1s linear; }
    `;
    document.head.appendChild(styleTag);

    // --- HELPER LOGIKA CORE ENGINE ---
    function checkDuplicateTrack(name) {
      const playlist = api.getState().playlist || [];
      const cleanTarget = name.trim().toLowerCase();
      return playlist.some(function(track) {
        return track.name.trim().toLowerCase() === cleanTarget;
      });
    }

    function getAlbumsList() {
      try {
        return JSON.parse(localStorage.getItem('mp_albums4') || '[]');
      } catch(e) { return []; }
    }

    function saveToAlbum(trackId, albumId) {
      if (!albumId) return;
      try {
        let albums = getAlbumsList();
        let targetAlbum = albums.find(function(a) { return a.id === albumId; });
        if (targetAlbum) {
          if (!targetAlbum.songIds) targetAlbum.songIds = [];
          if (!targetAlbum.songIds.includes(trackId)) {
            targetAlbum.songIds.push(trackId);
            localStorage.setItem('mp_albums4', JSON.stringify(albums));
          }
        }
      } catch(e) { console.error("[Downloader Album Error]", e); }
    }

    function writeToIndexedDB(trackObj) {
      return new Promise(function(resolve, reject) {
        const dbInstance = window.db;
        if (!dbInstance) {
          return reject(new Error("Database IndexedDB aplikasi belum siap."));
        }
        try {
          const tx = dbInstance.transaction('tracks', 'readwrite');
          const store = tx.objectStore('tracks');
          const request = store.add(trackObj);
          
          request.onsuccess = function() { resolve(); };
          request.onerror = function(e) { reject(e.target.error || new Error("Gagal menulis ke store.")); };
        } catch(err) { reject(err); }
      });
    }

    // --- CORE ENGINE DOWNLOADER DENGAN STREAM API PROGRESS BAR ---
    async function executeTrackDownload(item, finalName, targetAlbumId) {
      const progressBox = document.getElementById('dl-active-progress-box');
      const progressFill = document.getElementById('dl-progress-fill');
      const progressText = document.getElementById('dl-progress-text');
      const validationBox = document.getElementById('dl-validation-panel');
      
      if (validationBox) validationBox.style.display = 'none';
      if (progressBox) progressBox.style.display = 'block';
      if (progressText) progressText.textContent = 'Menghubungkan ke server audio...';
      if (progressFill) progressFill.style.width = '0%';

      previewPlayer.pause(); // Pastikan preview mati saat mengunduh

      try {
        const response = await fetch(item.downloadUrl);
        if (!response.ok) throw new Error("Server audio merespon dengan status HTTP " + response.status);

        const contentLength = response.headers.get('Content-Length');
        const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
        
        if (!response.body) {
          throw new Error("Browser Anda tidak mendukung streaming download stream API.");
        }

        const reader = response.body.getReader();
        let receivedBytes = 0;
        let streamChunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          streamChunks.push(value);
          receivedBytes += value.length;

          if (totalBytes > 0) {
            const percentage = Math.round((receivedBytes / totalBytes) * 100);
            if (progressFill) progressFill.style.width = percentage + '%';
            if (progressText) progressText.textContent = `Mengunduh data biner: ${percentage}% (${(receivedBytes/1024/1024).toFixed(1)} MB)`;
          } else {
            if (progressText) progressText.textContent = `Mengunduh data biner: ${(receivedBytes/1024/1024).toFixed(1)} MB (Ukuran tidak diketahui)`;
          }
        }

        if (progressText) progressText.textContent = 'Menyusun berkas biner audio...';
        const audioBlob = new Blob(streamChunks, { type: response.headers.get('Content-Type') || 'audio/mpeg' });
        
        // Membangun struktur track object resmi sesuai arsitektur utama core player
        const uniqueTrackId = 'tr_' + Date.now() + '_' + Math.floor(Math.random() * 1000) + '_' + Math.random().toString(36).slice(2,6);
        const trackObject = {
          id: uniqueTrackId,
          name: finalName.trim(),
          fileBlob: audioBlob,
          duration: null // Biarkan core player mengkalkulasi durasi otomatis saat loadedmetadata pertama kali
        };

        if (progressText) progressText.textContent = 'Mengunci penyimpanan permanen lokal...';
        await writeToIndexedDB(trackObject);

        // Jika user memilih album kustom opsional, simpan relasi ID-nya
        if (targetAlbumId) {
          saveToAlbum(uniqueTrackId, targetAlbumId);
        }

        api.showNotification(`✅ Berhasil menyimpan "${trackObject.name}" ke Track!`);
        if (progressText) progressText.textContent = '⚡ Sinkronisasi sukses! Memuat ulang sistem...';
        
        setTimeout(function() {
          location.reload();
        }, 1000);

      } catch(err) {
        console.error("[Download Blunder Event]", err);
        api.showNotification("Gagal Mengunduh: Terjadi batasan sistem / CORS Blokir.");
        if (progressBox) progressBox.style.display = 'none';
        if (validationBox) validationBox.style.display = 'block';
        alert("⚠️ GAGAL MENGUNDUH AUDIO:\\n\\nKemungkinan besar URL tersebut memblokir koneksi langsung browser (CORS). Solusi: Pastikan URL ramah CORS atau gunakan Custom API Proxy pribadi Anda.");
      }
    }

    // --- INTERFACE BUILDER & TAB PANEL ROUTER ---
    api.addPluginPanel('audio-downloader-pro', '📥 Advanced Audio Downloader', function(container) {
      container.innerHTML = `
        <div class="dl-panel-tabs">
          <button class="dl-tab-btn active" id="dl-tab-btn-search">🔍 Cari API</button>
          <button class="dl-tab-btn" id="dl-tab-btn-link">🔗 Via Tautan</button>
          <button class="dl-tab-btn" id="dl-tab-btn-config">⚙️ Konfigurasi API</button>
        </div>

        <div class="dl-tab-content active" id="dl-content-search">
          <div class="dl-row">
            <div class="dl-input-group" style="flex:1;">
              <label>Pilih Jalur API Engine:</label>
              <select id="dl-api-selector" style="width:100%;"></select>
            </div>
            <div class="dl-input-group" style="width:90px;">
              <label>Kualitas:</label>
              <select id="dl-quality-selector" style="width:100%;">
                <option value="standard">Standard</option>
                <option value="high">High (HQ)</option>
              </select>
            </div>
          </div>
          <div class="dl-row" style="margin-top:4px;">
            <input type="text" id="dl-search-query" placeholder="Ketik judul lagu atau artis..." style="flex:1;" />
            <button class="btn primary" id="dl-search-execute-btn" style="height:35px; padding:0 14px;">Cari</button>
          </div>
          <div id="dl-search-status-hint" style="font-size:11px; color:var(--muted); display:none;"></div>
          <div class="dl-card-list" id="dl-search-results-pool" style="display:none;"></div>
        </div>

        <div class="dl-tab-content" id="dl-content-link">
          <div class="dl-input-group">
            <label>Tempel Tautan Audio Langsung (Direct URL):</label>
            <input type="text" id="dl-direct-link-input" placeholder="https://example.com/audio.mp3" style="width:100%;" />
          </div>
          <button class="btn accent2" id="dl-link-process-btn" style="width:100%; margin-top:4px;">🎯 Proses Tautan Sumber</button>
        </div>

        <div class="dl-tab-content" id="dl-content-config">
          <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:8px; border:1px dashed var(--border); display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:10px; font-weight:700; color:var(--accent2);">➕ DAFTARKAN SERVER PROXY / API KUSTOM</span>
            <input type="text" id="dl-cust-api-name" placeholder="Nama Server (e.g., Lokal Scraper)" class="v29-input-sub" style="background:rgba(0,0,0,0.4); border:1px solid var(--border); padding:6px; font-size:11px; border-radius:6px; color:#fff;" />
            <input type="text" id="dl-cust-api-url" placeholder="Endpoint URL dengan parameter {query}" class="v29-input-sub" style="background:rgba(0,0,0,0.4); border:1px solid var(--border); padding:6px; font-size:11px; border-radius:6px; color:#fff;" />
            <div style="display:flex; gap:4px;">
              <input type="text" id="dl-cust-api-header" placeholder="Auth Header Name (Opsional)" class="v29-input-sub" style="background:rgba(0,0,0,0.4); border:1px solid var(--border); padding:6px; font-size:11px; border-radius:6px; color:#fff; flex:1;" />
              <input type="text" id="dl-cust-api-value" placeholder="Token Value" class="v29-input-sub" style="background:rgba(0,0,0,0.4); border:1px solid var(--border); padding:6px; font-size:11px; border-radius:6px; color:#fff; flex:1;" />
            </div>
            <button class="btn primary" id="dl-cust-api-save-btn" style="font-size:11px; padding:6px;">Simpan API Kustom</button>
          </div>
          <div style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">
            <span style="font-size:11px; font-weight:700; color:var(--muted);">Daftar API Kustom Terdaftar:</span>
            <div id="dl-custom-apis-list-box" style="font-size:11px; color:var(--muted);">Belum ada server kustom.</div>
          </div>
        </div>

        <div class="dl-validation-box" id="dl-validation-panel" style="display:none;">
          <div style="font-size:11px; font-weight:700; color:var(--accent2); border-left:3px solid var(--accent2); padding-left:6px;">🛠️ Validasi & Konfirmasi Rekaman</div>
          
          <div id="dl-duplicate-alert-area" style="display:none;"></div>
          
          <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border); padding:8px; border-radius:8px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
              <span style="font-size:10px; color:var(--muted); font-weight:bold;">🎧 AUDITION TRACK PREVIEW</span>
              <span id="dl-preview-status-text" style="font-size:11px; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Mempersiapkan pratinjau audio...</span>
            </div>
            <button class="btn" id="dl-preview-play-toggle-btn" style="padding:6px 12px; font-size:11px; background:rgba(255,255,255,0.05);">▶️ Putar Preview</button>
          </div>

          <div class="dl-input-group">
            <label>Sesuaikan Kerapian Nama Track:</label>
            <input type="text" id="dl-rename-input" style="width:100%; font-size:12px;" />
          </div>

          <div class="dl-input-group">
            <label>Kelompokkan Langsung ke Album (Opsional):</label>
            <select id="dl-validation-album-selector" style="width:100%; font-size:11px;"></select>
          </div>

          <button class="btn primary" id="dl-final-download-commit-btn" style="width:100%; font-weight:700; margin-top:4px;">📥 Konfirmasi & Masukkan ke Track</button>
        </div>

        <div class="dl-progress-container" id="dl-active-progress-box" style="display:none;">
          <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:bold;">
            <span style="color:var(--accent2);">⚡ DOWNLOAD PROGRESS ENGINE</span>
            <span id="dl-progress-text" style="color:var(--text);">0%</span>
          </div>
          <div class="dl-progress-bar-bg">
            <div class="dl-progress-bar-fill" id="dl-progress-fill"></div>
          </div>
        </div>
      `;

      // --- MAPPING SELEKTOR DOM ---
      const tabBtnSearch = container.querySelector('#dl-tab-btn-search');
      const tabBtnLink = container.querySelector('#dl-tab-btn-link');
      const tabBtnConfig = container.querySelector('#dl-tab-btn-config');
      
      const contentSearch = container.querySelector('#dl-content-search');
      const contentLink = container.querySelector('#dl-content-link');
      const contentConfig = container.querySelector('#dl-content-config');

      const apiSelector = container.querySelector('#dl-api-selector');
      const validationPanel = container.querySelector('#dl-validation-panel');
      const albumSelector = container.querySelector('#dl-validation-album-selector');
      const renameInput = container.querySelector('#dl-rename-input');
      const duplicateAlertArea = container.querySelector('#dl-duplicate-alert-area');
      const previewStatusText = container.querySelector('#dl-preview-status-text');
      const previewPlayToggle = container.querySelector('#dl-preview-play-toggle-btn');

      // --- ENGINE SWITCHER TABS ---
      function switchTab(target) {
        activeTab = target;
        [tabBtnSearch, tabBtnLink, tabBtnConfig].forEach(b => b.classList.remove('active'));
        [contentSearch, contentLink, contentConfig].forEach(c => c.classList.remove('active'));
        
        if (target === 'search') { tabBtnSearch.classList.add('active'); contentSearch.classList.add('active'); }
        if (target === 'link') { tabBtnLink.classList.add('active'); contentLink.classList.add('active'); }
        if (target === 'config') { tabBtnConfig.classList.add('active'); contentConfig.classList.add('active'); }
      }
      
      tabBtnSearch.addEventListener('click', () => switchTab('search'));
      tabBtnLink.addEventListener('click', () => switchTab('link'));
      tabBtnConfig.addEventListener('click', () => { switchTab('config'); renderConfigAPIsList(); });

      // --- RE-RENDER DROPDOWN SELEKTOR SERVER ---
      function refreshApiDropdownOptions() {
        apiSelector.innerHTML = '<option value="default">🌐 Server Utama (iTunes CORS Mirror)</option>';
        customAPIs.forEach(function(srv, idx) {
          apiSelector.innerHTML += `<option value="${idx}">⚡ ${srv.name}</option>`;
        });
      }
      refreshApiDropdownOptions();

      // --- RE-RENDER ALOCATOR DROPDOWN ALBUM ---
      function refreshAlbumDropdownOptions() {
        albumSelector.innerHTML = '<option value="">❌ Tanpa Album (Daftar Utama Pemutar)</option>';
        const albums = getAlbumsList();
        albums.forEach(function(alb) {
          albumSelector.innerHTML += `<option value="${alb.id}">📁 ${alb.name} (${alb.songIds ? alb.songIds.length : 0} lagu)</option>`;
        });
      }

      // --- RE-RENDER LIST CONFIG API ---
      function renderConfigAPIsList() {
        const box = container.querySelector('#dl-custom-apis-list-box');
        if (customAPIs.length === 0) {
          box.innerHTML = 'Belum ada server kustom terdaftar.';
          return;
        }
        box.innerHTML = '';
        customAPIs.forEach(function(srv, idx) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:6px 10px; border-radius:6px; margin-top:4px;';
          row.innerHTML = `
            <div>
              <b style="color:#fff;">${srv.name}</b><br>
              <span style="font-size:9px; opacity:0.6; display:block; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${srv.url}</span>
            </div>
            <button class="btn danger" style="padding:3px 8px; font-size:10px;" id="dl-del-api-${idx}">Hapus</button>
          `;
          box.appendChild(row);
          row.querySelector(`#dl-del-api-${idx}`).addEventListener('click', function() {
            customAPIs.splice(idx, 1);
            localStorage.setItem(STORAGE_CUSTOM_API_KEY, JSON.stringify(customAPIs));
            renderConfigAPIsList();
            refreshApiDropdownOptions();
            api.showNotification("Server kustom berhasil dihapus.");
          });
        });
      }

      // --- TOMBOL SAVE CONFIG API ---
      container.querySelector('#dl-cust-api-save-btn').addEventListener('click', function() {
        const nameIn = container.querySelector('#dl-cust-api-name').value.trim();
        const urlIn = container.querySelector('#dl-cust-api-url').value.trim();
        const headerIn = container.querySelector('#dl-cust-api-header').value.trim();
        const valueIn = container.querySelector('#dl-cust-api-value').value.trim();

        if (!nameIn || !urlIn) {
          alert("Nama Server dan URL Endpoint wajib diisi!");
          return;
        }

        customAPIs.push({ name: nameIn, url: urlIn, authHeader: headerIn, authValue: valueIn });
        localStorage.setItem(STORAGE_CUSTOM_API_KEY, JSON.stringify(customAPIs));
        
        container.querySelector('#dl-cust-api-name').value = '';
        container.querySelector('#dl-cust-api-url').value = '';
        container.querySelector('#dl-cust-api-header').value = '';
        container.querySelector('#dl-cust-api-value').value = '';
        
        renderConfigAPIsList();
        refreshApiDropdownOptions();
        api.showNotification("Server baru berhasil disimpan!");
      });

      // --- INTERMEDIATE HUB TRIGGER: PREVIEW & RE-VALIDATE ---
      function triggerIntermediateValidationStage(item) {
        selectedDownloadItem = item;
        previewPlayer.pause();
        previewPlayer.src = item.previewUrl;
        
        previewStatusText.textContent = "Siap mendengarkan cuplikan preview...";
        previewPlayToggle.textContent = "▶️ Putar Preview";
        
        renameInput.value = item.title;
        refreshAlbumDropdownOptions();

        // Cek Duplikat Real-time
        const isDuplicate = checkDuplicateTrack(item.title);
        if (isDuplicate) {
          duplicateAlertArea.innerHTML = `<div class="dl-duplicate-warn">⚠️ Peringatan: Lagu serupa dengan nama "${item.title}" sudah terdeteksi di dalam pustaka aktif Anda.</div>`;
          duplicateAlertArea.style.display = 'block';
        } else {
          duplicateAlertArea.style.display = 'none';
        }

        validationPanel.style.display = 'flex';
        validationPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // Logic Control Player Preview Audisi Mini
      previewPlayToggle.addEventListener('click', function() {
        if (!selectedDownloadItem) return;
        if (previewPlayer.paused) {
          // Pause musik utama aplikasi agar audio audisi tidak bertabrakan merusak pendengaran
          const mainAudio = api.getAudio();
          if (mainAudio && !mainAudio.paused) {
            mainAudio.pause();
            // Sinkronkan ikon play button utama aplikasi agar status UI sync
            const mainPlayBtn = document.getElementById('playBtn');
            if (mainPlayBtn) mainPlayBtn.textContent = String.fromCodePoint(9654,65039);
            const nowStatus = document.getElementById('nowStatus');
            if (nowStatus) nowStatus.textContent = 'Jeda (Audisi Downloader)';
          }
          
          previewPlayer.play()
            .then(() => {
              previewPlayToggle.textContent = "⏸️ Jeda Preview";
              previewStatusText.textContent = "Sedang memutar pratinjau audio...";
            })
            .catch(e => {
              api.showNotification("Gagal memutar preview. Link tidak dapat diakses langsung.");
              previewStatusText.textContent = "❌ Gagal memutar file preview.";
            });
        } else {
          previewPlayer.pause();
          previewPlayToggle.textContent = "▶️ Putar Preview";
          previewStatusText.textContent = "Pratinjau audio dijeda.";
        }
      });

      previewPlayer.addEventListener('ended', function() {
        previewPlayToggle.textContent = "▶️ Putar Preview";
        previewStatusText.textContent = "Pratinjau audio selesai diputar.";
      });

      // --- LOGIKA PROSES TAB 2: LINK DOWNLOAD ---
      container.querySelector('#dl-link-process-btn').addEventListener('click', function() {
        const urlLink = container.querySelector('#dl-direct-link-input').value.trim();
        if (!urlLink) {
          alert("Silakan masukkan tautan langsung audio terlebih dahulu!");
          return;
        }

        // Guess nama file dari url ujung tautan
        let guessedName = "Track Unduhan Tautan";
        try {
          const parts = urlLink.split('/');
          const lastPart = parts[parts.length - 1].split('?')[0];
          if (lastPart && lastPart.includes('.')) {
            guessedName = lastPart.replace(/\\.[^/.]+$/, "").replace(/%20|_|-/g, " ");
          }
        } catch(e) {}

        const virtualItem = {
          title: guessedName,
          downloadUrl: urlLink,
          previewUrl: urlLink // Pakai link utama sebagai preview
        };

        triggerIntermediateValidationStage(virtualItem);
        api.showNotification("Tautan berhasil diproses! Silakan validasi nama & preview.");
      });

      // --- LOGIKA PROSES TAB 1: PENCARIAN MULTI-SERVER ---
      container.querySelector('#dl-search-execute-btn').addEventListener('click', async function() {
        const query = container.querySelector('#dl-search-query').value.trim();
        if (!query) { alert("Masukkan kata kunci pencarian!"); return; }

        const hint = container.querySelector('#dl-search-status-hint');
        const resultsPool = container.querySelector('#dl-search-results-pool');
        const activeApiVal = apiSelector.value;

        hint.style.display = 'block';
        hint.textContent = '⏳ Membuka gelombang pencarian server...';
        resultsPool.style.display = 'none';
        resultsPool.innerHTML = '';
        validationPanel.style.display = 'none';

        try {
          let itemsList = [];

          if (activeApiVal === "default") {
            // JALUR DEFAULT: Menggunakan iTunes Search API Mirror yang 100% Bebas CORS & Stabil Sedunia
            const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=12`;
            const res = await fetch(searchUrl);
            if (!res.ok) throw new Error("HTTP Status " + res.status);
            const data = await res.json();
            
            if (data && data.results) {
              itemsList = data.results.map(function(track) {
                return {
                  title: (track.artistName ? track.artistName : "Unknown") + " - " + (track.trackName ? track.trackName : "Unknown Track"),
                  subtitle: (track.collectionName ? track.collectionName : "Single") + ` (${(track.trackTimeMillis/1000/60).toFixed(1)} m)`,
                  downloadUrl: track.previewUrl, // Mengunduh aset preview penuh berkas m4a berkadar tinggi
                  previewUrl: track.previewUrl
                };
              });
            }
          } else {
            // JALUR CUSTOM API: Sesuai struktur input konfigurasi pengguna dinamis
            const srv = customAPIs[parseInt(activeApiVal)];
            if (!srv) throw new Error("Konfigurasi server kustom hilang.");
            
            const targetUrl = srv.url.replace("{query}", encodeURIComponent(query));
            const fetchOpts = { method: 'GET', headers: {} };
            if (srv.authHeader && srv.authValue) {
              fetchOpts.headers[srv.authHeader] = srv.authValue;
            }

            const res = await fetch(targetUrl, fetchOpts);
            if (!res.ok) throw new Error("Custom Server Merespon Status HTTP " + res.status);
            const data = await res.json();

            // Smart Parser Multi-Struktur JSON Fleksibel Lintas Skema API
            let rawArray = [];
            if (Array.isArray(data)) rawArray = data;
            else if (data.results && Array.isArray(data.results)) rawArray = data.results;
            else if (data.data && Array.isArray(data.data)) rawArray = data.data;
            else if (typeof data === 'object') rawArray = [data]; // Single object payload fallback

            itemsList = rawArray.map(function(obj) {
              const detectedTitle = obj.title || obj.name || obj.trackName || obj.song || "Unknown Custom Title";
              const detectedArtist = obj.artist || obj.artistName || obj.singer || "";
              const finalTitle = detectedArtist ? `${detectedArtist} - ${detectedTitle}` : detectedTitle;
              
              return {
                title: finalTitle,
                subtitle: obj.album || obj.subtitle || "Custom API Source",
                downloadUrl: obj.url || obj.download || obj.audio || obj.previewUrl || "",
                previewUrl: obj.preview || obj.previewUrl || obj.url || ""
              };
            }).filter(item => item.downloadUrl !== ""); // Buang hasil rusak yang tidak punya url tautan download
          }

          if (itemsList.length === 0) {
            hint.textContent = '❌ Tidak ada hasil yang cocok di database server.';
            return;
          }

          hint.textContent = `✅ Ditemukan ${itemsList.length} hasil dari server.`;
          resultsPool.style.display = 'flex';
          
          itemsList.forEach(function(item) {
            const row = document.createElement('div');
            row.className = 'dl-item-row';
            row.innerHTML = `
              <div class="dl-item-info">
                <div class="dl-item-title">${item.title}</div>
                <div class="dl-item-sub">${item.subtitle}</div>
              </div>
              <button class="btn accent2" style="padding:4px 8px; font-size:11px; font-weight:bold;">Pilih</button>
            `;
            resultsPool.appendChild(row);
            row.addEventListener('click', function() {
              triggerIntermediateValidationStage(item);
            });
          });

        } catch(err) {
          console.error("[Downloader Search Error]", err);
          hint.textContent = '❌ Gagal berkomunikasi dengan server API. Periksa jaringan / CORS.';
        }
      });

      // --- EKSEKUSI AKHIR: HIT COMMIT DOWNLOAD BUTTON ---
      container.querySelector('#dl-final-download-commit-btn').addEventListener('click', function() {
        if (!selectedDownloadItem) return;
        const finalTrackName = renameInput.value.trim();
        if (!finalTrackName) {
          alert("Nama track tidak boleh kosong!");
          return;
        }

        const selectedAlbumId = albumSelector.value || null;
        executeTrackDownload(selectedDownloadItem, finalTrackName, selectedAlbumId);
      });

    });

    console.log("[Plugin Aktif] Downloader Pro Engine v1 Initialized Successfully.");
  }
});