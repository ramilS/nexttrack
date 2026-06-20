import {
  WebhookUrlError,
  isPrivateIp,
  validateWebhookUrlSync,
} from './url-validator';

describe('isPrivateIp', () => {
  it.each([
    ['10.0.0.1', true],
    ['10.255.255.255', true],
    ['127.0.0.1', true],
    ['169.254.169.254', true], // AWS metadata
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['192.168.1.1', true],
    ['100.64.0.1', true], // CGNAT
    ['224.0.0.1', true], // multicast
    ['0.0.0.0', true],
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['172.32.0.1', false], // boundary outside private
    ['100.63.0.1', false], // outside CGNAT
    ['192.169.1.1', false],
    ['::1', true],
    ['fe80::1', true],
    ['fc00::1', true],
    ['fd00::1', true],
    ['ff00::1', true],
    ['2001:db8::1', false],
    ['', false],
    ['not-an-ip', false],
  ])('%s → isPrivate=%s', (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });
});

describe('validateWebhookUrlSync (allowPrivate=false)', () => {
  it('accepts a public https URL', () => {
    expect(() =>
      validateWebhookUrlSync('https://api.example.com/hooks', false),
    ).not.toThrow();
  });

  it.each([
    ['ftp://example.com', /scheme/],
    ['file:///etc/passwd', /scheme/],
    ['javascript:alert(1)', /scheme/],
    ['http://example.com', /https/i],
    ['https://localhost/x', /hostname/],
    ['https://service.local/x', /hostname/],
    ['https://service.internal/x', /hostname/],
    ['https://0.0.0.0/x', /hostname|private IP/],
    ['https://127.0.0.1/x', /private IP/],
    ['https://169.254.169.254/latest/meta-data', /private IP/],
    ['https://10.0.0.5/x', /private IP/],
    ['https://172.16.0.1/x', /private IP/],
    ['https://192.168.1.1/x', /private IP/],
    ['https://[::1]/x', /private IP/],
    ['not-a-url', /not parseable/],
  ])('rejects %s', (url, pattern) => {
    expect(() => validateWebhookUrlSync(url, false)).toThrow(WebhookUrlError);
    expect(() => validateWebhookUrlSync(url, false)).toThrow(pattern);
  });
});

describe('validateWebhookUrlSync (allowPrivate=true)', () => {
  it('allows http://localhost in dev/test', () => {
    expect(() =>
      validateWebhookUrlSync('http://localhost:3001/hook', true),
    ).not.toThrow();
  });

  it('still rejects unsupported schemes', () => {
    expect(() =>
      validateWebhookUrlSync('ftp://localhost/x', true),
    ).toThrow(WebhookUrlError);
  });
});
