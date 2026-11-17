// Synthesised sound: no audio files, everything is made with WebAudio.
// Engine hum, sirens, gunshots, crashes, pickups and mission jingles.
// Everything is guarded: with no AudioContext the game stays silent.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;

  function init() {
    if (ctx !== null) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: a sawtooth through a low-pass, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a square wave that swaps between two notes.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch (e) {
      ctx = null;
    }
  }

  function noiseBurst(duration, volume, filterFreq) {
    if (!ctx || muted) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function blip(freq, duration, volume, type) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  return {
    init,
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** 0..1 engine load; 0 silences the hum. */
    engine(load) {
      if (!ctx || !engineGain) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(muted ? 0 : 0.06 + load * 0.1, t, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + load * 140, t, 0.08);
      engineFilter.frequency.setTargetAtTime(280 + load * 900, t, 0.1);
    },
    /** Call every frame with whether any siren should wail. */
    siren(on, dt) {
      if (!ctx || !sirenGain) return;
      sirenTimer -= dt;
      if (sirenTimer <= 0) {
        sirenTimer = 0.42;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 960 : 720, ctx.currentTime, 0.02);
      }
      sirenGain.gain.setTargetAtTime(on && !muted ? 0.045 : 0, ctx.currentTime, 0.15);
    },
    shot() {
      noiseBurst(0.12, 0.5, 1800);
    },
    punch() {
      noiseBurst(0.08, 0.35, 700);
    },
    crash(strength) {
      noiseBurst(0.18, Math.min(0.6, 0.2 + strength * 0.4), 500);
    },
    pickup() {
      blip(880, 0.12, 0.25);
      setTimeout(() => blip(1320, 0.14, 0.22), 70);
    },
    phone() {
      blip(1040, 0.1, 0.2, 'square');
      setTimeout(() => blip(1040, 0.1, 0.2, 'square'), 160);
    },
    click() {
      blip(660, 0.06, 0.15);
    },
    missionPass() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 0.25), i * 110));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.25, 0.22, 'triangle'), i * 140));
    },
    busted() {
      [440, 415, 392, 370].forEach((f, i) => setTimeout(() => blip(f, 0.3, 0.2, 'triangle'), i * 160));
    },
  };
}
