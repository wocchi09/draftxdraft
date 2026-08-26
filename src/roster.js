/**
 * ロスターの12枠定義と、選手がどの枠に配置可能かの判定ロジック。
 * ここでは「能力の優劣」は一切扱わず、実際に経験した役割・守備位置
 * という客観的事実だけから配置可否を決める。
 */

export const ROSTER_SLOTS = [
  { id: "SP", label: "先発", shortLabel: "先発", group: "pitcher", category: "pitcher" },
  { id: "RP", label: "中継ぎ", shortLabel: "中継", group: "pitcher", category: "pitcher" },
  { id: "CL", label: "抑え", shortLabel: "抑え", group: "pitcher", category: "pitcher" },
  { id: "C", label: "捕手", shortLabel: "捕", group: "catcher", category: "fielder" },
  { id: "1B", label: "一塁手", shortLabel: "一", group: "infield", category: "fielder" },
  { id: "2B", label: "二塁手", shortLabel: "二", group: "infield", category: "fielder" },
  { id: "3B", label: "三塁手", shortLabel: "三", group: "infield", category: "fielder" },
  { id: "SS", label: "遊撃手", shortLabel: "遊", group: "infield", category: "fielder" },
  { id: "LF", label: "左翼手", shortLabel: "左", group: "outfield", category: "fielder" },
  { id: "CF", label: "中堅手", shortLabel: "中", group: "outfield", category: "fielder" },
  { id: "RF", label: "右翼手", shortLabel: "右", group: "outfield", category: "fielder" },
  { id: "DH", label: "指名打者", shortLabel: "DH", group: "dh", category: "fielder" },
];

export const ROSTER_SLOT_IDS = ROSTER_SLOTS.map((s) => s.id);

const SLOT_BY_ID = new Map(ROSTER_SLOTS.map((s) => [s.id, s]));

export function getSlotDef(slotId) {
  return SLOT_BY_ID.get(slotId) || null;
}

export function createEmptyRoster() {
  const roster = {};
  for (const slot of ROSTER_SLOTS) roster[slot.id] = null;
  return roster;
}

export function isRosterComplete(roster) {
  return ROSTER_SLOT_IDS.every((id) => roster[id] !== null);
}

export function countFilledSlots(roster) {
  return ROSTER_SLOT_IDS.filter((id) => roster[id] !== null).length;
}

export function getOpenSlotIds(roster) {
  return ROSTER_SLOT_IDS.filter((id) => roster[id] === null);
}

const FIELDING_SLOT_IDS = new Set(["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"]);

/**
 * 選手が実際の経験に基づき配置しうる枠のIDを、ロスター状態に関係なく列挙する。
 * - pitcherRoles: SP/RP/CL の実績にそのまま対応
 * - fieldingPositions: 各守備位置に対応。"OF"は外野の内訳が不明な場合の
 *   ワイルドカードで、LF/CF/RFいずれにも配置可能として扱う（左右中の断定はしない）
 * - canDH: true の野手はDH枠にも配置可能
 */
export function getEligibleSlotIds(player) {
  if (!player) return [];
  const slots = new Set();

  for (const role of player.pitcherRoles || []) {
    if (SLOT_BY_ID.has(role)) slots.add(role);
  }

  for (const pos of player.fieldingPositions || []) {
    if (pos === "OF") {
      slots.add("LF");
      slots.add("CF");
      slots.add("RF");
    } else if (FIELDING_SLOT_IDS.has(pos)) {
      slots.add(pos);
    }
  }

  if (player.canDH) {
    slots.add("DH");
  }

  return Array.from(slots);
}

/** 現在のロスターで実際に選べる（空いている）配置先のみを返す */
export function getOpenEligibleSlotIds(player, roster) {
  return getEligibleSlotIds(player).filter((slotId) => roster[slotId] === null);
}

export function canPlaceAnywhere(player, roster) {
  return getOpenEligibleSlotIds(player, roster).length > 0;
}

/** 候補一覧の中に、現在のロスターへ配置可能な選手が1人でもいるか */
export function anyPlaceablePlayer(players, roster) {
  return players.some((p) => canPlaceAnywhere(p, roster));
}

export function placePlayer(roster, slotId, playerId) {
  if (!SLOT_BY_ID.has(slotId)) {
    throw new Error(`不明なロスター枠です: ${slotId}`);
  }
  if (roster[slotId] !== null) {
    throw new Error(`枠 ${slotId} は既に埋まっています`);
  }
  return { ...roster, [slotId]: playerId };
}
