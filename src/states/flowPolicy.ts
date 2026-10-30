/** True only for ordinary combat rooms whose wave flow may be auto-advanced. */
export function canResolveRoomWave(
  roomKind: string,
  wavesTotal: number,
  waveStarted: boolean,
): boolean {
  return roomKind !== 'boss' && wavesTotal > 0 && waveStarted;
}

/** Preserve the established rule that every level transition restores full HP. */
export function restoreAfterLevelClear(player: { hpMax: number; heal(amount: number): void }): void {
  player.heal(player.hpMax);
}

/** The terminal victory state freezes simulation after any active dialog is handled. */
export function shouldFreezeVictory(victory: boolean): boolean {
  return victory;
}
