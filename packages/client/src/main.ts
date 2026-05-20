import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { GameScene } from './scenes/GameScene.ts';

const BOARD_W = 300;
const BOARD_H = 600;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: BOARD_W,
  height: BOARD_H,
  backgroundColor: '#07001a',
  transparent: false,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  scene: [BootScene, GameScene],
  render: {
    antialias: true,
    pixelArt: false,
  },
  fps: { target: 60 },
});

// devtools hook
(window as unknown as { game: Phaser.Game }).game = game;
