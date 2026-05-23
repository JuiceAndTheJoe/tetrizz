import Phaser from 'phaser';
import type { RoomStateSnapshot } from '@tetrizz/shared';
import { RoomClient } from '../net/room.ts';
import { hideOverlay, showOverlay } from '../ui/overlay.ts';
import { setStatus } from '../ui/hud.ts';

interface LobbyData {
  handle: string;
}

export class LobbyScene extends Phaser.Scene {
  private roomClient!: RoomClient;
  private leaveTimer?: number;
  private handedOff = false;

  constructor() {
    super('Lobby');
  }

  init(data: LobbyData): void {
    const handle = data?.handle ?? '@anon';
    this.roomClient = new RoomClient();
    this.roomClient.setListener((snap, sessionId) => this.onSnapshot(snap, sessionId));
    this.roomClient.onLeave(() => this.handleDisconnect());

    showOverlay({
      title: 'MATCHMAKING…',
      subHtml: `connecting as <b>${escapeHtml(handle)}</b>`,
      btnText: 'CANCEL',
      showHandleInput: false,
    });
    setStatus('queueing…');

    this.roomClient.join(handle).catch((err) => {
      console.warn('[lobby] join failed', err);
      this.showError('can\'t reach the server. try again later.');
    });

    document.getElementById('ov-btn')?.addEventListener('click', this.cancel);
  }

  private onSnapshot(snap: RoomStateSnapshot, mySessionId: string): void {
    if (this.handedOff) return;
    if (snap.phase === 'waiting') {
      showOverlay({
        title: 'MATCHMAKING…',
        subHtml: `${snap.players.length}/2 in the room. waiting for an opp.`,
        btnText: 'CANCEL',
        showHandleInput: false,
      });
      return;
    }
    // Hand off to the Versus scene as soon as a match locks in — it renders the
    // boards behind the 3-2-1 countdown itself. Falls back to a 'playing'
    // snapshot if the one-shot 'countdown' broadcast was missed.
    if (snap.phase === 'countdown' || snap.phase === 'playing') {
      this.handedOff = true;
      hideOverlay();
      this.scene.start('Versus', { roomClient: this.roomClient, mySessionId, initialSnapshot: snap });
    }
  }

  private cancel = (): void => {
    this.roomClient.leave();
    this.scene.start('Menu');
  };

  private handleDisconnect(): void {
    if (this.scene.key !== 'Lobby') return;
    this.showError('connection lost. try again.');
  }

  private showError(msg: string): void {
    showOverlay({
      title: 'NO DICE',
      subHtml: msg,
      btnText: 'BACK',
      showHandleInput: false,
    });
    setStatus('disconnected');
    this.leaveTimer = window.setTimeout(() => this.cancel(), 60_000);
  }

  shutdown(): void {
    document.getElementById('ov-btn')?.removeEventListener('click', this.cancel);
    if (this.leaveTimer) window.clearTimeout(this.leaveTimer);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]!));
}
