// Top-right audio dock: a speaker mute toggle plus a popover with Music and SFX
// volume sliders. Operates on whichever scene's Sfx is currently active; when no
// scene Sfx exists yet (e.g. the menu), it falls back to persisting directly so
// the next game picks the values up. Centralizes the mute button that used to be
// wired only in the solo scene.

import type { Sfx } from '../audio/sfx.ts';
import {
  loadMuted, saveMuted,
  loadSfxVolume, saveSfxVolume, loadMusicVolume, saveMusicVolume,
} from '../persistence/store.ts';

let active: Sfx | null = null;
let musicSlider: HTMLInputElement | null = null;
let sfxSlider: HTMLInputElement | null = null;
let muteBtn: HTMLButtonElement | null = null;

/** Register the Sfx instance of the active scene so the controls drive it live. */
export function setActiveSfx(sfx: Sfx): void {
  active = sfx;
  syncAudioUI();
}

/** Refresh the speaker icon + slider positions from the current source of truth. */
export function syncAudioUI(): void {
  const muted = active ? active.isMuted : loadMuted();
  const music = active ? active.getMusicVolume() : loadMusicVolume();
  const sfx = active ? active.getSfxVolume() : loadSfxVolume();
  if (muteBtn) {
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.classList.toggle('muted', muted);
  }
  if (musicSlider) musicSlider.value = String(Math.round(music * 100));
  if (sfxSlider) sfxSlider.value = String(Math.round(sfx * 100));
}

function toggleMute(): void {
  if (active) active.toggleMute();
  else saveMuted(!loadMuted());
  syncAudioUI();
}

function setMusic(v: number): void {
  if (active) active.setMusicVolume(v);
  else saveMusicVolume(v);
}

function setSfx(v: number): void {
  if (active) active.setSfxVolume(v);
  else saveSfxVolume(v);
}

export function mountAudioControls(): void {
  if (document.getElementById('audio-dock')) return;
  muteBtn = document.getElementById('mute-btn') as HTMLButtonElement | null;

  const dock = document.createElement('div');
  dock.className = 'audio-dock';
  dock.id = 'audio-dock';

  const panel = document.createElement('div');
  panel.className = 'audio-panel';
  panel.innerHTML = `
    <div class="ap-row"><span>MUSIC</span><input type="range" id="vol-music" min="0" max="100" step="1" aria-label="music volume"></div>
    <div class="ap-row"><span>SFX</span><input type="range" id="vol-sfx" min="0" max="100" step="1" aria-label="sfx volume"></div>
    <button class="ap-mute" id="ap-mute" type="button">MUTE ALL</button>
  `;

  document.body.appendChild(dock);
  dock.appendChild(panel);
  if (muteBtn) dock.appendChild(muteBtn); // reparent the existing fixed button into the dock

  musicSlider = panel.querySelector('#vol-music');
  sfxSlider = panel.querySelector('#vol-sfx');
  const apMute = panel.querySelector('#ap-mute') as HTMLButtonElement | null;

  // Desktop has hover to reveal the panel, so a speaker click is a quick mute.
  // Touch has no hover, so a tap opens the panel (mute lives inside it).
  const hoverCapable = window.matchMedia('(hover: hover)').matches;
  muteBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (hoverCapable) toggleMute();
    else dock.classList.toggle('open');
  });
  apMute?.addEventListener('click', toggleMute);
  document.addEventListener('click', (e) => {
    if (!dock.contains(e.target as Node)) dock.classList.remove('open');
  });

  musicSlider?.addEventListener('input', () => setMusic((musicSlider!.valueAsNumber || 0) / 100));
  sfxSlider?.addEventListener('input', () => setSfx((sfxSlider!.valueAsNumber || 0) / 100));
  // a tick of feedback when releasing the SFX slider so the level is audible
  sfxSlider?.addEventListener('change', () => active?.play('rizz'));

  syncAudioUI();
}
