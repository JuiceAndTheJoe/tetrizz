import { Client, Room } from 'colyseus.js';
import type { ClientInput, RoomStateSnapshot } from '@tetrizz/shared';

function defaultEndpoint(): string {
  if (import.meta.env.DEV) {
    // Vite dev: client at :5173, server at :8080. Use absolute host so the
    // browser doesn't try to upgrade :5173's HMR socket.
    return 'ws://localhost:8080';
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}`;
}

export type RoomListener = (snapshot: RoomStateSnapshot, mySessionId: string) => void;

export class RoomClient {
  private client: Client;
  private room: Room | null = null;
  private listener: RoomListener | null = null;
  private onLeaveCb: (() => void) | null = null;
  private onRematchAbortedCb: (() => void) | null = null;
  private lastSnapshot: RoomStateSnapshot | null = null;
  /** Captured after join; lets us resume the same session within the server's grace window. */
  private reconnectionToken: string | null = null;
  /** True once we deliberately left — suppresses the onLeave reconnect path. */
  private intentional = false;

  constructor() {
    this.client = new Client(defaultEndpoint());
  }

  setListener(listener: RoomListener): void {
    this.listener = listener;
    // Replay the latest snapshot so a freshly-mounted scene sees current state immediately.
    if (this.room && this.lastSnapshot) {
      this.listener(this.lastSnapshot, this.room.sessionId);
    }
  }

  async join(handle: string): Promise<void> {
    this.intentional = false;
    this.room = await this.client.joinOrCreate<unknown>('versus', { handle });
    this.wireRoom(this.room);
  }

  /** Re-establish the dropped session using the reconnection token. Returns false
   *  if there's no token or the server already expired the grace window. */
  async reconnect(): Promise<boolean> {
    if (!this.reconnectionToken) return false;
    try {
      this.room = await this.client.reconnect<unknown>(this.reconnectionToken);
      this.intentional = false;
      this.wireRoom(this.room);
      return true;
    } catch {
      return false;
    }
  }

  private wireRoom(room: Room): void {
    this.reconnectionToken = room.reconnectionToken ?? null;
    room.onMessage('snapshot', (snap: RoomStateSnapshot) => {
      this.lastSnapshot = snap;
      this.listener?.(snap, room.sessionId);
    });
    room.onMessage('ping', () => {
      room.send('pong', {});
    });
    room.onMessage('rematchAborted', () => this.onRematchAbortedCb?.());
    room.onLeave(() => {
      // A deliberate leave() shouldn't kick off the scene's reconnect/disconnect UI.
      if (this.intentional) return;
      this.onLeaveCb?.();
    });
  }

  onLeave(cb: () => void): void {
    this.onLeaveCb = cb;
  }

  onRematchAborted(cb: () => void): void {
    this.onRematchAbortedCb = cb;
  }

  sendInput(msg: ClientInput): void {
    this.room?.send('input', msg);
  }

  sendRematch(): void {
    this.room?.send('rematch', {});
  }

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  leave(): void {
    this.intentional = true;
    try { this.room?.leave(); } catch { /* ignore */ }
    this.room = null;
    this.lastSnapshot = null;
  }
}
