/**
 * ドラフト履歴の記録。ユーザーが実際に選択・スキップした結果のみを記録し、
 * 「配置可能な選手がいません」による自動再抽選は記録しない
 * （ユーザーの意思決定ではないため）。
 */

let nextEntryId = 1;

export function createHistoryEntry({ round, year, teamId, action, playerId = null, slotId = null }) {
  return {
    id: nextEntryId++,
    round,
    year,
    teamId,
    action, // 'PICK' | 'SKIP'
    playerId,
    slotId,
    timestamp: Date.now(),
  };
}

export function resetHistoryIdCounter(startAt = 1) {
  nextEntryId = startAt;
}
