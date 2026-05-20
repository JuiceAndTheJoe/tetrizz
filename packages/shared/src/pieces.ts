import type { PieceType, Rotation } from './types.ts';

type ShapeMatrix = readonly (readonly number[])[];
type ShapeSet = readonly [ShapeMatrix, ShapeMatrix, ShapeMatrix, ShapeMatrix];

export const TYPES: readonly PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;

// SRS-ish rotation matrices, bounding-box per piece. Ported verbatim from v0.
export const SHAPES: Readonly<Record<PieceType, ShapeSet>> = {
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
  ],
  O: [
    [[1,1],[1,1]],
    [[1,1],[1,1]],
    [[1,1],[1,1]],
    [[1,1],[1,1]],
  ],
  T: [
    [[0,1,0],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,1],[0,1,0]],
    [[0,1,0],[1,1,0],[0,1,0]],
  ],
  S: [
    [[0,1,1],[1,1,0],[0,0,0]],
    [[0,1,0],[0,1,1],[0,0,1]],
    [[0,0,0],[0,1,1],[1,1,0]],
    [[1,0,0],[1,1,0],[0,1,0]],
  ],
  Z: [
    [[1,1,0],[0,1,1],[0,0,0]],
    [[0,0,1],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,0],[0,1,1]],
    [[0,1,0],[1,1,0],[1,0,0]],
  ],
  J: [
    [[1,0,0],[1,1,1],[0,0,0]],
    [[0,1,1],[0,1,0],[0,1,0]],
    [[0,0,0],[1,1,1],[0,0,1]],
    [[0,1,0],[0,1,0],[1,1,0]],
  ],
  L: [
    [[0,0,1],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,0],[0,1,1]],
    [[0,0,0],[1,1,1],[1,0,0]],
    [[1,1,0],[0,1,0],[0,1,0]],
  ],
};

export interface PieceMeta {
  /** Brainrot-coded display name. */
  name: string;
  /** Hex color for the cell fill. */
  color: string;
  /** RGBA glow color used by client FX. */
  glow: string;
}

export const META: Readonly<Record<PieceType, PieceMeta>> = {
  I: { name: 'SIGMA',  color: '#29e4ff', glow: 'rgba(41,228,255,.65)' },
  O: { name: 'GYATT',  color: '#ffd400', glow: 'rgba(255,212,0,.65)'  },
  T: { name: 'DIDDY',  color: '#b66bff', glow: 'rgba(182,107,255,.7)' },
  S: { name: 'BOP',    color: '#c8ff3a', glow: 'rgba(200,255,58,.65)' },
  Z: { name: 'OPP',    color: '#ff4d4d', glow: 'rgba(255,77,77,.7)'   },
  J: { name: 'CHUZZ',  color: '#5b8cff', glow: 'rgba(91,140,255,.7)'  },
  L: { name: 'HUZZ',   color: '#ff8a3d', glow: 'rgba(255,138,61,.7)'  },
};

export function shapeAt(type: PieceType, rot: Rotation): ShapeMatrix {
  return SHAPES[type][rot];
}
