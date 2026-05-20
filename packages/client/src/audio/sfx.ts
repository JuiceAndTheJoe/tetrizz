import Phaser from 'phaser';
import { loadMuted, saveMuted } from '../persistence/store.ts';

export type SfxKey = 'rizz' | 'bombo' | 'siren' | 'taco' | 'fahhh' | 'tuco' | 'charlie';

export const SFX_FILES: Readonly<Record<SfxKey, string>> = {
  rizz: 'sounds/rizz.mp3',
  bombo: 'sounds/bombo.mp3',
  siren: 'sounds/siren.mp3',
  taco: 'sounds/taco.mp3',
  fahhh: 'sounds/fahhh.mp3',
  tuco: 'sounds/tuco.mp3',
  charlie: 'sounds/charlie.mp3',
};

const SFX_VOL: Readonly<Record<SfxKey, number>> = {
  rizz: 0.7, bombo: 0.7, siren: 0.45, taco: 0.6, fahhh: 0.65, tuco: 0.75, charlie: 0.8,
};

const SFX_OFFSET: Record<SfxKey, number> = {
  rizz: 1.10, bombo: 0, siren: 0, taco: 0, fahhh: 0, tuco: 0, charlie: 0,
};

const STREAK_LOSS_ROTATION: readonly SfxKey[] = ['taco', 'fahhh', 'tuco'];

export class Sfx {
  private sound: Phaser.Sound.BaseSoundManager;
  private streakLossIdx = 0;
  // we keep a persistent Phaser sound instance for charlie so we can hook
  // its complete/stop events and drive the screen-wide 130 BPM pulse class.
  private charlieSound: Phaser.Sound.BaseSound | null = null;

  constructor(sound: Phaser.Sound.BaseSoundManager) {
    this.sound = sound;
    this.sound.mute = loadMuted();
  }

  play(key: SfxKey): void {
    if (this.sound.mute) return;
    if (key === 'charlie') {
      this.playCharlie();
      return;
    }
    // Phaser WebAudio handles overlapping plays by default (each call creates a new playback instance).
    this.sound.play(key, {
      volume: SFX_VOL[key],
      seek: SFX_OFFSET[key],
    });
  }

  private playCharlie(): void {
    if (!this.charlieSound) {
      this.charlieSound = this.sound.add('charlie');
      const off = (): void => { document.body.classList.remove('beat-130'); };
      this.charlieSound.on('complete', off);
      this.charlieSound.on('stop', off);
    }
    this.charlieSound.play({
      volume: SFX_VOL.charlie,
      seek: SFX_OFFSET.charlie,
    });
    document.body.classList.add('beat-130');
  }

  /** Plays whichever clear-tier sound is appropriate for the lock event. */
  playClear(fxTier: 0 | 1 | 2 | 3): void {
    if (fxTier === 3) this.play('siren');
    else if (fxTier === 2) this.play('bombo');
    else this.play('rizz'); // tier 0 (first single) + tier 1
  }

  playStreakLoss(): void {
    const key = STREAK_LOSS_ROTATION[this.streakLossIdx % STREAK_LOSS_ROTATION.length];
    this.streakLossIdx++;
    this.play(key);
  }

  playHighScore(): void {
    this.play('charlie');
  }

  get isMuted(): boolean { return this.sound.mute; }
  setMuted(muted: boolean): void {
    this.sound.mute = muted;
    saveMuted(muted);
    // killing the charlie playback when muted also drops the beat-130 pulse
    // (via the 'stop' listener registered in playCharlie).
    if (muted && this.charlieSound?.isPlaying) this.charlieSound.stop();
  }
  toggleMute(): boolean {
    this.setMuted(!this.sound.mute);
    return this.sound.mute;
  }
}

/** Devtools helper: live-tune the rizz start offset without reloading. */
export function exposeTuneHelpers(): void {
  (window as unknown as { tuneRizz: (s: number) => void }).tuneRizz = (offset: number) => {
    SFX_OFFSET.rizz = offset;
    console.log('[rizz] offset set to', offset, 's');
  };
}
