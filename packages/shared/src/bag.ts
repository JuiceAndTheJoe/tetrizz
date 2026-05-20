import { TYPES } from './pieces.ts';
import { nextInt } from './rng.ts';
import type { BagState, PieceType } from './types.ts';

export function createBag(seed: number): BagState {
  return { pool: [], rngState: seed | 0 };
}

/** Fisher-Yates shuffle of one fresh 7-bag, returning the shuffled order + advanced RNG state. */
function shuffleBag(rngState: number): { order: PieceType[]; rngState: number } {
  const order = TYPES.slice();
  let state = rngState;
  for (let i = order.length - 1; i > 0; i--) {
    const [j, next] = nextInt(state, i + 1);
    state = next;
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return { order, rngState: state };
}

/**
 * Draw the next piece. If fewer than 7 are queued (matches v0 behavior — keeps a
 * sliding two-bag buffer so you never run dry mid-frame), append a freshly shuffled bag first.
 */
export function takeNext(bag: BagState): { type: PieceType; bag: BagState } {
  let pool = bag.pool;
  let rngState = bag.rngState;
  if (pool.length < 7) {
    const refill = shuffleBag(rngState);
    pool = pool.concat(refill.order);
    rngState = refill.rngState;
  }
  const [type, ...rest] = pool;
  return { type, bag: { pool: rest, rngState } };
}
