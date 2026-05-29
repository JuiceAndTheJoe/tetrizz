import Phaser from 'phaser';
import { TEX } from './textures.ts';

/**
 * Two-layer flame effect at the bottom of the board:
 *   - low: bigger, slower, deep-orange body
 *   - high: smaller, brighter yellow tongues
 * Both invisible at tier 0; tier 1/2/3 ramp the alpha + frequency.
 */
export class FlameEmitter {
  private low: Phaser.GameObjects.Particles.ParticleEmitter;
  private high: Phaser.GameObjects.Particles.ParticleEmitter;
  private tier: 0 | 1 | 2 | 3 = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    const baseY = y + height + 6;
    const halfW = width / 2;
    this.low = scene.add.particles(0, 0, TEX.flameLow, {
      x: { min: x - halfW, max: x + halfW },
      y: baseY,
      lifespan: { min: 500, max: 850 },
      speedY: { min: -160, max: -90 },
      speedX: { min: -25, max: 25 },
      accelerationY: -120,
      scale: { start: 0.9, end: 0.25, ease: 'Quad.Out' },
      alpha: { start: 0.9, end: 0, ease: 'Cubic.In' },
      blendMode: Phaser.BlendModes.ADD,
      tint: [0xff5a00, 0xff8000, 0xffae00],
      frequency: -1,
      emitting: false,
    });
    this.low.setDepth(8);

    this.high = scene.add.particles(0, 0, TEX.particleSoft, {
      x: { min: x - halfW + 4, max: x + halfW - 4 },
      y: baseY - 4,
      lifespan: { min: 280, max: 520 },
      speedY: { min: -240, max: -160 },
      speedX: { min: -30, max: 30 },
      accelerationY: -200,
      scale: { start: 0.45, end: 0.1, ease: 'Quad.Out' },
      alpha: { start: 0.85, end: 0, ease: 'Cubic.In' },
      blendMode: Phaser.BlendModes.ADD,
      tint: [0xfff0a0, 0xffd400, 0xff8a00],
      frequency: -1,
      emitting: false,
    });
    this.high.setDepth(9);
  }

  setTier(tier: 0 | 1 | 2 | 3): void {
    if (tier === this.tier) return;
    this.tier = tier;
    if (tier === 0) {
      this.low.stop();
      this.high.stop();
      return;
    }
    // milder at tier 1, full inferno at tier 3 — modulate density via frequency
    // (alpha range stays as configured in the constructor; particle count carries the intensity).
    // Trimmed from 40/60ms on tier 3 — three concurrent emitters with additive
    // blending were the dominant GPU cost during a hot board.
    const cfg: Record<1 | 2 | 3, { lowFreq: number; highFreq: number }> = {
      1: { lowFreq: 220, highFreq: 340 },
      2: { lowFreq: 110, highFreq: 180 },
      3: { lowFreq: 70,  highFreq: 110 },
    };
    const c = cfg[tier as 1 | 2 | 3];
    this.low.setFrequency(c.lowFreq, 1);
    this.high.setFrequency(c.highFreq, 1);
    this.low.start();
    this.high.start();
  }

  destroy(): void {
    this.low.destroy();
    this.high.destroy();
  }
}
