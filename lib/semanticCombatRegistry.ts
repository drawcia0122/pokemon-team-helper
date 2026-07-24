import moveMetadataData from "@/data/environment/moveMetadata.json";
import {
  getAbilityBypassIds,
  getDefensiveAbilityImmunities
} from "@/lib/battleEffectiveness";
import type { EnvironmentMoveMetadataRegistry } from "@/types/environmentThreat";
import type {
  AbilitySemantic,
  AbilitySemanticCategory,
  BattleTag,
  BattleTagDefinition,
  BattleTagIndexEntry,
  ItemSemantic,
  ItemSemanticCategory,
  MoveSemantic,
  MoveSemanticCategory,
  SemanticClassification,
  SemanticCombatRegistry,
  SemanticEntityKind,
  SemanticMetadata,
  StatChangeSemantic,
  StatChangeSemanticCategory
} from "@/types/semanticCombat";

const CURATED_SOURCE = "TASK044 curated combat semantics";
const TASK031_SOURCE = "TASK031 battleEffectiveness";
const moveMetadata =
  moveMetadataData as EnvironmentMoveMetadataRegistry;
const MOVE_METADATA_SOURCE =
  `PokeAPI move metadata ${moveMetadata.source.commit}`;

type MutableRegistry<Semantic> = Record<string, Semantic[]>;

const moves: MutableRegistry<MoveSemantic> = {};
const abilities: MutableRegistry<AbilitySemantic> = {};
const items: MutableRegistry<ItemSemantic> = {};
const statChanges: MutableRegistry<StatChangeSemantic> = {};

function addSemantic<Semantic extends { category: string }>(
  registry: MutableRegistry<Semantic>,
  ids: readonly string[],
  semantic: Semantic
): void {
  for (const id of ids) {
    const entries = registry[id] ?? [];
    if (entries.some((entry) => entry.category === semantic.category)) {
      throw new Error(
        `Semantic重複: ${id}/${semantic.category}`
      );
    }
    registry[id] = [...entries, semantic];
  }
}

function semantic<
  Category extends
    | MoveSemanticCategory
    | AbilitySemanticCategory
    | ItemSemanticCategory
    | StatChangeSemanticCategory
>(
  category: Category,
  description: string,
  battleTags: readonly BattleTag[],
  {
    confidence = "high",
    source = CURATED_SOURCE
  }: {
    confidence?: "high" | "medium";
    source?: string;
  } = {}
): SemanticMetadata<Category> {
  return { category, confidence, source, description, battleTags };
}

for (const [moveId, metadata] of Object.entries(moveMetadata.moves)) {
  if (metadata.damageClass === "status") continue;
  addSemantic(
    moves,
    [moveId],
    semantic(
      "Damage",
      metadata.damageClass === "physical"
        ? "物理攻撃で相手へ直接ダメージを与えます。"
        : "特殊攻撃で相手へ直接ダメージを与えます。",
      [],
      { source: MOVE_METADATA_SOURCE }
    )
  );
}

addSemantic(
  moves,
  [
    "swordsdance",
    "nastyplot",
    "dragondance",
    "quiverdance",
    "calmmind",
    "shellsmash",
    "bulkup",
    "curse",
    "agility",
    "rockpolish",
    "shiftgear",
    "coil",
    "growth",
    "bellydrum",
    "irondefense",
    "amnesia",
    "acidarmor",
    "cottonguard",
    "cosmicpower",
    "stockpile",
    "workup",
    "tailglow",
    "geomancy",
    "autotomize",
    "filletaway",
    "noretreat",
    "clangoroussoul",
    "tidyup"
  ],
  semantic(
    "Setup",
    "能力を上げ、以後の攻撃・耐久・素早さを強化して勝ち筋を作ります。",
    ["Setup", "WinCondition"]
  )
);

addSemantic(
  moves,
  [
    "aquajet",
    "bulletpunch",
    "machpunch",
    "shadowsneak",
    "iceshard",
    "extremespeed",
    "suckerpunch",
    "vacuumwave",
    "quickattack",
    "accelerock",
    "jetpunch",
    "firstimpression",
    "fakeout",
    "grassyglide",
    "watershuriken",
    "thunderclap"
  ],
  semantic(
    "Priority",
    "優先度を利用して素早さに関係なく先に行動し、残った相手を処理できます。",
    ["PriorityFinish", "RevengeKill", "Cleanup"]
  )
);

addSemantic(
  moves,
  [
    "uturn",
    "voltswitch",
    "flipturn",
    "partingshot",
    "teleport",
    "chillyreception",
    "batonpass",
    "shedtail"
  ],
  semantic(
    "Pivot",
    "交代しながら有利な対面を作り、攻撃の流れを維持します。",
    ["Pivot", "Tempo"]
  )
);

addSemantic(
  moves,
  [
    "recover",
    "roost",
    "slackoff",
    "softboiled",
    "morningsun",
    "wish",
    "synthesis",
    "moonlight",
    "shoreup",
    "milkdrink",
    "healorder",
    "strengthsap",
    "rest",
    "painsplit",
    "aquaring",
    "ingrain",
    "lifedew",
    "junglehealing"
  ],
  semantic(
    "Recovery",
    "HPを回復し、繰り返し行動できる回数と受け性能を増やします。",
    ["DefensiveAnchor"]
  )
);

addSemantic(
  moves,
  [
    "destinybond",
    "finalgambit",
    "explosion",
    "selfdestruct",
    "counter",
    "mirrorcoat",
    "metalburst",
    "mistyexplosion",
    "memento",
    "endeavor",
    "healingwish",
    "lunardance"
  ],
  semantic(
    "Trade",
    "自分のHPや場に残る権利と引き換えに、相手の戦力・HP・展開を大きく削ります。",
    ["Trade"]
  )
);

addSemantic(
  moves,
  [
    "fakeout",
    "taunt",
    "encore",
    "yawn",
    "thunderwave",
    "willowisp",
    "icywind",
    "rocktomb",
    "bulldoze",
    "electroweb",
    "glare",
    "spore",
    "sleeppowder",
    "hypnosis",
    "toxic",
    "disable",
    "torment",
    "quash",
    "tailwind",
    "trickroom",
    "roar",
    "whirlwind",
    "dragontail",
    "circlethrow",
    "nuzzle"
  ],
  semantic(
    "Tempo",
    "相手の行動・交代・素早さを制限し、こちらが主導権を握りやすくします。",
    ["Tempo", "Utility"]
  )
);

addSemantic(
  moves,
  [
    "meanlook",
    "block",
    "spiderweb",
    "spiritshackle",
    "anchorshot",
    "infestation",
    "whirlpool",
    "firespin",
    "sandtomb",
    "magmastorm",
    "thundercage",
    "snaptrap",
    "wrap",
    "bind"
  ],
  semantic(
    "Trap",
    "相手の交代を制限し、不利対面から逃がさず処理または消耗させます。",
    ["WallBreak", "Tempo"]
  )
);

addSemantic(
  moves,
  [
    "stealthrock",
    "spikes",
    "toxicspikes",
    "stickyweb",
    "ceaselessedge",
    "stoneaxe"
  ],
  semantic(
    "Hazard",
    "相手の交代時に継続的な負荷を与える設置物を展開します。",
    ["HazardSetter", "Tempo"]
  )
);

addSemantic(
  moves,
  ["rapidspin", "defog", "mortalspin", "tidyup", "courtchange"],
  semantic(
    "HazardRemoval",
    "場の設置物を除去または相手側へ移し、交代時の負荷を軽減します。",
    ["HazardRemoval", "Utility"]
  )
);

addSemantic(
  moves,
  [
    "trick",
    "switcheroo",
    "knockoff",
    "haze",
    "clearsmog",
    "protect",
    "detect",
    "substitute",
    "reflect",
    "lightscreen",
    "auroraveil",
    "leechseed",
    "healbell",
    "aromatherapy",
    "safeguard",
    "helpinghand",
    "followme",
    "ragepowder",
    "wideguard",
    "quickguard",
    "magiccoat",
    "skillswap",
    "entrainment",
    "worryseed",
    "soak",
    "perishsong",
    "topsyturvy",
    "psychup",
    "trickroom",
    "tailwind"
  ],
  semantic(
    "Utility",
    "火力以外の方法で持ち物・能力・場・行動条件を操作し、味方を支援します。",
    ["Utility"]
  )
);

addSemantic(
  abilities,
  [
    "hugepower",
    "purepower",
    "adaptability",
    "toughclaws",
    "sheerforce",
    "ironfist",
    "strongjaw",
    "technician",
    "sharpness",
    "megalauncher",
    "pixilate",
    "aerilate",
    "refrigerate",
    "galvanize",
    "transistor",
    "dragonsmaw",
    "gorillatactics",
    "waterbubble",
    "sandforce",
    "reckless",
    "skilllink",
    "parentalbond",
    "protean",
    "libero",
    "noguard",
    "tintedlens",
    "neuroforce",
    "analytic"
  ],
  semantic(
    "OffensiveMultiplier",
    "攻撃技の実効火力または通しやすさを高め、受けを崩しやすくします。",
    ["WallBreak"]
  )
);

addSemantic(
  abilities,
  [
    "speedboost",
    "swiftswim",
    "chlorophyll",
    "sandrush",
    "slushrush",
    "unburden",
    "quickfeet",
    "surgesurfer",
    "weakarmor"
  ],
  semantic(
    "Speed",
    "条件を満たすと素早さを高め、上から攻撃できる範囲を広げます。",
    ["Cleanup", "RevengeKill"]
  )
);

addSemantic(
  abilities,
  [
    "moxie",
    "beastboost",
    "supremeoverlord",
    "grimneigh",
    "chillingneigh",
    "soulheart",
    "defiant",
    "competitive",
    "contrary"
  ],
  semantic(
    "Snowball",
    "相手の撃破や能力変化を起点に性能を上げ、連続突破へつなげます。",
    ["Snowball", "WinCondition", "Cleanup"]
  )
);

addSemantic(
  abilities,
  ["shadowtag", "arenatrap", "magnetpull"],
  semantic(
    "Trap",
    "特定の相手の交代を封じ、狙った対面で処理や崩しを進めます。",
    ["WallBreak", "Tempo"]
  )
);

addSemantic(
  abilities,
  [
    "multiscale",
    "furcoat",
    "icescales",
    "unaware",
    "filter",
    "solidrock",
    "prismarmor",
    "thickfat",
    "fluffy",
    "sturdy",
    "disguise",
    "magicguard",
    "shellarmor",
    "battlearmor",
    "clearbody",
    "goodasgold",
    "purifyingsalt",
    "marvelscale",
    "poisonheal",
    "bulletproof",
    "soundproof",
    "heatproof",
    "watercompaction",
    "stamina"
  ],
  semantic(
    "Defensive",
    "被ダメージや妨害を抑え、安定して行動できる回数を増やします。",
    ["DefensiveAnchor"]
  )
);

for (const immunity of getDefensiveAbilityImmunities()) {
  addSemantic(
    abilities,
    [immunity.abilityId],
    semantic(
      "Immunity",
      `${immunity.immuneTypes.join("・")}タイプの攻撃を無効化し、安全な交代先になります。`,
      ["DefensiveAnchor"],
      { source: TASK031_SOURCE }
    )
  );
}

addSemantic(
  abilities,
  [
    "regenerator",
    "intimidate",
    "magicbounce",
    "prankster",
    ...getAbilityBypassIds(),
    "infiltrator",
    "scrappy",
    "trace",
    "frisk",
    "pressure",
    "flamebody",
    "static",
    "cursedbody",
    "naturalcure",
    "mirrorarmor",
    "corrosion",
    "toxicdebris",
    "innerfocus",
    "oblivious",
    "queenlymajesty",
    "armortail",
    "galewings",
    "roughskin",
    "effectspore",
    "poisontouch",
    "hospitality",
    "lightningrod"
  ],
  semantic(
    "Utility",
    "交代・妨害・状態異常・行動順などを操作し、チームの選択肢を増やします。",
    ["Utility", "Tempo"]
  )
);

addSemantic(
  abilities,
  ["drizzle", "drought", "sandstream", "snowwarning"],
  semantic(
    "Weather",
    "登場時に天候を展開し、技・特性・耐久条件をチーム全体で変化させます。",
    ["Utility", "Tempo"]
  )
);

addSemantic(
  abilities,
  ["stancechange", "zerotohero", "imposter", "schooling", "shieldsdown"],
  semantic(
    "FormChange",
    "戦闘中に姿や能力構成を変化させ、役割を切り替えます。",
    ["Utility"],
    { confidence: "medium" }
  )
);

addSemantic(
  abilities,
  [
    "torrent",
    "blaze",
    "overgrow",
    "swarm",
    "dragonize",
    "electromorphosis",
    "fairyaura",
    "spicyspray",
    "firemane",
    "eelevate"
  ],
  semantic(
    "OffensiveMultiplier",
    "特定の技・タイプ・条件で攻撃性能を高め、相手へ与える圧力を増やします。",
    ["WallBreak"],
    { confidence: "medium" }
  )
);

addSemantic(
  abilities,
  [
    "rockhead",
    "illusion",
    "innardsout",
    "mummy",
    "stalwart",
    "wanderingspirit",
    "compoundeyes",
    "unnerve",
    "hypercutter",
    "pickpocket",
    "synchronize",
    "symbiosis",
    "steadfast",
    "cutecharm",
    "gooey",
    "poisonpoint",
    "electricsurge",
    "damp",
    "cudchew"
  ],
  semantic(
    "Utility",
    "攻撃以外の条件・能力・持ち物・状態を操作し、対戦の進行へ影響します。",
    ["Utility", "Tempo"],
    { confidence: "medium" }
  )
);

addSemantic(
  abilities,
  [
    "eartheater",
    "voltabsorb",
    "snowcloak",
    "flowerveil",
    "immunity",
    "vitalspirit",
    "raindish"
  ],
  semantic(
    "Defensive",
    "ダメージ・状態異常・天候などの影響を抑え、場に残りやすくします。",
    ["DefensiveAnchor"],
    { confidence: "medium" }
  )
);

addSemantic(
  items,
  ["choicescarf"],
  semantic(
    "ChoiceSpeed",
    "技を固定する代わりに素早さを高め、上からの処理範囲を広げます。",
    ["RevengeKill", "Cleanup"]
  )
);

addSemantic(
  items,
  [
    "choiceband",
    "choicespecs",
    "lifeorb",
    "expertbelt",
    "muscleband",
    "wiseglasses",
    "charcoal",
    "mysticwater",
    "miracleseed",
    "magnet",
    "nevermeltice",
    "blackglasses",
    "blackbelt",
    "poisonbarb",
    "softsand",
    "sharpbeak",
    "twistedspoon",
    "silverpowder",
    "hardstone",
    "spelltag",
    "dragonfang",
    "silkscarf",
    "metalcoat",
    "fairyfeather"
  ],
  semantic(
    "OffensiveBoost",
    "攻撃技の火力を高め、相手の受けを突破しやすくします。",
    ["WallBreak"]
  )
);

addSemantic(
  items,
  ["focussash"],
  semantic(
    "Survival",
    "HP満タンから一度だけ攻撃を耐え、行動保証や切り返しを作ります。",
    ["Trade", "RevengeKill"]
  )
);

addSemantic(
  items,
  ["leftovers", "blacksludge", "sitrusberry", "figyberry"],
  semantic(
    "Recovery",
    "戦闘中にHPを回復し、場に残って行動できる回数を増やします。",
    ["DefensiveAnchor"]
  )
);

addSemantic(
  items,
  ["heavydutyboots"],
  semantic(
    "HazardProtection",
    "交代時の設置物ダメージや効果を防ぎ、繰り返し交代しやすくします。",
    ["Pivot", "Utility"]
  )
);

addSemantic(
  items,
  [
    "assaultvest",
    "eviolite",
    "shucaberry",
    "chopleberry",
    "passhoberry",
    "payapaberry",
    "yacheberry",
    "kasibberry",
    "wacanberry",
    "brightpowder"
  ],
  semantic(
    "DefensiveBoost",
    "耐久力を高めるか特定の攻撃を受ける負担を軽減します。",
    ["DefensiveAnchor"]
  )
);

addSemantic(
  items,
  ["weaknesspolicy", "whiteherb"],
  semantic(
    "Snowball",
    "条件を満たした際の能力上昇または能力低下の回復により、展開を継続します。",
    ["Snowball", "Setup", "WinCondition"]
  )
);

addSemantic(
  items,
  ["rockyhelmet"],
  semantic(
    "ContactPunish",
    "接触攻撃を受けた相手へ反動ダメージを与え、攻撃を繰り返しにくくします。",
    ["DefensiveAnchor", "Trade"]
  )
);

addSemantic(
  items,
  ["lumberry", "mentalherb", "chestoberry"],
  semantic(
    "StatusProtection",
    "状態異常や行動制限を一度解除し、予定した行動を通しやすくします。",
    ["Utility", "Setup"]
  )
);

addSemantic(
  items,
  ["lightclay"],
  semantic(
    "ScreenExtension",
    "壁技の継続ターンを延ばし、味方が安全に行動できる時間を増やします。",
    ["Utility", "DefensiveAnchor"]
  )
);

addSemantic(
  items,
  ["damprock", "heatrock", "smoothrock", "icyrock"],
  semantic(
    "WeatherExtension",
    "天候の継続ターンを延ばし、天候を利用する味方の活動時間を増やします。",
    ["Utility", "Tempo"]
  )
);

addSemantic(
  items,
  [
    "ejectbutton",
    "ejectpack",
    "redcard",
    "airballoon",
    "roomservice",
    "throatspray"
  ],
  semantic(
    "Utility",
    "交代・耐性・能力変化などの条件を一度だけ操作し、展開を補助します。",
    ["Utility", "Tempo"]
  )
);

addSemantic(
  items,
  ["widelens"],
  semantic(
    "OffensiveBoost",
    "技の命中率を高め、攻撃や妨害を安定して通しやすくします。",
    ["WallBreak"],
    { confidence: "medium" }
  )
);

addSemantic(
  items,
  ["bigroot"],
  semantic(
    "Recovery",
    "吸収技などで得られる回復量を増やし、場に残りやすくします。",
    ["DefensiveAnchor"]
  )
);

const MEGA_STONE_IDS = [
  "abomasite",
  "absolite",
  "aerodactylite",
  "aggronite",
  "alakazite",
  "altarianite",
  "ampharosite",
  "audinite",
  "banettite",
  "barbaracite",
  "beedrillite",
  "blastoisinite",
  "blazikenite",
  "cameruptite",
  "chandelurite",
  "charizarditex",
  "charizarditey",
  "chesnaughtite",
  "chimechite",
  "clefablite",
  "delphoxite",
  "diancite",
  "dragoninite",
  "dragalgite",
  "eelektrossite",
  "falinksite",
  "feraligite",
  "floettite",
  "froslassite",
  "galladite",
  "garchompite",
  "gardevoirite",
  "gengarite",
  "glalitite",
  "glimmoranite",
  "greninjite",
  "gyaradosite",
  "heracronite",
  "houndoominite",
  "kangaskhanite",
  "latiasite",
  "latiosite",
  "lopunnite",
  "lucarionite",
  "malamarite",
  "manectite",
  "mawilite",
  "medichamite",
  "meganiumite",
  "metagrossite",
  "mewtwonitex",
  "mewtwonitey",
  "pidgeotite",
  "pinsirite",
  "pyroarite",
  "raichunitex",
  "raichunitey",
  "sablenite",
  "sceptilite",
  "scizorite",
  "scolipite",
  "scovillainite",
  "scraftinite",
  "sharpedonite",
  "skarmorite",
  "slowbronite",
  "staraptite",
  "starminite",
  "steelixite",
  "swampertite",
  "tyranitarite",
  "venusaurite",
  "victreebelite"
] as const;

addSemantic(
  items,
  MEGA_STONE_IDS,
  semantic(
    "MegaEvolution",
    "対応するポケモンをメガシンカさせ、戦闘中の能力・タイプ・特性を変化させます。",
    [],
    { confidence: "high" }
  )
);

addSemantic(
  statChanges,
  ["attack:positive", "special-attack:positive"],
  semantic(
    "OffensiveBoost",
    "攻撃性能の上昇により、相手を倒し切れる範囲を広げます。",
    ["Setup", "WallBreak"]
  )
);

addSemantic(
  statChanges,
  ["speed:positive"],
  semantic(
    "SpeedBoost",
    "素早さの上昇により、先に行動できる相手を増やします。",
    ["Setup", "Cleanup", "RevengeKill"]
  )
);

addSemantic(
  statChanges,
  ["defense:positive", "special-defense:positive"],
  semantic(
    "DefensiveBoost",
    "耐久能力の上昇により、攻撃を受けながら行動できる回数を増やします。",
    ["Setup", "DefensiveAnchor"]
  )
);

addSemantic(
  statChanges,
  ["attack:negative", "special-attack:negative"],
  semantic(
    "OffensiveDrop",
    "相手の攻撃性能を下げ、味方が受けるダメージを減らします。",
    ["Tempo", "Utility"]
  )
);

addSemantic(
  statChanges,
  ["speed:negative"],
  semantic(
    "SpeedDrop",
    "相手の素早さを下げ、味方が先に行動しやすくします。",
    ["Tempo", "Utility"]
  )
);

addSemantic(
  statChanges,
  ["defense:negative", "special-defense:negative"],
  semantic(
    "DefensiveDrop",
    "相手の耐久能力を下げ、後続を含めて突破しやすくします。",
    ["WallBreak", "Tempo"]
  )
);

addSemantic(
  statChanges,
  ["accuracy:negative", "evasion:positive"],
  semantic(
    "AccuracyControl",
    "技の命中しやすさを変化させ、相手の安定行動を制限します。",
    ["Tempo", "Utility"],
    { confidence: "medium" }
  )
);

function freezeEntries<
  Semantic extends { battleTags: readonly BattleTag[] }
>(
  registry: MutableRegistry<Semantic>
): Readonly<Record<string, readonly Semantic[]>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(registry)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, entries]) => [
          id,
          Object.freeze(
            entries.map(
              (entry) =>
                Object.freeze({
                  ...entry,
                  battleTags: Object.freeze([...entry.battleTags])
                }) as Semantic
            )
          )
        ])
    )
  );
}

export const SEMANTIC_COMBAT_REGISTRY: SemanticCombatRegistry =
  Object.freeze({
    schemaVersion: 1,
    moves: freezeEntries(moves),
    abilities: freezeEntries(abilities),
    items: freezeEntries(items),
    statChanges: freezeEntries(statChanges)
  });

export const BATTLE_TAG_DEFINITIONS: readonly BattleTagDefinition[] = [
  { tag: "WallBreak", description: "受け役や耐久中心の相手を崩します。" },
  { tag: "Cleanup", description: "消耗した相手を終盤に一掃します。" },
  { tag: "Setup", description: "能力上昇や場作りで攻める準備を整えます。" },
  { tag: "WinCondition", description: "対戦を決める明確な勝ち筋を作ります。" },
  { tag: "PriorityFinish", description: "先制技で残った相手を処理します。" },
  { tag: "Trade", description: "自分の戦力と引き換えに相手へ大きな損失を与えます。" },
  { tag: "Tempo", description: "行動順・交代・選択肢を操作して主導権を取ります。" },
  { tag: "Pivot", description: "攻撃や補助を行いながら有利な交代へつなげます。" },
  { tag: "RevengeKill", description: "相手の撃破後に安全に切り返します。" },
  { tag: "Snowball", description: "一度得た有利を能力上昇へ変え、連続突破します。" },
  { tag: "HazardSetter", description: "交代へ継続的な負荷を与える設置物を展開します。" },
  { tag: "HazardRemoval", description: "味方側の設置物を除去または移動します。" },
  { tag: "DefensiveAnchor", description: "繰り返し攻撃を受けてチームの守りを支えます。" },
  { tag: "Utility", description: "火力以外の方法で味方を支援し、相手を妨害します。" }
] as const;

const registryByKind = {
  move: SEMANTIC_COMBAT_REGISTRY.moves,
  ability: SEMANTIC_COMBAT_REGISTRY.abilities,
  item: SEMANTIC_COMBAT_REGISTRY.items,
  "stat-change": SEMANTIC_COMBAT_REGISTRY.statChanges
} as const;

export function getSemanticClassification(
  entityKind: "move",
  entityId: string
): SemanticClassification<MoveSemantic>;
export function getSemanticClassification(
  entityKind: "ability",
  entityId: string
): SemanticClassification<AbilitySemantic>;
export function getSemanticClassification(
  entityKind: "item",
  entityId: string
): SemanticClassification<ItemSemantic>;
export function getSemanticClassification(
  entityKind: "stat-change",
  entityId: string
): SemanticClassification<StatChangeSemantic>;
export function getSemanticClassification(
  entityKind: SemanticEntityKind,
  entityId: string
): SemanticClassification<
  MoveSemantic | AbilitySemantic | ItemSemantic | StatChangeSemantic
> {
  const semantics = registryByKind[entityKind][
    entityId as keyof (typeof registryByKind)[typeof entityKind]
  ] as
    | readonly (
        | MoveSemantic
        | AbilitySemantic
        | ItemSemantic
        | StatChangeSemantic
      )[]
    | undefined;
  if (!semantics || semantics.length === 0) {
    return {
      status: "unclassified",
      semantics: [],
      battleTags: []
    };
  }
  const battleTags = [
    ...new Set(semantics.flatMap((entry) => entry.battleTags))
  ];
  return {
    status: "classified",
    semantics,
    battleTags
  };
}

export function getBattleTagIndex(): Readonly<
  Record<BattleTag, readonly BattleTagIndexEntry[]>
> {
  const index = Object.fromEntries(
    BATTLE_TAG_DEFINITIONS.map(({ tag }) => [tag, [] as BattleTagIndexEntry[]])
  ) as Record<BattleTag, BattleTagIndexEntry[]>;
  for (const [entityKind, registry] of Object.entries(registryByKind) as Array<
    [SemanticEntityKind, Record<string, readonly SemanticMetadata<
      MoveSemanticCategory |
      AbilitySemanticCategory |
      ItemSemanticCategory |
      StatChangeSemanticCategory
    >[]>]
  >) {
    for (const [entityId, semantics] of Object.entries(registry)) {
      for (const entry of semantics) {
        for (const tag of entry.battleTags) {
          index[tag].push({
            entityKind,
            entityId,
            semanticCategory: entry.category
          });
        }
      }
    }
  }
  return Object.freeze(
    Object.fromEntries(
      BATTLE_TAG_DEFINITIONS.map(({ tag }) => [
        tag,
        Object.freeze(
          index[tag].sort(
            (left, right) =>
              left.entityKind.localeCompare(right.entityKind) ||
              left.entityId.localeCompare(right.entityId) ||
              left.semanticCategory.localeCompare(right.semanticCategory)
          )
        )
      ])
    )
  ) as Readonly<Record<BattleTag, readonly BattleTagIndexEntry[]>>;
}
