export type NavigationKey = "team" | "builds" | "news" | "environment";

export type NavigationItem = {
  key: NavigationKey;
  href: string;
  label: string;
};

export const siteNavigationItems: NavigationItem[] = [
  { key: "team", href: "/", label: "構築補助" },
  { key: "builds", href: "/builds", label: "構築記事" },
  { key: "news", href: "/news", label: "ニュース・グッズ" },
  { key: "environment", href: "/environment", label: "環境ランキング" }
];

export function getSiteNavigationState(active: string): Array<NavigationItem & { isCurrent: boolean }> {
  return siteNavigationItems.map((item) => ({
    ...item,
    isCurrent: item.key === active
  }));
}
