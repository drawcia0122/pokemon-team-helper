export type EnvironmentLocalizationCategory =
  | "moves"
  | "items"
  | "abilities"
  | "natures";

export type EnvironmentLocalizationDictionary = {
  schemaVersion: 1;
  locale: "ja";
  fallbackLabel: "未対応";
  dictionaryVersion: string;
  sources: {
    pokeApiRepository: "https://github.com/PokeAPI/pokeapi";
    pokeApiCommit: string;
    overrideFile: "data/environment/localization/showdown-ja-overrides.json";
  };
  categories: Record<EnvironmentLocalizationCategory, Record<string, string>>;
};

export type EnvironmentLocalizationOverrides = {
  schemaVersion: 1;
  locale: "ja";
  note: string;
  categories: Partial<
    Record<EnvironmentLocalizationCategory, Record<string, string>>
  >;
};

export type EnvironmentLocalizedValue = {
  name: string;
  status: "localized" | "missing";
};
