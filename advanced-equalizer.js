/**
 * Plugin Name: Advanced Equalizer
 * Description: Fully customizable multi-band graphic equalizer using Web Audio API BiquadFilterNodes.
 */
(function() {
  const pluginDef = {
    id: "advanced-equalizer",
    name: "Advanced Equalizer Plugin",
    version: "1.0.0",
    init: function(appApi) {
      console.log("Advanced Equalizer Plugin initialized!");
      
      let audioCtx = null;
      let source = null;
      let filters = [];
      
      // Define standard 7-band frequency bands
      const bands = [
        { f: 60,   type: 'lowshelf', q: 1.0, label: '60Hz' },
        { f: 150,  type: 'peaking',  q: 1.0, label: '150Hz' },
        { f: 400,  type: 'peaking',  q: 1.0, label: '400Hz' },
        { f: 1000, type: 'peaking',  q: 1.0, label: '1kHz' },
        { f: 3000, type: 'peaking',  q: 1.0, label: '3kHz' },
        { f: 8000, type: 'peaking',  q: 1.0, label: '8kHz' },
        { f: 15000,type: 'highshelf',q: 1.0, label: '15kHz' }
      ];

      // Track current gain values locally to persist state across UI redraws if needed
      const currentGains = bands.map(() => 0);

      function setupAudioGraph() {
        if (audioCtx) return; // Already initialized

        const audioEl = appApi.getAudio();
        if (!audioEl) return;

        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          audioCtx = new AudioContext();
          source = audioCtx.createMediaElementSource(audioEl);

          // Create filters for each frequency band
          let lastNode = source;
          filters = bands.map((band, idx) => {
            const filter = audioCtx.createBiquadFilter();
            filter.type = band.type;
            filter.frequency.value = band.f;
            filter.Q.value = band.q;
            filter.gain.value = currentGains[idx]; // apply stored gain

            lastNode.connect(filter);
            lastNode = filter;
            return filter;
          });

          // Connect the last filter to output speakers
          lastNode.connect(audioCtx.destination);
        } catch (e) {
          console.error("Advanced Equalizer: Failed to setup Web Audio API graph", e);
        }
      }

      function updateGain(index, val) {
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        
        currentGains[index] = val;
        if (filters[index]) {
          filters[index].gain.value = val;
        }
      }

      // Add custom UI control panel in the sidebar via appApi
      appApi.addPluginPanel("advanced-eq-panel", "🎛️ Equalizer Advanced", function(container) {
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "12px";

        const desc = document.createElement("div");
        desc.style.fontSize = "12px";
        desc.style.color = "var(--muted)";
        desc.textContent = "Geser slider di bawah untuk mengatur frekuensi audio sesuka hatimu:";
        container.appendChild(desc);

        // Grid container for sliders
        const slidersContainer = document.createElement("div");
        slidersContainer.style.display = "flex";
        slidersContainer.style.flexDirection = "column";
        slidersContainer.style.gap = "8px";

        bands.forEach((band, idx) => {
          // Individual Band Row
          const row = document.createElement("div");
          row.style.display = "flex";
          row.style.alignItems = "center";
          row.style.gap = "10px";

          // Label
          const lbl = document.createElement("div");
          lbl.style.width = "50px";
          lbl.style.fontSize = "12px";
          lbl.style.fontWeight = "bold";
          lbl.style.color = "var(--text)";
          lbl.textContent = band.label;

          // Slider Input
          const slider = document.createElement("input");
          slider.type = "range";
          slider.min = "-12";
          slider.max = "12";
          slider.step = "1";
          slider.value = currentGains[idx];
          slider.style.flex = "1";
          slider.style.accentColor = "var(--accent2)";

          // Value Indicator
          const valIndicator = document.createElement("div");
          valIndicator.style.width = "40px";
          valIndicator.style.textAlign = "right";
          valIndicator.style.fontSize = "11px";
          valIndicator.style.color = "var(--muted)";
          valIndicator.textContent = (currentGains[idx] >= 0 ? '+' : '') + currentGains[idx] + ' dB';

          // Event Listener
          slider.addEventListener("input", () => {
            setupAudioGraph();
            const val = parseInt(slider.value, 10);
            updateGain(idx, val);
            valIndicator.textContent = (val >= 0 ? '+' : '') + val + ' dB';
          });

          row.appendChild(lbl);
          row.appendChild(slider);
          row.appendChild(valIndicator);
          slidersContainer.appendChild(row);
        });

        container.appendChild(slidersContainer);

        // Reset Button
        const resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.textContent = "🔄 Reset Ke Flat (0 dB)";
        resetBtn.style.width = "100%";
        resetBtn.style.padding = "8px";
        resetBtn.style.fontSize = "12px";
        resetBtn.style.borderRadius = "10px";
        resetBtn.style.border = "1px solid var(--border)";
        resetBtn.style.background = "rgba(239,68,68,0.1)";
        resetBtn.style.color = "var(--text)";
        resetBtn.style.cursor = "pointer";
        resetBtn.style.transition = "0.2s";

        resetBtn.addEventListener("click", () => {
          setupAudioGraph();
          const inputs = slidersContainer.querySelectorAll('input[type="range"]');
          const indicators = slidersContainer.querySelectorAll('div:last-child');
          
          bands.forEach((_, idx) => {
            updateGain(idx, 0);
            if (inputs[idx]) inputs[idx].value = 0;
            if (indicators[idx]) indicators[idx].textContent = '0 dB';
          });
        });

        container.appendChild(resetBtn);
      });
    }
  };

  if (window.MusicPlugins) {
    window.MusicPlugins.register(pluginDef);
  }
})();
