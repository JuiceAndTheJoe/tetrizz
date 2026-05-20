import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import type http from 'node:http';
import type pg from 'pg';
import { VersusRoom } from './rooms/VersusRoom.ts';

export interface AttachOptions {
  pool: pg.Pool | null;
}

let attached: Server | null = null;

/**
 * Attach the Colyseus game server onto an existing http.Server. Reuses the
 * same port as Express (OSC My App is single-port).
 *
 * WS upgrades on `/colyseus`; HTTP traffic continues to flow to Express.
 */
export function attachColyseus(httpServer: http.Server, opts: AttachOptions): Server {
  if (attached) return attached;
  const gameServer = new Server({
    transport: new WebSocketTransport({
      server: httpServer,
      // Keepalive ping handled by Colyseus's transport — keeps OSC's reverse
      // proxy from idling the socket. We also send an app-level ping in the
      // room itself for belt-and-braces.
      pingInterval: 25_000,
      pingMaxRetries: 2,
    }),
  });
  gameServer.define('versus', VersusRoom, { pool: opts.pool });
  attached = gameServer;
  return gameServer;
}
