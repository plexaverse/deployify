import { getFileContent } from '../github';

export interface VercelCron {
  path: string;
  schedule: string;
}

export interface VercelConfig {
  crons?: VercelCron[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

type FileFetcher = (
  accessToken: string,
  owner: string,
  repo: string,
  path: string
) => Promise<string | null>;

/**
 * Parse vercel.json configuration from a repository
 */
export async function parseVercelConfig(
  repoFullName: string,
  accessToken: string,
  fetcher: FileFetcher = getFileContent
): Promise<VercelConfig | null> {
  const parts = repoFullName.split('/');
  if (parts.length !== 2) {
    return null;
  }
  const [owner, repo] = parts;

  const content = await fetcher(accessToken, owner, repo, 'vercel.json');
  if (!content) {
    return null;
  }

  try {
    const config = JSON.parse(content);
    return config;
  } catch {
    return null;
  }
}
