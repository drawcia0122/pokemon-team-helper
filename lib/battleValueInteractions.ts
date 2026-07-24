import { BATTLE_VALUE_CONFIG } from "@/lib/battleValueConfig";
import { getMultiplier } from "@/lib/typeChart";
import type { BattleTag } from "@/types/semanticCombat";
import type { SemanticCandidateProfile } from "@/types/semanticRecommendationGap";
import type { BattleValueInteraction } from "@/types/battleValue";
import type { EnvironmentPokemon } from "@/types/environmentData";
import type { PokemonEntry } from "@/types/pokemon";

const POSITIVE_PAIRS: Array<[BattleTag, BattleTag, number]> = [
  ["Setup", "Cleanup", 1.7],
  ["Setup", "PriorityFinish", 1.3],
  ["Setup", "WinCondition", 1.8],
  ["Setup", "Snowball", 1.5],
  ["Cleanup", "Snowball", 1.5],
  ["Cleanup", "PriorityFinish", 1.4],
  ["WallBreak", "Trade", 1],
  ["Pivot", "WallBreak", 1.2],
  ["Pivot", "Tempo", 1.1],
  ["DefensiveAnchor", "Setup", 1],
  ["Tempo", "Setup", 1],
  ["RevengeKill", "PriorityFinish", 1.2]
];

export function battleValueInteractions(
  profile: SemanticCandidateProfile,
  pokemon: PokemonEntry,
  environment: EnvironmentPokemon
): { points: number; interactions: BattleValueInteraction[] } {
  const interactions: BattleValueInteraction[] = POSITIVE_PAIRS.flatMap(
    ([left, right, weight]) => {
      const presence = Math.min(
        profile.tagProfiles[left].semanticPresence,
        profile.tagProfiles[right].semanticPresence
      );
      return presence <= 0
        ? []
        : [
            {
              id: `${left}+${right}`,
              kind: "synergy" as const,
              points: presence * weight,
              tags: [left, right],
              reason: `${left}と${right}を同じ実戦プランで活用できます。`
            }
          ];
    }
  );
  const categoryPresence = (category: string): number =>
    Math.max(
      0,
      ...Object.values(profile.tagProfiles).flatMap((tag) =>
        tag.evidence
          .filter((entry) => entry.semanticCategory === category)
          .map((entry) => entry.adoptionRate * entry.confidenceWeight)
      )
    );
  const add = (
    id: string,
    kind: BattleValueInteraction["kind"],
    points: number,
    tags: BattleTag[],
    reason: string
  ) => {
    if (Math.abs(points) < 0.01) return;
    interactions.push({ id, kind, points, tags, reason });
  };
  const trapPresence = categoryPresence("Trap");
  add(
    "Trap+WallBreak",
    "synergy",
    trapPresence * profile.tagProfiles.WallBreak.semanticPresence * 1.6,
    ["WallBreak"],
    "拘束と崩しを同じ実戦プランで活用できます。"
  );
  add(
    "Trap+Trade",
    "synergy",
    trapPresence * profile.tagProfiles.Trade.semanticPresence * 1.4,
    ["Trade"],
    "拘束した対象を交換手段で処理できます。"
  );

  const choiceShare = Math.max(
    0,
    ...environment.items
      .filter((entry) => BATTLE_VALUE_CONFIG.choiceItemIds.includes(entry.id))
      .map((entry) => entry.share)
  );
  const choiceSetup =
    choiceShare > 0 && profile.tagProfiles.Setup.semanticPresence > 0;
  if (choiceSetup) {
    add(
      "choice-item+setup",
      "conflict",
      -1.5 * Math.min(choiceShare, profile.tagProfiles.Setup.semanticPresence),
      ["Setup"],
      "こだわり系道具と積み技は同時運用しにくい構成です。"
    );
  }
  const assaultVestShare =
    environment.items.find((entry) => entry.id === "assaultvest")?.share ?? 0;
  const statusMoveShare = environment.moves
    .filter((entry) => entry.share >= BATTLE_VALUE_CONFIG.minimumEvidenceShare)
    .filter((entry) =>
      Object.values(profile.tagProfiles).some((tag) =>
        tag.evidence.some(
          (evidence) =>
            evidence.entityKind === "move" &&
            evidence.entityId === entry.id &&
            ["Setup", "Tempo", "Utility", "Recovery"].includes(
              evidence.semanticCategory
            )
        )
      )
    )
    .reduce((total, entry) => total + entry.share, 0);
  add(
    "assault-vest+status-focus",
    "conflict",
    -1.5 * Math.min(assaultVestShare, statusMoveShare),
    ["Utility"],
    "とつげきチョッキと変化技中心のプランは同時に成立しません。"
  );
  const recoilShare = environment.moves
    .filter((entry) =>
      BATTLE_VALUE_CONFIG.recoilMoveIds.includes(entry.id)
    )
    .reduce((total, entry) => total + entry.share, 0);
  const durability =
    ((pokemon.baseStats?.hp ?? 0) +
      (pokemon.baseStats?.defense ?? 0) +
      (pokemon.baseStats?.specialDefense ?? 0)) /
    360;
  add(
    "recoil+low-durability",
    "conflict",
    durability < 0.65 ? -1.2 * recoilShare * (1 - durability) : 0,
    ["WallBreak"],
    "反動技への依存に対して耐久の余裕が小さい構成です。"
  );
  const sashShare =
    environment.items.find((entry) => entry.id === "focussash")?.share ?? 0;
  add(
    "focus-sash+hazard-weakness",
    "conflict",
    getMultiplier("rock", pokemon.types) > 1 ? -1.2 * sashShare : 0,
    ["Trade", "RevengeKill"],
    "ステルスロック弱点によりきあいのタスキの行動保証が崩れます。"
  );
  const priorityEvidence = profile.tagProfiles.PriorityFinish.evidence.filter(
    (entry) => entry.entityKind === "move"
  );
  add(
    "conditional-priority-only",
    "conflict",
    priorityEvidence.length === 1 &&
      BATTLE_VALUE_CONFIG.conditionalPriorityMultipliers[
        priorityEvidence[0].entityId
      ]
      ? -0.8 * priorityEvidence[0].adoptionRate
      : 0,
    ["PriorityFinish"],
    "条件付き先制技だけでは安定した終盤処理になりません。"
  );
  add(
    "trade+snowball-role-conflict",
    "conflict",
    -0.8 *
      Math.min(
        profile.tagProfiles.Trade.semanticPresence,
        profile.tagProfiles.Snowball.semanticPresence
      ),
    ["Trade", "Snowball"],
    "1対1交換と長期的な連続突破は同時に遂行しにくい役割です。"
  );
  add(
    "hazard-setter+removal-slot-conflict",
    "conflict",
    -0.7 *
      Math.min(
        profile.tagProfiles.HazardSetter.semanticPresence,
        profile.tagProfiles.HazardRemoval.semanticPresence
      ),
    ["HazardSetter", "HazardRemoval"],
    "設置と除去を同じ技構成へ収めると技枠が競合します。"
  );
  const setupEvidence = profile.tagProfiles.Setup.evidence.filter(
    (entry) => entry.entityKind === "move"
  );
  const setupOverlap = Math.max(
    0,
    setupEvidence.reduce((total, entry) => total + entry.adoptionRate, 0) -
      Math.max(0, ...setupEvidence.map((entry) => entry.adoptionRate))
  );
  add(
    "multiple-setup-moves",
    "conflict",
    -0.6 * Math.min(1, setupOverlap),
    ["Setup"],
    "複数の積み技の採用率を同時採用として扱わない補正です。"
  );
  const raw = interactions.reduce((total, entry) => total + entry.points, 0);
  const capped = Math.max(
    -BATTLE_VALUE_CONFIG.weights.interactionBonus,
    Math.min(BATTLE_VALUE_CONFIG.weights.interactionBonus, raw)
  );
  return {
    points: capped,
    interactions: interactions
      .sort(
        (a, b) =>
          Math.abs(b.points) - Math.abs(a.points) ||
          a.id.localeCompare(b.id)
      )
  };
}
