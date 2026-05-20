import Phaser from 'phaser';

/**
 * Tier-driven camera shake. Each tier swaps to its own persistent shake amplitude.
 * Tier 0 stops the shake. Higher tiers create stronger jitter using `setRollingShake`-style
 * continuous noise via tweened camera position.
 */
export class CameraShake {
  private cam: Phaser.Cameras.Scene2D.Camera;
  private tier: 0 | 1 | 2 | 3 = 0;
  private tween: Phaser.Tweens.Tween | null = null;
  private originX: number;
  private originY: number;

  constructor(cam: Phaser.Cameras.Scene2D.Camera) {
    this.cam = cam;
    this.originX = cam.scrollX;
    this.originY = cam.scrollY;
  }

  setTier(tier: 0 | 1 | 2 | 3): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.stop();
    if (tier === 0) return;
    const amp: Record<1 | 2 | 3, { magnitude: number; duration: number }> = {
      1: { magnitude: 0.0010, duration: 140 },
      2: { magnitude: 0.0030, duration: 110 },
      3: { magnitude: 0.0070, duration: 90 },
    };
    const cfg = amp[tier as 1 | 2 | 3];
    // Phaser's built-in shake is a one-shot; we re-trigger it on a timer so the shake stays alive.
    this.tween = this.cam.scene.tweens.addCounter({
      from: 0, to: 1,
      duration: cfg.duration,
      repeat: -1,
      onRepeat: () => this.cam.shake(cfg.duration, cfg.magnitude, true),
    });
    this.cam.shake(cfg.duration, cfg.magnitude, true);
  }

  /** One-shot burst (used on hard drops, line clears). */
  burst(magnitude: number, duration = 120): void {
    this.cam.shake(duration, magnitude, true);
  }

  stop(): void {
    if (this.tween) {
      this.tween.remove();
      this.tween = null;
    }
    this.cam.setScroll(this.originX, this.originY);
  }
}
