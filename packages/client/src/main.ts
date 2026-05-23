import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { MenuScene } from './scenes/MenuScene.ts';
import { LobbyScene } from './scenes/LobbyScene.ts';
import { VersusScene } from './scenes/VersusScene.ts';
import { mountAudioControls } from './ui/audioControls.ts';

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
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
  },
  scene: [BootScene, MenuScene, GameScene, LobbyScene, VersusScene],
  render: {
    antialias: true,
    pixelArt: false,
  },
  fps: { target: 60 },
});

// audio dock (mute + music/sfx sliders) — lives in the DOM, shared across scenes
mountAudioControls();

// devtools hook
(window as unknown as { game: Phaser.Game }).game = game;
