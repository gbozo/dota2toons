/**
 * game/prediction.ts
 *
 * Client-side prediction buffer for the local hero.
 *
 * When the player issues a move command:
 *   1. We apply it locally immediately (prediction)
 *   2. We send it to the server with a sequence number
 *   3. When the server sends back the authoritative state, we:
 *      a. Set position to the server-authoritative value
 *      b. Replay all unACK'd commands on top of it (reconciliation)
 */

export interface PendingCommand {
  seq:     number;
  type:    'move' | 'attack' | 'stop';
  targetX?: number;
  targetY?: number;
  targetEntityId?: string;
  appliedAt: number; // game tick when applied
}

export class PredictionBuffer {
  private pending: PendingCommand[] = [];
  private seq = 0;

  nextSeq(): number { return ++this.seq; }

  push(cmd: Omit<PendingCommand, 'seq' | 'appliedAt'>, tick: number): PendingCommand {
    const c: PendingCommand = { ...cmd, seq: this.nextSeq(), appliedAt: tick };
    this.pending.push(c);
    return c;
  }

  /** Remove all commands ACK'd by the server (seq <= ackSeq). */
  ack(ackSeq: number): void {
    this.pending = this.pending.filter(c => c.seq > ackSeq);
  }

  /** All commands not yet acknowledged — replay these after server reconciliation. */
  unacked(): readonly PendingCommand[] {
    return this.pending;
  }

  clear(): void {
    this.pending = [];
  }
}
