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

/** Background music + one-shot game-over sting. Loaded alongside the SFX. */
export type MusicKey = 'intro' | 'loop' | 'mogsong';
export const MUSIC_FILES: Readonly<Record<MusicKey, string>> = {
  intro: 'sounds/intro.mp3',
  loop: 'sounds/loop.mp3',
  mogsong: 'sounds/mogsong.mp3',
};

const SFX_VOL: Readonly<Record<SfxKey, number>> = {
  rizz: 0.7, bombo: 0.7, siren: 0.45, taco: 0.6, fahhh: 0.65, tuco: 0.75, charlie: 0.8,
};

const SFX_OFFSET: Record<SfxKey, number> = {
  rizz: 1.10, bombo: 0, siren: 0, taco: 0, fahhh: 0, tuco: 0, charlie: 0,
};

/** Background-loop volume — sits under the SFX so clears/streak sounds cut through. */
const MUSIC_VOL = 0.5;
const MOG_VOL = 0.85;

// charlie has a ~7s intro before the beat drops — hold the screen pulse until then
const CHARLIE_BEAT_DELAY_MS = 7000;

const STREAK_LOSS_ROTATION: readonly SfxKey[] = ['taco', 'fahhh', 'tuco'];

/** Minimal view of Phaser's WebAudio manager internals we route music through.
 *  `destination` (the master mute node) means our music respects mute + master
 *  volume exactly like every Phaser sound does. */
interface WebAudioBits {
  context?: AudioContext;
  destination?: AudioNode;
  masterMuteNode?: AudioNode;
}

export class Sfx {
  private sound: Phaser.Sound.BaseSoundManager;
  private streakLossIdx = 0;
  // we keep a persistent Phaser sound instance for charlie so we can hook
  // its complete/stop events and drive the screen-wide 130 BPM pulse class.
  private charlieSound: Phaser.Sound.BaseSound | null = null;
  // deferred kickoff for the pulse so we can wait out the song intro
  private charlieBeatTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- background music (gapless intro → loop via raw WebAudio scheduling) ----
  private ctx: AudioContext | null = null;
  private musicDest: AudioNode | null = null;
  private musicGain: GainNode | null = null;
  private introSrc: AudioBufferSourceNode | null = null;
  private loopSrc: AudioBufferSourceNode | null = null;
  private musicPlaying = false;
  // HTML5-audio fallback (only when WebAudio is unavailable — rare)
  private fbIntro: Phaser.Sound.BaseSound | null = null;
  private fbLoop: Phaser.Sound.BaseSound | null = null;

  constructor(sound: Phaser.Sound.BaseSoundManager) {
    this.sound = sound;
    this.sound.mute = loadMuted();
    const bits = sound as unknown as WebAudioBits;
    this.ctx = bits.context ?? null;
    this.musicDest = bits.destination ?? bits.masterMuteNode ?? this.ctx?.destination ?? null;
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
      const off = (): void => {
        document.body.classList.remove('beat-130');
        // charlie's done trumping — bring the loop back up.
        this.duckMusic(false);
        if (this.charlieBeatTimer !== null) {
          clearTimeout(this.charlieBeatTimer);
          this.charlieBeatTimer = null;
        }
      };
      this.charlieSound.on('complete', off);
      this.charlieSound.on('stop', off);
    }
    // charlie trumps the background loop — drop it to silence while charlie sings.
    this.duckMusic(true);
    this.charlieSound.play({
      volume: SFX_VOL.charlie,
      seek: SFX_OFFSET.charlie,
    });
    // wait out the song intro before kicking the pulse in
    document.body.classList.remove('beat-130');
    if (this.charlieBeatTimer !== null) clearTimeout(this.charlieBeatTimer);
    const delay = Math.max(0, CHARLIE_BEAT_DELAY_MS - SFX_OFFSET.charlie * 1000);
    this.charlieBeatTimer = setTimeout(() => {
      this.charlieBeatTimer = null;
      if (this.charlieSound?.isPlaying) document.body.classList.add('beat-130');
    }, delay);
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

  // ---------- background music ----------

  /** Start the gameplay music: intro.mp3 played once, seamlessly handing off to a
   *  looping loop.mp3. WebAudio start(when) gives a sample-accurate, gapless join
   *  so the two files feel like one track. */
  startMusic(): void {
    this.stopMusic();
    this.musicPlaying = true;

    const introBuf = this.buffer('intro');
    const loopBuf = this.buffer('loop');
    if (this.ctx && this.musicDest && introBuf && loopBuf) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      const gain = this.ctx.createGain();
      gain.gain.value = MUSIC_VOL;
      gain.connect(this.musicDest);
      this.musicGain = gain;

      const start = this.ctx.currentTime + 0.06;
      this.introSrc = this.ctx.createBufferSource();
      this.introSrc.buffer = introBuf;
      this.introSrc.connect(gain);
      this.loopSrc = this.ctx.createBufferSource();
      this.loopSrc.buffer = loopBuf;
      this.loopSrc.loop = true;
      this.loopSrc.connect(gain);

      this.introSrc.start(start);
      this.loopSrc.start(start + introBuf.duration);
      return;
    }

    // Fallback (no WebAudio): chain via Phaser on the intro's complete event.
    this.fbIntro = this.sound.add('intro');
    this.fbIntro.once('complete', () => {
      if (!this.musicPlaying) return;
      this.fbLoop = this.sound.add('loop');
      this.fbLoop.play({ loop: true, volume: MUSIC_VOL });
    });
    this.fbIntro.play({ volume: MUSIC_VOL });
  }

  stopMusic(): void {
    this.musicPlaying = false;
    for (const src of [this.introSrc, this.loopSrc]) {
      if (!src) continue;
      try { src.stop(); } catch { /* already stopped */ }
      try { src.disconnect(); } catch { /* ignore */ }
    }
    this.introSrc = this.loopSrc = null;
    if (this.musicGain) {
      try { this.musicGain.disconnect(); } catch { /* ignore */ }
      this.musicGain = null;
    }
    for (const s of [this.fbIntro, this.fbLoop]) {
      if (!s) continue;
      try { s.stop(); s.destroy(); } catch { /* ignore */ }
    }
    this.fbIntro = this.fbLoop = null;
  }

  /** Smoothly drop the loop to silence (charlie trumping) and back. */
  private duckMusic(on: boolean): void {
    const target = on ? 0 : MUSIC_VOL;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.12);
    }
    // setVolume lives on the concrete sound subclasses, not BaseSound.
    (this.fbLoop as unknown as { setVolume?: (v: number) => void } | null)?.setVolume?.(target);
    (this.fbIntro as unknown as { setVolume?: (v: number) => void } | null)?.setVolume?.(target);
  }

  /** Versus game-over sting. Stops the loop and plays the mog song once. */
  playMog(): void {
    this.stopMusic();
    if (this.sound.mute) return;
    this.sound.play('mogsong', { volume: MOG_VOL });
  }

  private buffer(key: MusicKey): AudioBuffer | null {
    const buf = this.sound.game.cache.audio.get(key);
    return buf instanceof AudioBuffer ? buf : null;
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
