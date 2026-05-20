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
    if (snap.phase === 'waiting') {
      showOverlay({
        title: 'MATCHMAKING…',
        subHtml: `${snap.players.length}/2 in the room. waiting for an opp.`,
        btnText: 'CANCEL',
        showHandleInput: false,
      });
      return;
    }
    if (snap.phase === 'countdown') {
      const opp = snap.players.find((p) => p.sessionId !== mySessionId);
      const oppHandle = opp?.handle ?? '@???';
      showOverlay({
        title: 'OPPONENT FOUND',
        subHtml: `cooking against <b>${escapeHtml(oppHandle)}</b><br>get ready…`,
        btnText: '—',
        showHandleInput: false,
      });
      return;
    }
    if (snap.phase === 'playing') {
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
