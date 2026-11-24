const OWNERS = ["tsirysndr", "fluentci-io"];
const HOUR = 60 * 60 * 1000;

interface Repository {
  id: number;
  fork: boolean;
  stargazers_count: number;
}

let cachedStars: number | null = null;
let refreshAt = 0;
let pending: Promise<number | null> | undefined;

async function repositories(owner: string, signal: AbortSignal) {
  const result: Repository[] = [];
  for (let page = 1;; page++) {
    const response = await fetch(
      `https://api.github.com/users/${owner}/repos?type=owner&per_page=100&page=${page}`,
      {
        signal,
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "tsiry-sandratraina.com",
        },
      },
    );
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
    const batch: Repository[] = await response.json();
    result.push(...batch);
    if (!response.headers.get("link")?.includes('rel="next"')) return result;
  }
}

export function getGitHubStars(): Promise<number | null> {
  if (pending) return pending;
  if (Date.now() < refreshAt) return Promise.resolve(cachedStars);

  pending = (async () => {
    try {
      const signal = AbortSignal.timeout(8000);
      const groups = await Promise.all(
        OWNERS.map((owner) => repositories(owner, signal)),
      );
      const unique = new Map(groups.flat().map((repo) => [repo.id, repo]));
      cachedStars = [...unique.values()]
        .filter((repo) => !repo.fork)
        .reduce((sum, repo) => sum + repo.stargazers_count, 0);
      refreshAt = Date.now() + HOUR;
    } catch (error) {
      console.warn(
        "Could not refresh GitHub stars:",
        error instanceof Error ? error.message : String(error),
      );
      // Keep the last complete total and wait before retrying a failed refresh.
      refreshAt = Date.now() + 5 * 60 * 1000;
    } finally {
      pending = undefined;
    }
    return cachedStars;
  })();
  return pending;
}
