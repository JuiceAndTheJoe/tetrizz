import Phaser from 'phaser';
import { loadHandle, normalizeHandle, saveHandle } from '../persistence/store.ts';
import { getOverlay, hideOverlay, showOverlay } from '../ui/overlay.ts';
import { setHandle, setStatus } from '../ui/hud.ts';

/**
 * Picks single-player vs versus. Owns the start overlay; the chosen scene
 * takes over from there (Game scene keeps its existing behaviour; Lobby starts
 * the matchmaking flow).
 */
export class MenuScene extends Phaser.Scene {
  private btnHandlerSolo?: () => void;
  private btnHandlerVs?: () => void;
  private inputHandler?: (e: KeyboardEvent) => void;

  constructor() {
    super('Menu');
  }

  create(): void {
    setHandle(loadHandle());
    setStatus('drop in to start');
    showOverlay({
      title: 'TETRIZZ',
      subHtml: 'pick a handle, lock in.<br>solo cook or 1v1 versus.',
      btnText: 'SOLO COOK',
      showHandleInput: true,
    });
    const o = getOverlay();
    o.handleInput.value = loadHandle() ?? '';

    const vsBtn = document.getElementById('ov-btn-vs');
    if (vsBtn instanceof HTMLButtonElement) vsBtn.style.display = 'block';

    this.btnHandlerSolo = () => this.commit('solo');
    this.btnHandlerVs = () => this.commit('versus');
    this.inputHandler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commit('solo');
      }
    };
    o.btn.addEventListener('click', this.btnHandlerSolo);
    vsBtn?.addEventListener('click', this.btnHandlerVs!);
    o.handleInput.addEventListener('keydown', this.inputHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  private commit(mode: 'solo' | 'versus'): void {
    const o = getOverlay();
    const normalized = normalizeHandle(o.handleInput.value || '');
    if (normalized) {
      saveHandle(normalized);
      setHandle(normalized);
    }
    if (mode === 'versus' && !normalized) {
      // Versus requires a handle so the opponent has something to read.
      o.sub.innerHTML = 'pick a handle first — opponent needs to know who they\'re cooking.';
      o.handleInput.focus();
      return;
    }
    hideOverlay();
    if (mode === 'solo') {
      this.scene.start('Game', { autoStart: true });
    } else {
      this.scene.start('Lobby', { handle: normalized });
    }
  }

  private teardown(): void {
    const o = getOverlay();
    if (this.btnHandlerSolo) o.btn.removeEventListener('click', this.btnHandlerSolo);
    if (this.inputHandler) o.handleInput.removeEventListener('keydown', this.inputHandler);
    const vsBtn = document.getElementById('ov-btn-vs');
    if (vsBtn instanceof HTMLButtonElement && this.btnHandlerVs) {
      vsBtn.removeEventListener('click', this.btnHandlerVs);
      vsBtn.style.display = 'none';
    }
  }
}
