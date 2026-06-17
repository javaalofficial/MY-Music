/**
 * Beat Arrow Game v2
 * - Adaptive beat detection (bass + mid + onset)
 * - Hold notes (garis panjang)
 * - Song selector bawaan
 * - 4 difficulty modes
 * - End-screen score breakdown + bintang
 * - Mobile responsive + haptic + ripple effect
 */
(function () {

window.MusicPlugins.register({
  id: 'beat-arrow-game-v2',
  name: 'Beat Arrow Game v2',
  init: function (api) {

    /* ═══════════════════════════════════
       KONSTANTA
    ═══════════════════════════════════ */
    var LANES       = 4;
    var ICONS       = ['◀','▼','▲','▶'];
    var KEYS        = ['ArrowLeft','ArrowDown','ArrowUp','ArrowRight'];
    var COLORS      = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff'];
    var ARROW_R     = 0.115;   // radius arrow sebagai fraksi laneW
    var HIT_FRAC    = 0.82;    // posisi hitbar (fraksi H)

    var DIFF = {
      easy:   { label:'😊 Mudah',          cooldown:480, holdChance:0.12, doubleChance:0.08, thr:0.014, perfect:36, great:62, good:90 },
      medium: { label:'😐 Sedang',         cooldown:320, holdChance:0.22, doubleChance:0.18, thr:0.013, perfect:28, great:52, good:78 },
      hard:   { label:'😤 Tinggi',         cooldown:210, holdChance:0.32, doubleChance:0.30, thr:0.012, perfect:22, great:40, good:62 },
      insane: { label:'💀 Apa Kau Yakin?', cooldown:130, holdChance:0.45, doubleChance:0.50, thr:0.010, perfect:16, great:28, good:46 }
    };

    /* ═══════════════════════════════════
       STATE
    ═══════════════════════════════════ */
    var canvas, ctx, W, H, hitY, laneW;
    var running     = false;
    var gameEnded   = false;
    var diffKey     = 'medium';
    var D           = DIFF[diffKey];

    var arrows      = [];   // { lane, y, hit, missed, isHold, holdLen, holding, holdProgress }
    var score       = 0;
    var combo       = 0;
    var maxCombo    = 0;
    var counts      = { perfect:0, great:0, good:0, miss:0, wrong:0 };
    var hitFX       = [];
    var ratingFX    = null;
    var ripples     = [];   // efek ripple tap mobile
    var rafId       = null;
    var gameStartTS = 0;
    var totalNotes  = 0;

    /* audio */
    var audioCtx    = null;
    var analyser    = null;
    var srcNode     = null;
    var lastSpawn   = 0;
    var beatHistory = [];   // riwayat interval antar beat untuk BPM
    var lastBeatTS  = 0;
    var adaptThr    = 0.015;
    var adaptCooldown = 320; // BPM-adaptive cooldown, diupdate tiap beat
    var currentSpeed  = 5.0; // kecepatan target saat ini (di-lerp halus ke note baru)
    var energyAvg   = 0;
    var ENERGY_ALPHA= 0.08;

    /* hold tracking */
    var holdingLane = [false,false,false,false];
    var holdStartY  = [0,0,0,0];

    /* lane press visual */
    var lanePressed = [false,false,false,false];

    /* DOM refs */
    var scoreEl, comboEl, missEl;
    var startBtn, diffBtns={};
    var songSel;
    var laneBtns = [];
    var endScreen;

    /* ═══════════════════════════════════
       BUILD UI
    ═══════════════════════════════════ */
    api.addPluginPanel('beat-v2-panel', '🎮 Beat Arrow Game v2', function (root) {
      root.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px;';

      /* ── Song selector ── */
      var selWrap = document.createElement('div');
      selWrap.style.cssText = 'display:flex;gap:6px;align-items:center;width:100%;';
      var selLbl = document.createElement('span');
      selLbl.textContent = '🎵';
      selLbl.style.fontSize = '16px';
      songSel = document.createElement('select');
      songSel.style.cssText =
        'flex:1;padding:7px 10px;font-size:12px;border-radius:8px;' +
        'background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);' +
        'color:#eaf1ff;font-family:inherit;';
      selWrap.appendChild(selLbl);
      selWrap.appendChild(songSel);
      root.appendChild(selWrap);

      function refreshSongs() {
        var st = api.getState(), pl = st.playlist || [];
        songSel.innerHTML = pl.length
          ? pl.map(function(s,i){
              var shortName = s.name.length > 8 ? s.name.slice(0,8)+'..' : s.name;
              return '<option value="'+i+'"'+(st.currentIndex===i?' selected':'')+'>'+
                (i+1)+'. '+shortName+'</option>';
            }).join('')
          : '<option value="">(Belum ada lagu — tambahkan di tab Lagu)</option>';
      }
      refreshSongs();

      songSel.addEventListener('change', function () {
        if (running) stopGame();
        var idx = parseInt(songSel.value, 10);
        if (!isNaN(idx) && typeof api.playTrack === 'function') {
          api.playTrack(idx);
          resetGame(true);
        }
      });

      /* ── Difficulty selector ── */
      var diffWrap = document.createElement('div');
      diffWrap.style.cssText = 'display:flex;gap:5px;width:100%;flex-wrap:wrap;';
      ['easy','medium','hard','insane'].forEach(function(dk){
        var db = document.createElement('button');
        db.type = 'button';
        db.textContent = DIFF[dk].label;
        db.style.cssText =
          'flex:1;padding:7px 4px;font-size:11px;font-weight:600;border-radius:8px;cursor:pointer;' +
          'border:2px solid transparent;background:rgba(255,255,255,.05);' +
          'color:#8fa8c8;font-family:inherit;transition:.15s;white-space:nowrap;';
        db.addEventListener('click', function(){
          diffKey = dk; D = DIFF[dk];
          Object.keys(diffBtns).forEach(function(k){
            diffBtns[k].style.borderColor  = 'transparent';
            diffBtns[k].style.background   = 'rgba(255,255,255,.05)';
            diffBtns[k].style.color        = '#8fa8c8';
          });
          db.style.borderColor = dk==='insane' ? '#ef4444' : '#6c63ff';
          db.style.background  = dk==='insane' ? 'rgba(239,68,68,.18)' : 'rgba(108,99,255,.22)';
          db.style.color       = '#fff';
          if (running) { stopGame(); resetGame(true); }
        });
        diffBtns[dk] = db;
        diffWrap.appendChild(db);
      });
      diffBtns['medium'].click();
      root.appendChild(diffWrap);

      /* ── Score bar ── */
      var scoreBar = document.createElement('div');
      scoreBar.style.cssText =
        'display:flex;gap:0;justify-content:stretch;width:100%;' +
        'background:rgba(0,0,0,.25);border-radius:10px;overflow:hidden;' +
        'border:1px solid rgba(255,255,255,.08);';

      function mkStat(label, color) {
        var w = document.createElement('div');
        w.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;padding:6px 2px;';
        var v = document.createElement('div');
        v.style.cssText = 'font-size:15px;font-weight:700;color:'+color+';';
        v.textContent = '0';
        var l = document.createElement('div');
        l.style.cssText = 'font-size:9px;color:#8fa8c8;margin-top:1px;';
        l.textContent = label;
        w.appendChild(v); w.appendChild(l);
        return {wrap:w, val:v};
      }
      scoreEl = mkStat('SCORE','#fff');
      comboEl = mkStat('COMBO','#ffd93d');
      missEl  = mkStat('MISS','#ff6b6b');
      scoreBar.appendChild(scoreEl.wrap);
      scoreBar.appendChild(comboEl.wrap);
      scoreBar.appendChild(missEl.wrap);
      root.appendChild(scoreBar);

      /* ── Canvas ── */
      canvas = document.createElement('canvas');
      canvas.style.cssText =
        'border-radius:12px;border:1px solid rgba(255,255,255,.1);' +
        'touch-action:none;display:block;width:100%;max-width:420px;' +
        'box-shadow:0 4px 24px rgba(0,0,0,.5);';
      root.appendChild(canvas);

      function resize() {
        var mw = Math.min((root.offsetWidth||340), 420);
        W = mw; H = Math.round(W * 1.4);
        canvas.width = W; canvas.height = H;
        hitY  = Math.round(H * HIT_FRAC);
        laneW = W / LANES;
        ctx   = canvas.getContext('2d');
      }
      resize();
      window.addEventListener('resize', resize);

      /* ── Control row ── */
      var ctrlRow = document.createElement('div');
      ctrlRow.style.cssText = 'display:flex;gap:8px;width:100%;';

      startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.textContent = '▶ Mulai';
      startBtn.style.cssText =
        'flex:1;padding:11px;font-size:13px;font-weight:700;border-radius:10px;cursor:pointer;' +
        'border:none;background:#6c63ff;color:#fff;font-family:inherit;transition:.15s;';

      var resetBtnEl = document.createElement('button');
      resetBtnEl.type = 'button';
      resetBtnEl.textContent = '↺';
      resetBtnEl.title = 'Reset';
      resetBtnEl.style.cssText =
        'padding:11px 15px;font-size:15px;border-radius:10px;cursor:pointer;' +
        'border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);' +
        'color:#eaf1ff;font-family:inherit;';

      ctrlRow.appendChild(startBtn);
      ctrlRow.appendChild(resetBtnEl);
      root.appendChild(ctrlRow);

      /* ── Lane tap buttons (mobile) ── */
      var laneRow = document.createElement('div');
      laneRow.style.cssText =
        'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;width:100%;';

      for (var li = 0; li < LANES; li++) {
        (function(idx){
          var lb = document.createElement('button');
          lb.type = 'button';
          lb.textContent = ICONS[idx];
          lb.style.cssText =
            'padding:14px 0;font-size:22px;border-radius:12px;cursor:pointer;user-select:none;' +
            'border:2px solid '+COLORS[idx]+'55;background:'+COLORS[idx]+'15;' +
            'color:'+COLORS[idx]+';font-family:inherit;position:relative;overflow:hidden;' +
            '-webkit-tap-highlight-color:transparent;transition:transform .08s,box-shadow .08s;';

          function doPress(e) {
            if (e) e.preventDefault();
            if (!running) return;
            lanePressed[idx] = true;
            lb.style.background  = COLORS[idx]+'44';
            lb.style.transform   = 'scale(.92)';
            lb.style.boxShadow   = '0 0 14px '+COLORS[idx]+'99';
            /* ripple */
            var rect = lb.getBoundingClientRect();
            var rx = (e && e.touches ? e.touches[0].clientX : rect.left + rect.width/2) - rect.left;
            var ry = (e && e.touches ? e.touches[0].clientY : rect.top + rect.height/2) - rect.top;
            ripples.push({ x: idx*laneW + laneW/2, y: hitY, r:0, maxR:laneW*0.8,
                           color:COLORS[idx], alpha:0.7 });
            pressLane(idx, false);
          }
          function doRelease(e) {
            if (e) e.preventDefault();
            lanePressed[idx] = false;
            lb.style.background  = COLORS[idx]+'15';
            lb.style.transform   = 'scale(1)';
            lb.style.boxShadow   = 'none';
            if (running) releaseLane(idx);
          }

          lb.addEventListener('touchstart',  doPress,   {passive:false});
          lb.addEventListener('touchend',    doRelease, {passive:false});
          lb.addEventListener('touchcancel', doRelease, {passive:false});
          lb.addEventListener('mousedown',   doPress);
          lb.addEventListener('mouseup',     doRelease);
          lb.addEventListener('mouseleave',  doRelease);

          laneBtns.push(lb);
          laneRow.appendChild(lb);
        })(li);
      }
      root.appendChild(laneRow);

      /* ── End screen overlay ── */
      endScreen = document.createElement('div');
      endScreen.style.cssText =
        'display:none;flex-direction:column;align-items:center;gap:10px;width:100%;' +
        'background:rgba(8,14,30,.96);border:1px solid rgba(255,255,255,.12);' +
        'border-radius:14px;padding:20px 16px;';
      root.appendChild(endScreen);

      /* ── Keyboard ── */
      document.addEventListener('keydown', function(e){
        if (e.code === 'Space') { e.preventDefault(); running ? stopGame() : startGame(); return; }
        var i = KEYS.indexOf(e.code);
        if (i !== -1) { e.preventDefault(); pressLane(i, false); }
      });
      document.addEventListener('keyup', function(e){
        var i = KEYS.indexOf(e.code);
        if (i !== -1) { e.preventDefault(); releaseLane(i); }
      });

      startBtn.addEventListener('click', function(){ running ? stopGame() : startGame(); });
      resetBtnEl.addEventListener('click', function(){ resetGame(false); });

      var _audioEl = api.getAudio();
      if (_audioEl) {
        _audioEl.addEventListener('ended', function(){ if(running) endGame(); });
        _audioEl.addEventListener('pause', function(){ if(running) stopGame(); });
      }

      rafId = requestAnimationFrame(drawFrame);
      api.showNotification('🎮 Beat Arrow Game v2 siap di tab Extra!');
    });

    /* ═══════════════════════════════════
       AUDIO & BEAT DETECTION
    ═══════════════════════════════════ */
    function setupAudio() {
      if (!audioCtx) {
        try {
          audioCtx = new (window.AudioContext||window.webkitAudioContext)();
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0.7;
        } catch(e) { return false; }
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var ael = api.getAudio();
      if (ael && !srcNode) {
        try {
          srcNode = audioCtx.createMediaElementSource(ael);
          srcNode.connect(analyser);
          analyser.connect(audioCtx.destination);
        } catch(e) {}
      }
      return true;
    }

    function getEnergy() {
      if (!analyser) return { bass:0, mid:0, total:0 };
      var buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      var bass=0, mid=0, high=0;
      var N = buf.length;
      /* bass: bin 0-10% | mid: 10-40% | high: 40-70% */
      var bEnd = Math.floor(N*0.10);
      var mEnd = Math.floor(N*0.40);
      var hEnd = Math.floor(N*0.70);
      for (var i=0;i<bEnd;i++)      bass += buf[i];
      for (var i=bEnd;i<mEnd;i++)   mid  += buf[i];
      for (var i=mEnd;i<hEnd;i++)   high += buf[i];
      bass /= (bEnd*255); mid /= ((mEnd-bEnd)*255); high /= ((hEnd-mEnd)*255);
      /* jazz: lebih sensitif ke mid & high */
      var total = bass*0.5 + mid*0.35 + high*0.15;
      return { bass:bass, mid:mid, high:high, total:total };
    }

    function estimateBPM() {
      if (beatHistory.length < 4) return 120;
      var intervals = [];
      for (var i=1;i<beatHistory.length;i++)
        intervals.push(beatHistory[i]-beatHistory[i-1]);
      intervals.sort(function(a,b){return a-b;});
      var med = intervals[Math.floor(intervals.length/2)];
      return Math.min(Math.max(Math.round(60000/med), 60), 200);
    }

    /* ═══════════════════════════════════
       SPAWN LOGIC
    ═══════════════════════════════════ */
    function trySpawn(ts) {
      var e = getEnergy();
      /* cooldown dulu — kalau belum waktunya, langsung keluar */
      if (ts - lastSpawn < adaptCooldown) return;
      /* threshold statis per difficulty; tidak pakai adaptive agar note terus muncul */
      if (e.total < D.thr) return;

      /* hitung BPM untuk cooldown adaptif */
      if (lastBeatTS > 0) beatHistory.push(ts - lastBeatTS);
      if (beatHistory.length > 12) beatHistory.shift();
      lastBeatTS = ts;
      lastSpawn  = ts;

      var bpm = estimateBPM();
      /* sesuaikan cooldown ke BPM — simpan untuk pengecekan berikutnya */
      var bpmCool = Math.max(D.cooldown * 0.6, (60000/bpm) * 0.7);
      lastSpawn = ts;
      adaptCooldown = bpmCool;

      /* Hitung target speed dari BPM: note harus melewati hitY dalam ~2 beat */
      var beatFrames   = (60000/bpm) / 16.67;
      var targetSpeed  = Math.min(Math.max(hitY / (beatFrames * 2.0), 3.0), 13.0);

      /* Lerp halus: currentSpeed mendekati targetSpeed 20% per beat
         — note baru pakai currentSpeed, note lama tidak berubah sama sekali */
      currentSpeed = currentSpeed + (targetSpeed - currentSpeed) * 0.20;

      spawnNote(e);

      /* double note */
      if (Math.random() < D.doubleChance) {
        var usedLane = arrows.length ? arrows[arrows.length-1].lane : -1;
        var l2;
        do { l2 = Math.floor(Math.random()*LANES); } while(l2===usedLane);
        spawnNote(e, l2);
      }
    }

    function spawnNote(e, forceLane) {
      var lane = forceLane !== undefined ? forceLane : Math.floor(Math.random()*LANES);
      var isHold = Math.random() < D.holdChance;
      /* panjang hold: lebih panjang kalau mid/high energy tinggi (jazz) */
      var holdLen = isHold
        ? Math.round(H*(0.12 + (e.mid+e.high)*0.25 + Math.random()*0.12))
        : 0;
      /* Insane: pakai currentSpeed apa adanya (chaos).
         Lainnya: tiap note beku di kecepatan saat di-spawn — tidak berubah lagi. */
      var spd = currentSpeed;
      arrows.push({
        lane:lane, y:-ARROW_R*laneW,
        hit:false, missed:false,
        isHold:isHold, holdLen:holdLen,
        holding:false, holdProgress:0,
        holdScore:0,
        speed: spd
      });
      totalNotes++;
    }

    /* ═══════════════════════════════════
       INPUT
    ═══════════════════════════════════ */
    function pressLane(laneIdx, fromKey) {
      if (!running) return;
      /* cari arrow terbaik */
      var best=-1, bestDist=Infinity;
      for (var i=0;i<arrows.length;i++) {
        var candidate=arrows[i];
        if (candidate.hit||candidate.missed||candidate.lane!==laneIdx) continue;
        var d=Math.abs(candidate.y-hitY);
        if (d < D.good+25 && d < bestDist) { bestDist=d; best=i; }
      }

      if (best===-1) {
        counts.wrong++; combo=0; updateScore(); return;
      }

      var dist = Math.abs(arrows[best].y - hitY);
      var ar   = arrows[best];

      if (ar.isHold) {
        /* mulai hold */
        ar.holding = true;
        holdingLane[laneIdx] = true;
        holdStartY[laneIdx]  = ar.y;
        flashFX(laneIdx, COLORS[laneIdx]);
        ratingFX = { text:'HOLD!', color:COLORS[laneIdx], alpha:1.2, y:hitY-30 };
        return;
      }

      var rating, pts, col;
      if (dist < D.perfect)      { rating='PERFECT'; pts=100; col='#ffd93d'; }
      else if (dist < D.great)   { rating='GREAT';   pts=60;  col='#6bcb77'; }
      else if (dist < D.good)    { rating='GOOD';    pts=30;  col='#4d96ff'; }
      else { counts.wrong++; combo=0; updateScore(); return; }

      ar.hit = true;
      counts[rating.toLowerCase()]++;
      combo++; if(combo>maxCombo) maxCombo=combo;
      score += pts + Math.floor(combo/5)*5;
      updateScore();
      flashFX(laneIdx, col);
      ratingFX = { text:rating+(combo>=10?' x'+combo:''), color:col, alpha:1.2, y:hitY-30 };
      if(navigator.vibrate) navigator.vibrate(rating==='PERFECT'?[20]:[10]);
    }

    function releaseLane(laneIdx) {
      if (!holdingLane[laneIdx]) return;
      holdingLane[laneIdx] = false;
      /* cari hold note yang sedang di-hold di lane ini */
      for (var i=0;i<arrows.length;i++) {
        var holdAr=arrows[i];
        if (holdAr.lane===laneIdx && holdAr.isHold && holdAr.holding) {
          holdAr.holding = false;
          /* kalau sudah cukup jauh, berikan score */
          if (holdAr.holdProgress > 0.6) {
            var bonus = Math.round(holdAr.holdProgress*80);
            score += bonus;
            holdAr.hit = true;
            counts.perfect++;
            combo++; if(combo>maxCombo) maxCombo=combo;
            ratingFX = { text:'HOLD! +'+bonus, color:'#ffd93d', alpha:1.4, y:hitY-30 };
          } else {
            holdAr.missed = true;
            counts.miss++; combo=0;
            ratingFX = { text:'BREAK!', color:'#ef4444', alpha:1.2, y:hitY-30 };
          }
          updateScore();
          break;
        }
      }
    }

    /* ═══════════════════════════════════
       DRAW
    ═══════════════════════════════════ */
    function drawFrame(ts) {
      if (!ctx) { rafId=requestAnimationFrame(drawFrame); return; }
      ctx.clearRect(0,0,W,H);

      /* background */
      var bg = ctx.createLinearGradient(0,0,0,H);
      bg.addColorStop(0,'#080e1e'); bg.addColorStop(1,'#0d1828');
      ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

      /* lane lines */
      for (var i=1;i<LANES;i++) {
        ctx.strokeStyle='rgba(255,255,255,.05)';
        ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(i*laneW,0); ctx.lineTo(i*laneW,H); ctx.stroke();
      }

      /* lane glow saat ditekan */
      for (var l=0;l<LANES;l++) {
        if (lanePressed[l]) {
          var g=ctx.createLinearGradient(l*laneW,0,l*laneW,H);
          g.addColorStop(0,'transparent');
          g.addColorStop(0.7,COLORS[l]+'18');
          g.addColorStop(1,COLORS[l]+'44');
          ctx.fillStyle=g; ctx.fillRect(l*laneW,0,laneW,H);
        }
      }


      /* hit bar */
      ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(0,hitY); ctx.lineTo(W,hitY); ctx.stroke();

      /* target circles */
      for (var l=0;l<LANES;l++) {
        var cx=l*laneW+laneW/2, ar=laneW*ARROW_R;
        /* outer ring */
        ctx.strokeStyle=COLORS[l]+(lanePressed[l]?'cc':'44');
        ctx.lineWidth=lanePressed[l]?3:1.5;
        ctx.beginPath(); ctx.arc(cx,hitY,ar,0,Math.PI*2); ctx.stroke();
        /* inner fill */
        ctx.fillStyle=COLORS[l]+(lanePressed[l]?'33':'11');
        ctx.beginPath(); ctx.arc(cx,hitY,ar,0,Math.PI*2); ctx.fill();
        /* icon */
        ctx.fillStyle=COLORS[l]+(lanePressed[l]?'ff':'77');
        ctx.font='bold '+Math.round(ar*1.1)+'px system-ui';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(ICONS[l],cx,hitY);
      }

      /* spawn */
      if (running) trySpawn(ts||performance.now());

      /* update & draw arrows */
      for (var ai=arrows.length-1;ai>=0;ai--) {
        var ar=arrows[ai];
        if (ar.hit && !ar.isHold) { arrows.splice(ai,1); continue; }
        /* note selalu bergerak, termasuk saat di-hold */
        ar.y += ar.speed;

        /* hold in progress: progress = seberapa jauh kepala melewati hitY */
        if (ar.isHold && ar.holding) {
          /* holdProgress = fraksi dari holdLen yang sudah "terlampaui" setelah hitY */
          var pastHit = ar.y - hitY;
          ar.holdProgress = Math.min(1, Math.max(0, pastHit / ar.holdLen));
          /* auto-complete saat kepala sudah melewati seluruh holdLen */
          if (ar.holdProgress >= 1) {
            var bonus = 80;
            score += bonus;
            ar.hit = true; ar.holding = false;
            holdingLane[ar.lane] = false;
            counts.perfect++;
            combo++; if(combo>maxCombo) maxCombo=combo;
            ratingFX = { text:'HOLD! +'+bonus, color:'#ffd93d', alpha:1.4, y:hitY-30 };
            updateScore();
          }
        }

        /* miss check */
        if (ar.y > H+60) {
          if (!ar.hit && !ar.missed) {
            counts.miss++; combo=0; updateScore();
            ar.missed=true;
          }
          arrows.splice(ai,1); continue;
        }

        drawNote(ar);
      }

      /* ripple effects */
      ripples = ripples.filter(function(r){ return r.alpha>0; });
      ripples.forEach(function(r){
        ctx.strokeStyle = r.color+Math.round(r.alpha*255).toString(16).padStart(2,'0');
        ctx.lineWidth   = 2;
        ctx.beginPath(); ctx.arc(r.x,r.y,r.r,0,Math.PI*2); ctx.stroke();
        r.r     += laneW*0.06;
        r.alpha -= 0.055;
      });

      /* hit FX */
      hitFX = hitFX.filter(function(f){ return f.alpha>0; });
      hitFX.forEach(function(f){
        var lx=f.lane*laneW, gr=ctx.createRadialGradient(lx+laneW/2,hitY,0,lx+laneW/2,hitY,laneW);
        gr.addColorStop(0,f.color+Math.round(f.alpha*255).toString(16).padStart(2,'0'));
        gr.addColorStop(1,'transparent');
        ctx.fillStyle=gr; ctx.fillRect(lx,hitY-laneW,laneW,laneW*2);
        f.alpha -= 0.07;
      });

      /* rating text */
      if (ratingFX) {
        ratingFX.y    -= 1.3;
        ratingFX.alpha-= 0.022;
        if (ratingFX.alpha>0) {
          ctx.globalAlpha=Math.min(1,ratingFX.alpha);
          ctx.fillStyle=ratingFX.color;
          ctx.font='bold '+Math.round(W*0.062)+'px system-ui';
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.shadowColor=ratingFX.color; ctx.shadowBlur=10;
          ctx.fillText(ratingFX.text,W/2,ratingFX.y);
          ctx.shadowBlur=0; ctx.globalAlpha=1;
        } else ratingFX=null;
      }

      /* paused overlay */
      if (!running && !gameEnded) {
        ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(0,0,W,H);
        ctx.fillStyle='#fff';
        ctx.font='bold '+Math.round(W*0.065)+'px system-ui';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('TAP ▶ UNTUK MULAI',W/2,H/2);
        if (score>0) {
          ctx.font=Math.round(W*0.038)+'px system-ui';
          ctx.fillStyle='#aac';
          ctx.fillText('Score: '+score+'  Combo: x'+maxCombo,W/2,H/2+Math.round(W*0.1));
        }
      }

      rafId = requestAnimationFrame(drawFrame);
    }

    function drawNote(ar) {
      var cx = ar.lane*laneW + laneW/2;
      var r  = laneW*ARROW_R;
      var c  = COLORS[ar.lane];

      if (ar.isHold) {
        /* ── HOLD NOTE: batang panjang ── */
        /* kepala (ar.y) bergerak ke bawah; ekor ada di ar.y - ar.holdLen */
        var topY  = ar.y - ar.holdLen;
        var botY  = ar.y;
        /* saat di-hold, gambar hanya bagian yang belum terlampaui (di atas hitY) */
        var drawTop = topY;
        var drawBot = ar.holding ? Math.min(botY, hitY) : botY;
        var hw    = r*0.55;

        /* bayangan glow */
        ctx.shadowColor=c; ctx.shadowBlur=10;

        if (drawBot > drawTop) {
          /* batang hold */
          var grd = ctx.createLinearGradient(0,drawTop,0,drawBot);
          grd.addColorStop(0,c+'33');
          grd.addColorStop(0.4,c+'99');
          grd.addColorStop(1,c+'cc');
          ctx.fillStyle=grd;
          var rx=cx-hw, rw=hw*2;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(rx,drawTop,rw,drawBot-drawTop,hw) : ctx.rect(rx,drawTop,rw,drawBot-drawTop);
          ctx.fill();
        }

        /* progress fill saat holding — warna solid di bagian yang sudah terlampaui */
        if (ar.holding && ar.holdProgress>0) {
          ctx.fillStyle=c+'88';
          ctx.fillRect(cx-hw, topY, hw*2, (botY-topY)*ar.holdProgress);
        }

        /* kepala hold */
        ctx.strokeStyle=c; ctx.lineWidth=2.5;
        ctx.beginPath(); ctx.arc(cx,ar.y,r,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle=c+'44';
        ctx.beginPath(); ctx.arc(cx,ar.y,r,0,Math.PI*2); ctx.fill();

        ctx.fillStyle=c;
        ctx.font='bold '+Math.round(r*1.1)+'px system-ui';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(ICONS[ar.lane],cx,ar.y);
        ctx.shadowBlur=0;

      } else {
        /* ── TAP NOTE ── */
        ctx.shadowColor=c; ctx.shadowBlur=12;
        ctx.strokeStyle=c; ctx.lineWidth=2.5;
        ctx.beginPath(); ctx.arc(cx,ar.y,r,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle=c+'33';
        ctx.beginPath(); ctx.arc(cx,ar.y,r,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=c;
        ctx.font='bold '+Math.round(r*1.1)+'px system-ui';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(ICONS[ar.lane],cx,ar.y);
        ctx.shadowBlur=0;
      }
    }

    /* ═══════════════════════════════════
       FX HELPERS
    ═══════════════════════════════════ */
    function flashFX(laneIdx, color) {
      hitFX.push({ lane:laneIdx, alpha:1.0, color:color });
      ripples.push({ x:laneIdx*laneW+laneW/2, y:hitY, r:laneW*0.2,
                     maxR:laneW*0.9, color:color, alpha:0.8 });
    }

    function updateScore() {
      scoreEl.val.textContent = score;
      comboEl.val.textContent = 'x'+combo;
      missEl.val.textContent  = counts.miss;
      comboEl.val.style.color = combo>=20?'#ffd93d':combo>=10?'#6bcb77':'#fff';
    }

    /* ═══════════════════════════════════
       GAME FLOW
    ═══════════════════════════════════ */
    function startGame() {
      var ael = api.getAudio();
      /* Kalau ada track terpilih di selector, coba putar dulu */
      var selIdx = songSel ? parseInt(songSel.value, 10) : NaN;
      if (!isNaN(selIdx) && ael && ael.paused) {
        /* coba resume/play audio, lanjut mulai game setelah play */
        var playPromise = ael.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise.then(function() { _doStart(); }).catch(function() {
            api.showNotification('Gagal memutar audio!');
          });
          return;
        }
      }
      if (!ael) { api.showNotification('Belum ada lagu!'); return; }
      _doStart();
    }
    function _doStart() {
      setupAudio();
      running=true; gameEnded=false;
      if (gameStartTS===0) gameStartTS=performance.now();
      startBtn.textContent='⏸ Jeda';
      startBtn.style.background='#444';
      endScreen.style.display='none';
    }

    function stopGame() {
      running=false;
      startBtn.textContent='▶ Lanjut';
      startBtn.style.background='#6c63ff';
    }

    function endGame() {
      running=false; gameEnded=true;
      startBtn.textContent='▶ Mulai';
      startBtn.style.background='#6c63ff';
      showEndScreen();
    }

    function resetGame(silent) {
      stopGame();
      arrows=[];score=0;combo=0;maxCombo=0;
      counts={perfect:0,great:0,good:0,miss:0,wrong:0};
      hitFX=[];ratingFX=null;ripples=[];
      totalNotes=0; gameStartTS=0; gameEnded=false;
      beatHistory=[]; lastSpawn=0; lastBeatTS=0; energyAvg=0; adaptCooldown=D.cooldown; currentSpeed=5.0;
      holdingLane=[false,false,false,false];
      updateScore();
      endScreen.style.display='none';
      startBtn.textContent='▶ Mulai';
      startBtn.style.background='#6c63ff';
      if (!silent) api.showNotification('Game direset!');
    }

    /* ═══════════════════════════════════
       END SCREEN
    ═══════════════════════════════════ */
    function calcStars() {
      var total = counts.perfect+counts.great+counts.good+counts.miss+counts.wrong;
      if (!total) return 0;
      var acc = (counts.perfect*100+counts.great*60+counts.good*30) /
                (total*100);
      if (acc>=0.96 && counts.miss===0 && counts.wrong===0) return 5;
      if (acc>=0.88 && counts.miss<=2)  return 4;
      if (acc>=0.72)                    return 3;
      if (acc>=0.50)                    return 2;
      return 1;
    }

    function showEndScreen() {
      endScreen.innerHTML='';
      endScreen.style.display='flex';

      var stars=calcStars();
      var starsEl=document.createElement('div');
      starsEl.style.cssText='font-size:32px;letter-spacing:4px;';
      for(var i=0;i<5;i++)
        starsEl.textContent += i<stars ? '⭐' : '☆';

      var titleEl=document.createElement('div');
      titleEl.style.cssText='font-size:18px;font-weight:700;color:#fff;';
      titleEl.textContent = ['','😓 Perlu Latihan','👍 Lumayan','🔥 Bagus!','⭐ Keren!','💎 PERFECT!'][stars];

      var scoreTitle=document.createElement('div');
      scoreTitle.style.cssText='font-size:22px;font-weight:800;color:#ffd93d;';
      scoreTitle.textContent='Score: '+score;

      /* tabel breakdown */
      var tbl=document.createElement('div');
      tbl.style.cssText='width:100%;display:flex;flex-direction:column;gap:5px;';

      var rows=[
        {label:'✨ Perfect', val:counts.perfect, color:'#ffd93d'},
        {label:'💚 Great',   val:counts.great,   color:'#6bcb77'},
        {label:'💙 Good',    val:counts.good,    color:'#4d96ff'},
        {label:'❌ Miss',    val:counts.miss,    color:'#ef4444'},
        {label:'⚡ Wrong',   val:counts.wrong,   color:'#f97316'},
        {label:'🔥 Max Combo',val:maxCombo,      color:'#ff6b6b'},
      ];
      rows.forEach(function(row){
        var r=document.createElement('div');
        r.style.cssText=
          'display:flex;justify-content:space-between;align-items:center;' +
          'padding:6px 12px;background:rgba(255,255,255,.04);border-radius:8px;';
        var l=document.createElement('span');
        l.style.cssText='font-size:12px;color:#aac;';
        l.textContent=row.label;
        var v=document.createElement('span');
        v.style.cssText='font-size:14px;font-weight:700;color:'+row.color+';';
        v.textContent=row.val;
        r.appendChild(l); r.appendChild(v); tbl.appendChild(r);
      });

      var diffLbl=document.createElement('div');
      diffLbl.style.cssText='font-size:11px;color:#8fa8c8;';
      diffLbl.textContent='Kesulitan: '+DIFF[diffKey].label;

      var playAgain=document.createElement('button');
      playAgain.type='button';
      playAgain.textContent='↺ Main Lagi';
      playAgain.style.cssText=
        'width:100%;padding:11px;font-size:13px;font-weight:700;border-radius:10px;' +
        'border:none;background:#6c63ff;color:#fff;cursor:pointer;font-family:inherit;';
      playAgain.addEventListener('click',function(){ resetGame(false); });

      endScreen.appendChild(starsEl);
      endScreen.appendChild(titleEl);
      endScreen.appendChild(scoreTitle);
      endScreen.appendChild(tbl);
      endScreen.appendChild(diffLbl);
      endScreen.appendChild(playAgain);
    }

  } /* end init */
});

})();

     