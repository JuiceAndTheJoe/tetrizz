import Phaser from 'phaser';

/**
 * Procedural textures generated once at scene boot.
 * Avoids loading PNG assets for tiny particles + lets us tint freely in WebGL.
 */
export const TEX = {
  particleSoft: 'tex_soft',
  ember: 'tex_ember',
  flameLow: 'tex_flame_low',
} as const;

export function ensureTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(TEX.particleSoft)) {
    softCircle(scene, TEX.particleSoft, 64, [
      { stop: 0.0, color: 'rgba(255,255,255,1)' },
      { stop: 0.4, color: 'rgba(255,255,255,0.8)' },
      { stop: 1.0, color: 'rgba(255,255,255,0)' },
    ]);
  }
  if (!scene.textures.exists(TEX.ember)) {
    // hot center → orange → transparent
    softCircle(scene, TEX.ember, 32, [
      { stop: 0.0, color: 'rgba(255,255,255,1)' },
      { stop: 0.3, color: 'rgba(255,210,120,1)' },
      { stop: 0.65, color: 'rgba(255,90,0,0.7)' },
      { stop: 1.0, color: 'rgba(255,40,0,0)' },
    ]);
  }
  if (!scene.textures.exists(TEX.flameLow)) {
    // bigger, softer for body of flames
    softCircle(scene, TEX.flameLow, 128, [
      { stop: 0.0, color: 'rgba(255,240,180,0.95)' },
      { stop: 0.35, color: 'rgba(255,150,30,0.8)' },
      { stop: 0.7, color: 'rgba(255,60,0,0.35)' },
      { stop: 1.0, color: 'rgba(180,0,0,0)' },
    ]);
  }
}

function softCircle(
  scene: Phaser.Scene,
  key: string,
  size: number,
  stops: ReadonlyArray<{ stop: number; color: string }>,
): void {
  const canvas = scene.textures.createCanvas(key, size, size);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  for (const s of stops) grad.addColorStop(s.stop, s.color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  canvas.refresh();
}
