import type {
  EnvironmentLocalizationCategory,
  EnvironmentLocalizationDictionary,
  EnvironmentLocalizedValue
} from "@/types/environmentLocalization";

const warnedMissingKeys = new Set<string>();

export function localizeEnvironmentValue(
  dictionary: EnvironmentLocalizationDictionary,
  category: EnvironmentLocalizationCategory,
  sourceId: string
): EnvironmentLocalizedValue {
  const name = dictionary.categories[category][sourceId];
  if (name) return { name, status: "localized" };

  const warningKey = `${category}:${sourceId}`;
  if (!warnedMissingKeys.has(warningKey)) {
    warnedMissingKeys.add(warningKey);
    console.warn(
      `[environment-localization] 日本語辞書がありません: ${warningKey}`
    );
  }
  return { name: dictionary.fallbackLabel, status: "missing" };
}

export function resetEnvironmentLocalizationWarningsForTests(): void {
  warnedMissingKeys.clear();
}
