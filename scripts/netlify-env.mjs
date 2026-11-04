import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'dotenv';
import realtimeDefault from '../src/lib/realtime-default.json' with { type: 'json' };

const aliases = {
  DATABASE_URL: 'NEON_KEY',
  REALTIME_URL: 'NEXT_PUBLIC_REALTIME_URL',
  NEON_STORAGE_ENDPOINT: 'AWS_ENDPOINT_URL_S3',
  NEON_STORAGE_ACCESS_KEY_ID: 'AWS_ACCESS_KEY_ID',
  NEON_STORAGE_SECRET_ACCESS_KEY: 'AWS_SECRET_ACCESS_KEY',
  NEON_STORAGE_REGION: 'AWS_REGION',
};
const keys = [
  'DATABASE_URL', 'SESSION_SECRET', 'GAME_REWARD_SECRET',
  'NEON_STORAGE_ENDPOINT', 'NEON_STORAGE_ACCESS_KEY_ID', 'NEON_STORAGE_SECRET_ACCESS_KEY',
  'NEON_STORAGE_REGION', 'NEON_STORAGE_BUCKET',
  'NEON_REALTIME_URL', 'NEON_REALTIME_SECRET', 'NEON_REALTIME_DATABASE',
  'NEON_DATA_API_URL', 'NEON_DATA_API_TOKEN', 'NEON_AUTH_URL', 'NEON_JWKS_URL',
  'REALTIME_URL', 'NEXT_PUBLIC_REALTIME_URL',
];
const localHost = (host) => host === 'localhost' || host === '[::1]' || /^127\./.test(host);

/** Recover the old pasted URLs before applying the deployment allowlist. */
function parseEnvSource(source) {
  const parsed = parse(source);
  for (const line of source.split(/\r?\n/)) {
    const value = line.trim().replace(/;$/, '');
    if (!/^https:\/\//.test(value)) continue;
    try {
      const url = new URL(value);
      if (url.username || url.password || url.search || url.hash) continue;
      let key;
      if (url.hostname.includes('.neonauth.')) key = url.pathname.endsWith('/.well-known/jwks.json') ? 'NEON_JWKS_URL' : 'NEON_AUTH_URL';
      else if (url.hostname.includes('.rt.')) key = 'NEON_REALTIME_URL';
      else if (url.hostname.includes('.apirest.')) key = 'NEON_DATA_API_URL';
      if (key && !parsed[key]) parsed[key] = url.href.replace(/\/$/, '');
    } catch { /* Invalid pasted lines are not exported. */ }
  }
  return parsed;
}

function canonicalEnv(parsed) {
  const result = {};
  for (const key of keys) {
    const alias = aliases[key];
    const value = (parsed[key] || (alias ? parsed[alias] : '') || '').trim();
    if (value) result[key] = key === 'DATABASE_URL' ? value.replace(/;$/, '') : value;
  }
  return result;
}

export function normalizeEnv(source) {
  return canonicalEnv(parseEnvSource(source));
}

/** Match runtime precedence: file overrides first, canonical names beat legacy aliases. */
export function buildExportEnv(sources, previous = {}, roomUrl) {
  const env = canonicalEnv(Object.assign({}, ...sources.map(parseEnvSource)));
  let room = roomUrl?.trim() || env.REALTIME_URL;
  if (!roomUrl) {
    try { if (localHost(new URL(room).hostname)) room = undefined; } catch { /* Validator reports malformed nonempty URLs. */ }
    room ||= previous.REALTIME_URL || previous.NEXT_PUBLIC_REALTIME_URL || realtimeDefault.url;
  }
  try { const parsed = new URL(room); if (parsed.protocol === 'https:') parsed.protocol = 'wss:'; room = parsed.href.replace(/\/$/, ''); } catch { /* Validator reports invalid values without echoing them. */ }
  env.REALTIME_URL = room;
  env.NEXT_PUBLIC_REALTIME_URL = room;
  env.SESSION_SECRET ||= previous.SESSION_SECRET;
  return env;
}

export function serializeEnv(env) {
  return keys.map((key) => {
    const value = env[key] || '';
    // Single quotes preserve #, &, $, and backslashes during dotenv import.
    if (/[\r\n']/.test(value)) throw new Error(`Unsupported characters in ${key}; set this variable directly in Netlify.`);
    return `${key}='${value}'`;
  }).join('\n') + '\n';
}

/** Offline validation only. Diagnostics contain names, never secret values. */
export function validateEnv(env, requireMultiplayer = false) {
  const errors = [];
  const warnings = [];
  const required = ['DATABASE_URL', 'SESSION_SECRET', 'NEON_STORAGE_ENDPOINT', 'NEON_STORAGE_ACCESS_KEY_ID', 'NEON_STORAGE_SECRET_ACCESS_KEY', 'NEON_STORAGE_BUCKET', 'NEON_REALTIME_URL', 'NEON_REALTIME_SECRET'];
  for (const key of required) if (!env[key]) errors.push(`Missing ${key}`);
  if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32) errors.push('SESSION_SECRET must contain at least 32 characters');
  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password || url.pathname.length < 2) throw new Error();
    } catch { errors.push('Invalid DATABASE_URL'); }
  }
  for (const key of ['NEON_STORAGE_ENDPOINT', 'NEON_REALTIME_URL', 'NEON_DATA_API_URL', 'NEON_AUTH_URL', 'NEON_JWKS_URL']) {
    if (!env[key]) continue;
    try {
      const url = new URL(env[key]);
      const validProtocol = url.protocol === 'https:' || (key === 'NEON_REALTIME_URL' && url.protocol === 'wss:');
      if (!validProtocol || url.username || url.password || url.search || url.hash) throw new Error();
      if (key === 'NEON_STORAGE_ENDPOINT' && url.pathname !== '/') throw new Error();
    } catch { errors.push(`Invalid ${key}`); }
  }
  const roomValue = env.REALTIME_URL || env.NEXT_PUBLIC_REALTIME_URL;
  const roomKey = env.REALTIME_URL ? 'REALTIME_URL' : 'NEXT_PUBLIC_REALTIME_URL';
  if (roomValue) {
    try {
      const url = new URL(roomValue);
      const isNeonSql = url.hostname.includes('.rt.') && url.hostname.endsWith('.neon.tech');
      if (url.protocol !== 'wss:' || localHost(url.hostname) || isNeonSql || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    } catch { errors.push(`${roomKey} must be the public wss:// Worker origin, without a room path`); }
  } else {
    (requireMultiplayer ? errors : warnings).push('REALTIME_URL is missing: export the public Cloudflare room server URL to enable multiplayer');
  }
  if (env.NEON_DATA_API_URL && !env.NEON_DATA_API_TOKEN) warnings.push('Data API has no JWT: PostgreSQL remains active; Neon Auth is not enabled');
  return { errors, warnings };
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}`);
    return args[index + 1];
  };
  let env = {};
  let output;
  if (command === 'export') {
    const sources = ['.env', '.env.local'].filter(existsSync).map((file) => readFileSync(file, 'utf8'));
    const previous = existsSync('.env.netlify') ? normalizeEnv(readFileSync('.env.netlify', 'utf8')) : {};
    env = buildExportEnv(sources, previous, option('--room-url'));
    // Re-exporting preserves the existing guest secret and public room URL.
    env.SESSION_SECRET ||= randomBytes(32).toString('hex');
    env.NEON_STORAGE_REGION ||= 'us-east-2';
    output = '.env.netlify';
  } else if (command === 'check') {
    const file = option('--file') || '.env.netlify';
    if (!existsSync(file)) throw new Error('Environment file not found. Run pnpm env:netlify first.');
    env = normalizeEnv(readFileSync(file, 'utf8'));
  } else throw new Error('Use pnpm env:netlify or pnpm env:check [--file .env.netlify] [--require-multiplayer].');
  const { errors, warnings } = validateEnv(env, args.includes('--require-multiplayer'));
  for (const message of warnings) console.warn(`Warning: ${message}`);
  if (errors.length) {
    for (const message of errors) console.error(`Error: ${message}`);
    process.exitCode = 1;
    return;
  }
  if (output) {
    const comment = '# Import this private file into Netlify with Builds + Functions scope. Do not commit.\n# Auth/JWKS are reference URLs only; guest login stays active.\n';
    writeFileSync(output, comment + serializeEnv(env), { mode: 0o600 });
    console.log(`Created ${output}; ${keys.filter((key) => env[key]).length} named variables, no AWS_* keys. Secret values were not printed.`);
  } else console.log('Environment syntax and required Neon/guest configuration passed (offline check).');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch { console.error('Environment preparation failed. Check file permissions, NAME=value syntax and command options. No secrets were printed.'); process.exitCode = 1; }
}
