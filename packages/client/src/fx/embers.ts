import Phaser from 'phaser';
import { TEX } from './textures.ts';

export class EmberEmitter {
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private intensity = 0; // 0 = off, 1 = light, 2 = heavy, 3 = inferno

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    // Emitter band sits at the bottom edge of the board. Particles rise upward.
    const halfW = width / 2;
    this.emitter = scene.add.particles(0, 0, TEX.ember, {
      x: { min: x - halfW, max: x + halfW },
      y: y + height,
      lifespan: { min: 1100, max: 2400 },
      speedX: { min: -50, max: 50 },
      speedY: { min: -160, max: -90 },
      accelerationY: -40, // gentle continuous lift so they accelerate upward
      scale: { start: 0.8, end: 0.25, ease: 'Quad.Out' },
      alpha: { start: 1, end: 0, ease: 'Cubic.In' },
      blendMode: Phaser.BlendModes.ADD,
      tint: [0xffffff, 0xffd166, 0xff8800, 0xff4d00],
      frequency: -1,
      emitting: false,
    });
    this.emitter.setDepth(10);
  }

  setTier(tier: 0 | 1 | 2 | 3): void {
    if (tier === this.intensity) return;
    this.intensity = tier;
    if (tier === 0) {
      this.emitter.stop();
      return;
    }
    // frequency = ms between emissions; quantity = particles per emission
    const config: Record<1 | 2 | 3, { frequency: number; quantity: number }> = {
      1: { frequency: 260, quantity: 1 },
      2: { frequency: 140, quantity: 2 },
      3: { frequency: 70, quantity: 3 },
    };
    const cfg = config[tier as 1 | 2 | 3];
    this.emitter.setFrequency(cfg.frequency, cfg.quantity);
    this.emitter.start();
  }

  /** Fire a one-shot burst (used on tier-up). */
  burst(count: number): void {
    this.emitter.emitParticle(count);
  }

  destroy(): void {
    this.emitter.destroy();
  }
}
