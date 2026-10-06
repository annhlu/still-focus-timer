(() => {
  'use strict';
  let duration = 25 * 60 * 1000;
  let remaining = duration, deadline = 0, running = false, interval = null;
  let audio = null, voices = [], wakeLock = null;
  const time = document.getElementById('time'), status = document.getElementById('status');
  const startButton = document.getElementById('start'), pauseButton = document.getElementById('pause');
  const progress = document.getElementById('progress'), note = document.getElementById('audio-note');
  const durationInput = document.getElementById('duration');
  const durationHint = document.getElementById('duration-hint');
  function render() {
    const seconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(seconds / 60), tail = seconds % 60;
    time.textContent = `${String(minutes).padStart(2, '0')}:${String(tail).padStart(2, '0')}`;
    time.setAttribute('aria-label', `${minutes} minutes ${tail} seconds remaining`);
    progress.style.strokeDashoffset = String(100 * (1 - remaining / duration));
    startButton.disabled = running;
    pauseButton.disabled = !running;
    durationInput.disabled = running;
    durationHint.textContent = running ? 'Pause to change the duration.' : 'Choose 1–180 minutes.';
    document.title = running ? `${time.textContent} · Still` : 'Still — Focus Timer';
  }
  async function prepareAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Audio unavailable');
      audio ||= new AudioContext();
      await audio.resume();
      note.textContent = '';
    } catch { note.textContent = 'Sound is unavailable in this browser. The timer will still finish visually.'; }
  }
  function silence() { for (const voice of voices) { try { voice.stop(); } catch {} } voices = []; }
  function bowl() {
    if (!audio || audio.state !== 'running') {
      note.textContent = 'Your session is complete. Sound was paused by your browser.';
      return;
    }
    silence();
    const now = audio.currentTime;
    // Soft inharmonic partials and long decays give a struck singing bowl its warmth.
    [[220, .14, 10], [222, .045, 9], [594, .045, 7], [1168, .018, 4], [1778, .006, 3]].forEach(([frequency, level, decay]) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(level, now + .055);
      gain.gain.exponentialRampToValueAtTime(.0001, now + decay);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(now); oscillator.stop(now + decay + .1);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      voices.push(oscillator);
    });
  }
  async function holdScreen() {
    try {
      if (running && document.visibilityState === 'visible' && navigator.wakeLock) {
        const lock = await navigator.wakeLock.request('screen');
        if (!running) await lock.release(); else wakeLock = lock;
      }
    } catch {}
  }
  function releaseScreen() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
  function tick() {
    if (!running) return;
    remaining = Math.max(0, deadline - Date.now());
    if (remaining === 0) {
      running = false; clearInterval(interval); releaseScreen();
      status.textContent = 'A moment well spent'; bowl();
    }
    render();
  }
  function start() {
    if (running) return;
    if (!applyDuration()) return;
    if (remaining <= 0) remaining = duration;
    silence(); void prepareAudio();
    running = true; deadline = Date.now() + remaining;
    status.textContent = 'Time to focus';
    interval = setInterval(tick, 200); void holdScreen(); render();
  }
  function pause() {
    if (!running) return;
    tick(); if (!running) return;
    running = false; clearInterval(interval); releaseScreen();
    status.textContent = 'Take your time'; render();
  }
  function reset() {
    running = false; clearInterval(interval); remaining = duration;
    durationInput.value = String(duration / 60000);
    durationInput.setCustomValidity('');
    silence(); releaseScreen(); note.textContent = '';
    status.textContent = 'Ready when you are'; render();
  }
  function applyDuration() {
    const minutes = Number(durationInput.value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
      durationInput.setCustomValidity('Enter a whole number from 1 to 180.');
      durationInput.reportValidity();
      return false;
    }
    durationInput.setCustomValidity('');
    const nextDuration = minutes * 60 * 1000;
    if (nextDuration !== duration) {
      duration = nextDuration;
      reset();
    }
    return true;
  }
  durationInput.addEventListener('input', () => durationInput.setCustomValidity(''));
  durationInput.addEventListener('change', applyDuration);
  durationInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && applyDuration()) durationInput.blur();
  });
  startButton.addEventListener('click', start);
  pauseButton.addEventListener('click', pause);
  document.getElementById('reset').addEventListener('click', reset);
  document.addEventListener('visibilitychange', () => { if (running) { tick(); void holdScreen(); } });
  const context = document.modelContext;
  if (context?.registerTool) {
    const lifecycle = new AbortController();
    const tool = {
      name: 'control_focus_timer', title: 'Control focus timer',
      description: 'Start, pause, or reset the visible focus timer, or read its current state.',
      inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['start','pause','reset','read'] } }, required: ['action'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || Object.keys(input).some(key => key !== 'action') || !['start','pause','reset','read'].includes(input.action)) throw new Error('Choose start, pause, reset, or read.');
        if (input.action === 'start') start();
        if (input.action === 'pause') pause();
        if (input.action === 'reset') reset();
        tick(); return { running, secondsRemaining: Math.ceil(remaining / 1000) };
      }
    };
    try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {}
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  }
  render();
})();
