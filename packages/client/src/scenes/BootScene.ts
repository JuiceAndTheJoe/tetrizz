import Phaser from 'phaser';
import { SFX_FILES, type SfxKey } from '../audio/sfx.ts';

/**
 * Loads audio + waits for web fonts before starting the main game.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const [key, path] of Object.entries(SFX_FILES)) {
      this.load.audio(key as SfxKey, path);
    }
  }

  async create(): Promise<void> {
    // Wait for the Google fonts referenced in index.html to actually be loaded
    // so any in-canvas text picks them up (avoids a Bricolage → Times → Bricolage flash).
    try {
      await document.fonts.ready;
    } catch { /* ignore */ }
    this.scene.start('Game');
  }
}
