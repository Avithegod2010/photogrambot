// Last-write-wins register comparison (pure).
//
// Lamport clock first; device id is the deterministic tie-breaker so every
// device converges on the same winner.

export function lwwWins(
  remoteLamport: number,
  remoteDevice: string,
  localLamport: number | null,
  localDevice: string | null
): boolean {
  if (localLamport === null || !Number.isFinite(localLamport)) return true;
  if (remoteLamport > localLamport) return true;
  if (remoteLamport < localLamport) return false;
  return String(remoteDevice) > String(localDevice ?? "");
}
