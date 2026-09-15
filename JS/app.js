const $ = (id) => document.getElementById(id);

const els = {
  display: $('timerDisplay'),
  remaining: $('remainingLabel'),
  cycle: $('cycleLabel'),
  completed: $('completedLabel'),
  badge: $('phaseBadge'),
  progressBar: $('progressBar'),
  progressWrap: $('progressWrap'),
  btnStart: $('btnStart'),
  btnPause: $('btnPause'),
  btnStop: $('btnStop'),
  btnReset: $('btnReset'),
  workInput: $('workMinutes'),
  breakInput: $('breakMinutes'),
  btnApply: $('btnApply'),
  presetClassic: $('presetClassic'),
  presetLong: $('presetLong'),
  toast: $('cycleToast'),
  toastBody: $('toastBody'),
};

const DEFAULT_WORK_SEC = 25 * 60;
const DEFAULT_BREAK_SEC = 5 * 60;

const state = {
  mode: 'work', // 'work' | 'break'
  status: 'idle', // 'idle' | 'running' | 'paused' | 'stopped'
  workSec: DEFAULT_WORK_SEC,
  breakSec: DEFAULT_BREAK_SEC,
  remainingSec: DEFAULT_WORK_SEC,
  cycle: 1,
  completedPomodoros: 0,
  intervalId: null,
  endAt: null,
};

let audioCtx = null;
let toastInstance = null;

const formatHHMMSS = (totalSec) => {
  if (!Number.isFinite(totalSec)) return '00:00:00';
  const s = Math.max(0, Math.ceil(totalSec));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
};

const totalForMode = () => (state.mode === 'work' ? state.workSec : state.breakSec);

const showToast = (message) => {
  els.toastBody.textContent = message;
  try {
    if (window.bootstrap) {
      toastInstance ??= new bootstrap.Toast(els.toast, { delay: 5000 });
      toastInstance.show();
    }
  } catch { /* toast non disponibile: il testo resta comunque nel DOM */ }
};

const ensureAudio = () => {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* audio non disponibile: ignora */ }
};

// Campanella sintetizzata: 3 rintocchi, nessun file esterno.
const playBell = () => {
  try {
    ensureAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    [0, 0.5, 1.0].forEach((offset) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.5, now + offset + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.45);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.5);
    });
  } catch { /* ignora errori audio */ }
};

const render = () => {
  const text = formatHHMMSS(state.remainingSec);
  els.display.textContent = text;
  els.remaining.textContent = text;
  document.title = `${text} — Easy Pomodoro`;

  const modeLabel = state.mode === 'work' ? 'Lavoro' : 'Riposo';
  els.cycle.textContent = `Ciclo ${state.cycle} — ${modeLabel}`;
  els.completed.textContent = String(state.completedPomodoros);

  const statusLabel =
    state.status === 'running' ? modeLabel.toUpperCase()
      : state.status === 'paused' ? 'IN PAUSA'
        : state.status === 'stopped' ? 'FERMO' : modeLabel.toUpperCase();
  els.badge.textContent = statusLabel;
  els.badge.className =
    `badge fs-6 mb-3 ${state.mode === 'work' ? 'text-bg-danger' : 'text-bg-success'}`;

  document.body.classList.toggle('phase-work', state.mode === 'work');
  document.body.classList.toggle('phase-break', state.mode === 'break');

  const total = totalForMode();
  const elapsed = total - state.remainingSec;
  const pct = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
  els.progressBar.style.width = `${pct}%`;
  els.progressWrap.setAttribute('aria-valuenow', String(Math.round(pct)));

  els.btnStart.disabled = state.status === 'running';
  els.btnPause.disabled = state.status !== 'running';
  els.btnStop.disabled = state.status !== 'running' && state.status !== 'paused';
};

const stopTick = () => {
  if (state.intervalId !== null) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  state.endAt = null;
};

const tick = () => {
  if (state.endAt === null) return;
  state.remainingSec = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
  if (state.remainingSec <= 0) {
    onPhaseEnd();
    return;
  }
  render();
};

// Fine ciclo: suono + toast, passaggio manuale alla fase dopo (resta in attesa di Start).
const onPhaseEnd = () => {
  stopTick();
  state.status = 'idle';
  playBell();

  if (state.mode === 'work') {
    state.completedPomodoros += 1;
    showToast(`Ciclo ${state.cycle} di lavoro finito! Premi Start per la pausa.`);
    state.mode = 'break';
    state.remainingSec = state.breakSec;
  } else {
    showToast(`Pausa finita! Premi Start per iniziare il ciclo ${state.cycle + 1} di lavoro.`);
    state.mode = 'work';
    state.cycle += 1;
    state.remainingSec = state.workSec;
  }
  render();
};

const start = () => {
  if (state.status === 'running') return;
  ensureAudio();
  stopTick();
  if (state.remainingSec <= 0) state.remainingSec = totalForMode();
  state.status = 'running';
  state.endAt = Date.now() + state.remainingSec * 1000;
  state.intervalId = setInterval(tick, 250);
  render();
};

const pause = () => {
  if (state.status !== 'running' || state.endAt === null) return;
  state.remainingSec = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
  stopTick();
  state.status = 'paused';
  render();
};

const stop = () => {
  if (state.status !== 'running' && state.status !== 'paused') return;
  if (state.status === 'running' && state.endAt !== null) {
    state.remainingSec = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
  }
  stopTick();
  state.status = 'stopped';
  render();
};

const reset = () => {
  stopTick();
  state.mode = 'work';
  state.status = 'idle';
  state.cycle = 1;
  state.completedPomodoros = 0;
  state.remainingSec = state.workSec;
  render();
};

const readDurations = () => {
  const workMin = Number.parseInt(els.workInput.value, 10);
  const breakMin = Number.parseInt(els.breakInput.value, 10);
  return { workMin, breakMin };
};

const applyDurations = () => {
  if (state.status === 'running') {
    showToast('Ferma il timer prima di cambiare le durate.');
    return;
  }
  const { workMin, breakMin } = readDurations();
  if (!Number.isFinite(workMin) || workMin < 1 || workMin > 180 ||
    !Number.isFinite(breakMin) || breakMin < 1 || breakMin > 60) {
    showToast('Inserisci durate valide: lavoro 1–180 min, riposo 1–60 min.');
    return;
  }
  state.workSec = workMin * 60;
  state.breakSec = breakMin * 60;
  reset();
  showToast(`Durate aggiornate: ${workMin} min lavoro / ${breakMin} min riposo.`);
};

const applyPreset = (workMin, breakMin) => {
  if (state.status === 'running') {
    showToast('Ferma il timer prima di cambiare preset.');
    return;
  }
  els.workInput.value = String(workMin);
  els.breakInput.value = String(breakMin);
  state.workSec = workMin * 60;
  state.breakSec = breakMin * 60;
  reset();
  showToast(`Preset applicato: ${workMin}/${breakMin}. Premi Start.`);
};

els.btnStart.addEventListener('click', start);
els.btnPause.addEventListener('click', pause);
els.btnStop.addEventListener('click', stop);
els.btnReset.addEventListener('click', reset);
els.btnApply.addEventListener('click', applyDurations);
els.presetClassic.addEventListener('click', () => applyPreset(25, 5));
els.presetLong.addEventListener('click', () => applyPreset(50, 10));

// Inizializzazione: parte sempre dal lavoro (25:00).
reset();
