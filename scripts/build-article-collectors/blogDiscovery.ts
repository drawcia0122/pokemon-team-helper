import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractHatenaBlogDomains, isHatenaFeed, parseHatenaFeed } from "./hatenaBlog";
import { SafeHttpClient, isAllowedByRobots } from "./http";
import { normalizeUrl } from "./normalize";
import {
  INITIAL_HATENA_BLOGS,
  RESEARCHED_HATENA_BLOG_CANDIDATES,
  SOURCE_REGISTRY
} from "./sourceRegistry";
import type {
  CollectionStatus,
  FetchExpectedContent,
  FetchRequestOptions,
  FetchResult,
  HatenaBlogState
} from "./types";

export const BLOG_DISCOVERY_LIMITS = {
  maxDepth: 2,
  maxNewDomains: 30,
  maxVerifiedDomains: 20,
  maxRegisteredDomains: 100
} as const;

type DiscoveryFetcher = (
  url: string,
  expected: FetchExpectedContent,
  options?: FetchRequestOptions
) => Promise<FetchResult>;

export type BlogDiscoveryResult = {
  blogs: HatenaBlogState[];
  registeredBlogCount: number;
  newDiscoveredBlogCount: number;
  promotedBlogCount: number;
  pendingBlogCount: number;
  verifiedBlogCount: number;
  failedBlogCount: number;
  wroteFiles: boolean;
};

type LinkedDiscoverySeed = {
  url: string;
  domain: string;
  depth: number;
};

export async function discoverLinkedHatenaBlogCandidates(input: {
  seeds: LinkedDiscoverySeed[];
  fetchHtml: (url: string) => Promise<string | null>;
  existingDomains?: Iterable<string>;
  maxDepth?: number;
  maxNewDomains?: number;
}): Promise<Array<{ domain: string; discoveredFrom: string }>> {
  const maxDepth = input.maxDepth ?? BLOG_DISCOVERY_LIMITS.maxDepth;
  const maxNewDomains =
    input.maxNewDomains ?? BLOG_DISCOVERY_LIMITS.maxNewDomains;
  const known = new Set(
    [...(input.existingDomains ?? [])].map((domain) =>
      domain.toLocaleLowerCase("en")
    )
  );
  const queuedUrls = new Set<string>();
  const queue = input.seeds
    .filter((seed) => seed.depth <= maxDepth)
    .map((seed) => ({ ...seed, url: normalizeUrl(seed.url) }));
  const found: Array<{ domain: string; discoveredFrom: string }> = [];

  while (queue.length > 0 && found.length < maxNewDomains) {
    const seed = queue.shift()!;
    if (seed.depth > maxDepth || queuedUrls.has(seed.url)) continue;
    queuedUrls.add(seed.url);
    if (seed.depth >= maxDepth) continue;
    const html = await input.fetchHtml(seed.url);
    if (!html) continue;
    for (const domain of extractHatenaBlogDomains(html, seed.domain)) {
      if (known.has(domain)) continue;
      known.add(domain);
      found.push({ domain, discoveredFrom: seed.url });
      if (found.length >= maxNewDomains) break;
      if (seed.depth < maxDepth) {
        queue.push({
          url: `https://${domain}/`,
          domain,
          depth: seed.depth + 1
        });
      }
    }
  }
  return found;
}

function normalizeExistingBlog(
  blog: Partial<HatenaBlogState> & Pick<HatenaBlogState, "domain">,
  nowIso: string
): HatenaBlogState {
  const initial = INITIAL_HATENA_BLOGS.includes(
    blog.domain as (typeof INITIAL_HATENA_BLOGS)[number]
  );
  return {
    domain: blog.domain.toLocaleLowerCase("en"),
    discoveredFrom: blog.discoveredFrom ?? null,
    discoveredAt: blog.discoveredAt ?? nowIso,
    feedUrl:
      blog.feedUrl ?? `https://${blog.domain}/feed?exclude_body=1`,
    automationAllowed: blog.automationAllowed ?? initial,
    customDomain: blog.customDomain ?? false,
    platformVerified: blog.platformVerified ?? initial,
    verifiedAt: blog.verifiedAt ?? (initial ? nowIso : null),
    verificationMethod:
      blog.verificationMethod ?? (initial ? "initial-registry" : null),
    promotionReason:
      blog.promotionReason ??
      (initial
        ? "TASK007でfeed・robots・候補記事を確認済み"
        : "feed-and-robots-verification-pending"),
    candidateCount: blog.candidateCount ?? null,
    failureCount: blog.failureCount ?? 0
  };
}

export function registerBlogCandidates(input: {
  blogs: HatenaBlogState[];
  candidates: Array<{ domain: string; discoveredFrom: string }>;
  nowIso: string;
  maxNewDomains?: number;
  maxRegisteredDomains?: number;
}): { blogs: HatenaBlogState[]; newCount: number } {
  const maxNew =
    input.maxNewDomains ?? BLOG_DISCOVERY_LIMITS.maxNewDomains;
  const maxRegistered =
    input.maxRegisteredDomains ??
    BLOG_DISCOVERY_LIMITS.maxRegisteredDomains;
  const blogs = input.blogs.map((blog) =>
    normalizeExistingBlog(blog, input.nowIso)
  );
  const domains = new Set(blogs.map((blog) => blog.domain));
  let newCount = 0;
  for (const candidate of input.candidates) {
    const domain = candidate.domain.toLocaleLowerCase("en");
    if (
      newCount >= maxNew ||
      blogs.length >= maxRegistered ||
      domains.has(domain)
    ) {
      continue;
    }
    domains.add(domain);
    newCount += 1;
    blogs.push({
      domain,
      discoveredFrom: candidate.discoveredFrom,
      discoveredAt: input.nowIso,
      feedUrl: `https://${domain}/feed?exclude_body=1`,
      automationAllowed: false,
      customDomain: false,
      platformVerified: false,
      verifiedAt: null,
      verificationMethod: null,
      promotionReason: "feed-and-robots-verification-pending",
      candidateCount: null,
      failureCount: 0
    });
  }
  return {
    blogs: blogs.sort((a, b) => a.domain.localeCompare(b.domain)),
    newCount
  };
}

export async function verifyPendingHatenaBlogs(input: {
  blogs: HatenaBlogState[];
  nowIso: string;
  fetcher: DiscoveryFetcher;
  maxVerifiedDomains?: number;
}): Promise<{
  blogs: HatenaBlogState[];
  promotedCount: number;
  verifiedCount: number;
  failedCount: number;
}> {
  const maxVerified =
    input.maxVerifiedDomains ??
    BLOG_DISCOVERY_LIMITS.maxVerifiedDomains;
  let checked = 0;
  let promotedCount = 0;
  let failedCount = 0;
  const blogs: HatenaBlogState[] = [];

  for (const original of input.blogs) {
    const blog = { ...original };
    if (blog.automationAllowed || checked >= maxVerified) {
      blogs.push(blog);
      continue;
    }
    checked += 1;
    const robotsUrl = `https://${blog.domain}/robots.txt`;
    const robots = await input.fetcher(robotsUrl, "text");
    if (
      !robots.ok ||
      !isAllowedByRobots(robots.text, blog.feedUrl)
    ) {
      blog.failureCount += 1;
      blog.automationAllowed = false;
      blog.platformVerified = false;
      blog.verificationMethod = "robots-and-public-feed";
      blog.promotionReason = robots.ok
        ? "robots-disallowed-feed"
        : `robots-${robots.reason}`;
      failedCount += 1;
      blogs.push(blog);
      continue;
    }

    const feed = await input.fetcher(blog.feedUrl, "xml");
    const finalDomain = feed.ok
      ? new URL(feed.url).hostname.toLocaleLowerCase("en")
      : null;
    const candidates =
      feed.ok && finalDomain === blog.domain && isHatenaFeed(feed.text)
        ? parseHatenaFeed(feed.text, blog.feedUrl, 100)
        : [];
    if (
      !feed.ok ||
      finalDomain !== blog.domain ||
      !isHatenaFeed(feed.text) ||
      candidates.length === 0
    ) {
      blog.failureCount += 1;
      blog.automationAllowed = false;
      blog.platformVerified = false;
      blog.verificationMethod = "robots-and-public-feed";
      blog.promotionReason = !feed.ok
        ? `feed-${feed.reason}`
        : finalDomain !== blog.domain
          ? "unexpected-feed-redirect"
          : !isHatenaFeed(feed.text)
            ? "not-hatena-feed"
            : "no-target-candidates";
      blog.candidateCount = candidates.length;
      failedCount += 1;
      blogs.push(blog);
      continue;
    }

    blog.automationAllowed = true;
    blog.platformVerified = true;
    blog.verifiedAt = input.nowIso;
    blog.verificationMethod = "robots-and-public-feed";
    blog.promotionReason =
      "公開feed・はてな形式・robots許可・対象記事候補を確認";
    blog.candidateCount = candidates.length;
    blog.failureCount = 0;
    promotedCount += 1;
    blogs.push(blog);
  }
  return {
    blogs,
    promotedCount,
    verifiedCount: checked,
    failedCount
  };
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

export async function discoverBuildBlogs(options: {
  rootDir?: string;
  dryRun?: boolean;
  now?: Date;
  fetcher?: DiscoveryFetcher;
  includeLinkedDiscovery?: boolean;
} = {}): Promise<BlogDiscoveryResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const statusPath = path.join(rootDir, "data/buildArticleCollectionStatus.json");
  const generatedPath = path.join(rootDir, "data/buildArticles.generated.json");
  const status = JSON.parse(
    await readFile(statusPath, "utf8")
  ) as CollectionStatus;
  const nowIso = (options.now ?? new Date()).toISOString();
  const existing = (status.hatenaBlogs ?? []).map((blog) =>
    normalizeExistingBlog(blog, nowIso)
  );
  const remainingCapacity = Math.max(
    0,
    BLOG_DISCOVERY_LIMITS.maxNewDomains
  );
  const linked: Array<{ domain: string; discoveredFrom: string }> = [];

  if (options.includeLinkedDiscovery !== false) {
    const generated = JSON.parse(
      await readFile(generatedPath, "utf8")
    ) as Array<{ source: string; canonicalUrl: string }>;
    const activeDomains = existing
      .filter((blog) => blog.automationAllowed)
      .map((blog) => blog.domain);
    const linkConfig = {
      ...SOURCE_REGISTRY["hatena-blog"],
      allowedDomains: activeDomains
    };
    const linkClient = new SafeHttpClient(linkConfig);
    linked.push(
      ...(await discoverLinkedHatenaBlogCandidates({
        seeds: generated
          .filter((article) => article.source === "hatena-blog")
          .slice(0, 12)
          .map((article) => ({
            url: article.canonicalUrl,
            domain: new URL(article.canonicalUrl).hostname,
            depth: 1
          })),
        existingDomains: existing.map((blog) => blog.domain),
        maxNewDomains: remainingCapacity,
        fetchHtml: async (url) => {
          const result = await linkClient.fetchText(url, "html");
          return result.ok ? result.text : null;
        }
      }))
    );
  }

  const registration = registerBlogCandidates({
    blogs: existing,
    candidates: [
      ...linked,
      ...RESEARCHED_HATENA_BLOG_CANDIDATES
    ],
    nowIso
  });
  const domains = registration.blogs.map((blog) => blog.domain);
  const discoveryClient = new SafeHttpClient({
    ...SOURCE_REGISTRY["hatena-blog"],
    allowedDomains: domains,
    maxCandidates: BLOG_DISCOVERY_LIMITS.maxNewDomains,
    maxArticleFetches: BLOG_DISCOVERY_LIMITS.maxVerifiedDomains,
    requestDelayMs: Math.max(
      1000,
      SOURCE_REGISTRY["hatena-blog"].requestDelayMs
    ),
    timeoutMs: 15_000,
    retries: 2
  });
  const verified = await verifyPendingHatenaBlogs({
    blogs: registration.blogs,
    nowIso,
    fetcher:
      options.fetcher ??
      ((url, expected, fetchOptions) =>
        discoveryClient.fetchText(url, expected, fetchOptions))
  });
  const nextStatus: CollectionStatus = {
    ...status,
    hatenaBlogs: verified.blogs
  };
  const wroteFiles = !(options.dryRun ?? false);
  if (wroteFiles) {
    await writeJsonAtomically(statusPath, nextStatus);
  }
  return {
    blogs: verified.blogs,
    registeredBlogCount: verified.blogs.length,
    newDiscoveredBlogCount: registration.newCount,
    promotedBlogCount: verified.promotedCount,
    pendingBlogCount: verified.blogs.filter(
      (blog) => !blog.automationAllowed
    ).length,
    verifiedBlogCount: verified.verifiedCount,
    failedBlogCount: verified.failedCount,
    wroteFiles
  };
}
