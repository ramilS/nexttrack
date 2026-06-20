import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/**
 * RFC1918 + loopback + link-local + AWS metadata + IETF special-use ranges.
 * Anything that resolves into one of these must not be reachable as a webhook
 * target unless `allowPrivateUrls` is explicitly enabled (dev/test only).
 */
const PRIVATE_V4_PATTERNS: RegExp[] = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^22[4-9]\./,
  /^23[0-9]\./,
  /^24[0-9]\./,
  /^25[0-5]\./,
];

const PRIVATE_V6_PATTERNS: RegExp[] = [
  /^::1$/,
  /^::$/,
  /^::ffff:127\./i,
  /^::ffff:10\./i,
  /^::ffff:192\.168\./i,
  /^fc/i,
  /^fd/i,
  /^fe[89ab]/i,
  /^ff/i,
];

// Numeric/IP literals are caught downstream by isPrivateIp; this set is for
// hostnames (DNS-resolvable names) that should never be accepted regardless
// of where they happen to resolve.
const PRIVATE_HOSTNAMES = new Set(['localhost']);

const PRIVATE_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.intranet'];

export class WebhookUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookUrlError';
  }
}

export function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return PRIVATE_V4_PATTERNS.some((p) => p.test(ip));
  if (family === 6) {
    const normalized = ip.toLowerCase();
    return PRIVATE_V6_PATTERNS.some((p) => p.test(normalized));
  }
  return false;
}

function looksLikePrivateHostname(host: string): boolean {
  const lower = host.toLowerCase();
  if (PRIVATE_HOSTNAMES.has(lower)) return true;
  return PRIVATE_HOST_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

/**
 * Synchronous structural check: scheme allowlist, obvious private
 * hostnames, literal private IPs. Does not perform DNS lookups, so
 * suitable for use inside Zod schemas.
 *
 * @throws WebhookUrlError on rejection.
 */
export function validateWebhookUrlSync(rawUrl: string, allowPrivate: boolean): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WebhookUrlError('URL is not parseable');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebhookUrlError(`Disallowed URL scheme: ${url.protocol}`);
  }

  if (allowPrivate) return url;

  if (url.protocol === 'http:') {
    throw new WebhookUrlError('Plain http:// is not allowed; use https://');
  }

  // Strip surrounding brackets that URL parser keeps for IPv6 hostnames.
  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  if (looksLikePrivateHostname(hostname)) {
    throw new WebhookUrlError(`Disallowed hostname: ${hostname}`);
  }

  if (isIP(hostname) && isPrivateIp(hostname)) {
    throw new WebhookUrlError(`Disallowed private IP: ${hostname}`);
  }

  return url;
}

/**
 * Resolve hostname via DNS and assert it is not in a private range.
 * Use this immediately before issuing the HTTP request to defeat
 * DNS-rebinding (an attacker who controls DNS can return a public
 * IP at create time and a private IP at delivery time).
 *
 * @throws WebhookUrlError if the resolved address is private.
 */
export async function assertResolvedAddressIsPublic(
  hostname: string,
  allowPrivate: boolean,
): Promise<string> {
  if (allowPrivate) return hostname;

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new WebhookUrlError(`Disallowed private IP: ${hostname}`);
    }
    return hostname;
  }

  const { address } = await lookup(hostname);
  if (isPrivateIp(address)) {
    throw new WebhookUrlError(
      `Hostname ${hostname} resolves to private address ${address}`,
    );
  }
  return address;
}
