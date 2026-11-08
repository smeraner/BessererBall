import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './style.css';
import { BallWorld, appearance, STEP_MS } from './physics.js';
import { BallView } from './view.js';
import { GameAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const icons = {
  sound: '<path d="m11 4-5 4H3v8h3l5 4z"/><path d="M15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14"/>',
  muted: '<path d="m11 4-5 4H3v8h3l5 4z"/><path d="m16 9 5 6m0-6-5 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 0 1 4.9.5c0 2-2.5 2-2.5 4m0 3h.01"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  restart: '<path d="M3 10a9 9 0 1 1 2.5 8M3 4v6h6"/>',
  drop: '<path d="M12 3v13m-5-5 5 5 5-5M5 21h14"/>',
  trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0zM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v6m-4 2h8"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const storage = {
  get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* Play continues when storage is unavailable. */ } },
};
function formatPoints(points) {
  if (points < 10000000n) return points.toLocaleString('de-DE');
  const digits = points.toString();
  if (digits.length > 15) return `${digits[0]},${digits.slice(1, 3)} × 10${toSuperscript(digits.length - 1)}`;
  const power = Math.floor((digits.length - 1) / 3);
  const divisor = 1000n ** BigInt(power);
  const integer = points / divisor;
  const decimal = (points % divisor) * 10n / divisor;
  return `${integer},${decimal} ${['', 'Tsd.', 'Mio.', 'Mrd.', 'Bio.'][power]}`;
}
function toSuperscript(number) { return String(number).replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]); }

const storedBest = storage.get('besserer-ball.best', '0');
let best = /^\d{1,2000}$/.test(storedBest) ? BigInt(storedBest) : 0n;
const audio = new GameAudio(storage.get('besserer-ball.sound', 'off') === 'on');
let view;
let userPaused = false;
let modalOpen = false;
let aim = 0.5;
let accumulator = 0;
let previousTime = 0;
let messageUntil = 0;
let pointer = null;
const heldKeys = new Set();
const surfaceBounds = $('game-surface').getBoundingClientRect();
const world = new BallWorld({
  // Use a wider tub on short laptop displays and a taller one on phones.
  initialHeight: Math.max(260, Math.min(620, (surfaceBounds.height - 142) / Math.max(180, surfaceBounds.width - 66) * 460)),
  onMerge(event) {
    view?.mergeEffect(event, formatPoints(event.points));
    audio.merge(event.tier);
    updateStats();
    if (event.tier > highestShown) {
      highestShown = event.tier;
      showMessage(`Stufe ${event.tier + 1}! ${appearance(event.tier).name} — und es geht noch größer.`, 3600);
    }
  },
  onGrow() { showMessage('Mehr Platz für große Ideen. Deine Wanne wächst mit!', 4200); },
});
let highestShown = 0;

function paintBall(element, tier) {
  const palette = appearance(tier);
  element.style.setProperty('--ball-color', palette.color);
  element.style.setProperty('--ball-light', palette.light);
  element.style.setProperty('--ball-dark', palette.dark);
}
function updateStats() {
  $('score').textContent = formatPoints(world.score);
  $('score').classList.toggle('compact', world.score >= 100000n);
  $('score').title = `${world.score.toLocaleString('de-DE')} Punkte`;
  $('score').classList.remove('score-bump');
  void $('score').offsetWidth;
  $('score').classList.add('score-bump');
  if (world.score > best) {
    best = world.score;
    storage.set('besserer-ball.best', best.toString());
  }
  $('best-score').textContent = formatPoints(best);
  $('best-score').title = `${best.toLocaleString('de-DE')} Punkte`;
  const palette = appearance(world.largestTier);
  paintBall($('largest-ball'), world.largestTier);
  const size = Math.min(91, 66 + world.largestTier * 4);
  $('largest-ball').style.width = $('largest-ball').style.height = `${size}px`;
  $('largest-name').textContent = palette.name;
  $('largest-level').textContent = world.largestTier === 0 ? 'Stufe 1 · Alles beginnt klein' : `Stufe ${world.largestTier + 1} · Weiter nach oben`;
  for (const ball of $('journey-balls').children) {
    ball.classList.toggle('unlocked', Number(ball.dataset.tier) <= world.largestTier);
    ball.classList.toggle('current', Number(ball.dataset.tier) === world.largestTier);
  }
}
function showMessage(text, duration) {
  $('board-message').textContent = text;
  $('board-message').classList.add('accent');
  messageUntil = world.time + duration;
}
function updateSound() {
  $('sound-button').innerHTML = icon(audio.enabled ? 'sound' : 'muted');
  $('sound-button').setAttribute('aria-label', audio.enabled ? 'Ton ausschalten' : 'Ton einschalten');
  $('sound-button').setAttribute('aria-pressed', String(audio.enabled));
  $('sound-button').title = audio.enabled ? 'Ton ausschalten' : 'Ton einschalten';
}
function updatePause() {
  $('pause-overlay').hidden = !userPaused || modalOpen;
  $('pause-button').innerHTML = icon(userPaused ? 'play' : 'pause');
  $('pause-button').setAttribute('aria-label', userPaused ? 'Spiel fortsetzen' : 'Spiel pausieren');
  $('pause-button').title = userPaused ? 'Weiterspielen (P)' : 'Pause (P)';
  $('drop-button').disabled = userPaused || modalOpen || !view;
  heldKeys.clear();
  pointer = null;
  accumulator = 0;
}
function setPaused(value) { userPaused = value; updatePause(); }
function drop() {
  if (userPaused || modalOpen || !view) return;
  audio.unlock();
  if (world.drop(aim)) {
    audio.drop();
    if (world.dropCount === 1) showMessage('Wunderbar! Triff jetzt die gleiche Farbe.', 3400);
  }
}
function openDialog(id) {
  if (!view) return;
  modalOpen = true;
  updatePause();
  $(id).showModal();
}
function closeDialog(id) { $(id).close(); }
function restart() {
  world.reset();
  view.reset();
  aim = 0.5;
  highestShown = 0;
  messageUntil = 0;
  $('board-message').textContent = 'Neuer Anfang. Neue Möglichkeiten.';
  $('board-message').classList.remove('accent');
  updateStats();
  userPaused = false;
  closeDialog('restart-dialog');
}

async function start() {
  $('help-button').innerHTML = icon('help');
  $('restart-button').innerHTML = icon('restart');
  $('record-icon').innerHTML = icon('trophy');
  $('drop-icon').innerHTML = icon('drop');
  updateSound();
  for (let tier = 0; tier < 7; tier++) {
    const ball = document.createElement('span');
    ball.className = 'css-ball';
    ball.dataset.tier = tier;
    ball.title = `Stufe ${tier + 1}`;
    const size = 10 + tier * 2.5;
    ball.style.width = ball.style.height = `${size}px`;
    paintBall(ball, tier);
    $('journey-balls').appendChild(ball);
  }
  updateStats();
  updatePause();
  await document.fonts.ready;
  const renderer = new BallView($('game-surface'), world);
  await renderer.init();
  view = renderer;
  $('loading').remove();
  updatePause();

  $('sound-button').addEventListener('click', () => {
    audio.enabled = !audio.enabled;
    storage.set('besserer-ball.sound', audio.enabled ? 'on' : 'off');
    audio.unlock();
    if (audio.enabled) audio.tone(440, 0.15, 0.035);
    updateSound();
  });
  $('pause-button').addEventListener('click', () => setPaused(!userPaused));
  $('resume-button').addEventListener('click', () => { setPaused(false); $('game-surface').focus({ preventScroll: true }); });
  $('restart-button').addEventListener('click', () => openDialog('restart-dialog'));
  $('cancel-restart').addEventListener('click', () => closeDialog('restart-dialog'));
  $('confirm-restart').addEventListener('click', restart);
  $('help-button').addEventListener('click', () => openDialog('help-dialog'));
  $('close-help').addEventListener('click', () => closeDialog('help-dialog'));
  $('help-play').addEventListener('click', () => closeDialog('help-dialog'));
  $('drop-button').addEventListener('click', drop);
  for (const id of ['help-dialog', 'restart-dialog']) {
    $(id).addEventListener('close', () => { modalOpen = false; updatePause(); });
    $(id).addEventListener('click', (event) => { if (event.target === $(id)) {
      const rect = $(id).getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(id);
    } });
  }

  const surface = $('game-surface');
  surface.addEventListener('pointerdown', (event) => {
    if (userPaused || modalOpen || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    surface.focus({ preventScroll: true });
    surface.setPointerCapture(event.pointerId);
    pointer = event.pointerId;
    aim = view.aimFromClient(event.clientX);
    audio.unlock();
  });
  surface.addEventListener('pointermove', (event) => {
    if (userPaused || modalOpen) return;
    if (event.pointerType === 'mouse' || pointer === event.pointerId) aim = view.aimFromClient(event.clientX);
  });
  surface.addEventListener('pointerup', (event) => {
    if (event.pointerId !== pointer) return;
    aim = view.aimFromClient(event.clientX);
    pointer = null;
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
    drop();
  });
  surface.addEventListener('pointercancel', () => { pointer = null; });
  surface.addEventListener('lostpointercapture', () => { pointer = null; });

  window.addEventListener('keydown', (event) => {
    if (modalOpen || event.target.closest('input,textarea,select,[contenteditable]')) return;
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault();
      if (!userPaused) {
        if (!event.repeat) aim = Math.max(0, Math.min(1, aim + (event.code === 'ArrowLeft' ? -0.025 : 0.025)));
        heldKeys.add(event.code);
      }
    }
    if ((event.code === 'Space' || event.code === 'Enter') && !event.target.closest('button,a')) {
      event.preventDefault();
      if (!event.repeat) drop();
    }
    if (event.code === 'KeyP' && !event.repeat) { event.preventDefault(); setPaused(!userPaused); }
  });
  window.addEventListener('keyup', (event) => heldKeys.delete(event.code));
  window.addEventListener('blur', () => { heldKeys.clear(); pointer = null; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && world.dropCount > 0) setPaused(true);
    previousTime = 0;
    accumulator = 0;
  });

  function frame(now) {
    const delta = previousTime ? Math.min((now - previousTime) / 1000, 0.05) : 1 / 60;
    previousTime = now;
    const running = !userPaused && !modalOpen && !document.hidden;
    if (running) {
      const direction = Number(heldKeys.has('ArrowRight')) - Number(heldKeys.has('ArrowLeft'));
      aim = Math.max(0, Math.min(1, aim + direction * delta * 0.7));
      accumulator += delta * 1000;
      while (accumulator >= STEP_MS) { world.step(STEP_MS); accumulator -= STEP_MS; }
      if (messageUntil && world.time > messageUntil) {
        $('board-message').textContent = 'Gleiche Farbe. Doppelte Freude. Und immer ein bisschen größer.';
        $('board-message').classList.remove('accent');
        messageUntil = 0;
      }
    }
    $('drop-button').disabled = !running || !world.canDrop;
    view.render(running ? delta : 0, aim, running && world.canDrop);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start().catch((error) => {
  console.error('Das Spiel konnte nicht gestartet werden:', error);
  const loading = $('loading');
  if (loading) loading.textContent = 'Das Spiel konnte nicht starten. Bitte nutze einen aktuellen Browser mit aktiviertem WebGL und lade die Seite neu.';
});
