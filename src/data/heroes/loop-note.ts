// STORY §2.6: bindable heroes read as recovered memories from a specific Loop turn.
// The number is deterministic from hero id so prose stays stable across saves.
export function loopTurnForHero(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 1000 + (Math.abs(h) % 8800);
}

export function loopTurnLabel(id: string): string {
  return loopTurnForHero(id).toLocaleString('en-US');
}

export function echoLoopNote(id: string): string {
  return ` Its Echo last fought on turn ${loopTurnLabel(id)} of the Loop, and remembers every blow.`;
}
