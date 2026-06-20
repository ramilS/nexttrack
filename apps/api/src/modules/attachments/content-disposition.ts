const ASCII_PRINTABLE_MIN = 0x20;
const ASCII_PRINTABLE_MAX = 0x7e;
const ASCII_DEL = 0x7f;
const FALLBACK_FILENAME = 'download';

function stripControlChars(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= ASCII_PRINTABLE_MIN && code !== ASCII_DEL;
    })
    .join('');
}

function toAsciiFallback(value: string): string {
  const ascii = Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code > ASCII_PRINTABLE_MAX || char === '"' || char === '\\') {
        return '_';
      }
      return char;
    })
    .join('')
    .trim();

  return ascii.length > 0 ? ascii : FALLBACK_FILENAME;
}

// RFC 5987 requires percent-encoding beyond what encodeURIComponent covers.
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Builds a Content-Disposition header value that forces a download with the
 * original filename. CR/LF and other control characters are stripped (header
 * injection), quotes/backslashes are neutralized in the ASCII fallback, and
 * non-ASCII names are carried via the RFC 5987 `filename*` parameter.
 */
export function buildAttachmentDisposition(filename: string): string {
  const safe = stripControlChars(filename);
  const asciiName = toAsciiFallback(safe);
  const utf8Name = encodeRfc5987(safe);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;
}
