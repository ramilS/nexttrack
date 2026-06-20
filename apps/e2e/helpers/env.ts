import * as fs from 'fs';
import * as path from 'path';

interface E2eEnv {
  webUrl: string;
  apiUrl: string;
}

const ENV_PATH = path.resolve(__dirname, '../.env.e2e');

function parseEnvFile(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};

  const content = fs.readFileSync(ENV_PATH, 'utf-8');
  const env: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key) env[key.trim()] = rest.join('=').trim();
  }

  return env;
}

let cached: E2eEnv | undefined;

export function getE2eEnv(): E2eEnv {
  if (cached) return cached;

  const fileEnv = parseEnvFile();

  cached = {
    webUrl: fileEnv['WEB_URL'] ?? process.env['WEB_URL'] ?? 'http://localhost:3000',
    apiUrl: fileEnv['API_URL'] ?? process.env['API_URL'] ?? 'http://localhost:3001',
  };

  return cached;
}
