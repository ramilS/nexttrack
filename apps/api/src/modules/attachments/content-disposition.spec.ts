import { buildAttachmentDisposition } from './content-disposition';

describe('buildAttachmentDisposition', () => {
  it('forces attachment with plain ASCII filename', () => {
    expect(buildAttachmentDisposition('report.pdf')).toBe(
      'attachment; filename="report.pdf"; filename*=UTF-8\'\'report.pdf',
    );
  });

  it('strips CR/LF to prevent header injection', () => {
    const result = buildAttachmentDisposition(
      'evil\r\nContent-Type: text/html.pdf',
    );

    expect(result).not.toContain('\r');
    expect(result).not.toContain('\n');
    expect(result).toContain('filename="evilContent-Type: text/html.pdf"');
  });

  it('neutralizes quotes and backslashes in the ASCII fallback', () => {
    const result = buildAttachmentDisposition('na"me\\file.txt');

    expect(result).toContain('filename="na_me_file.txt"');
  });

  it('encodes non-ASCII names via RFC 5987 filename*', () => {
    const result = buildAttachmentDisposition('отчёт.pdf');

    expect(result).toContain('filename="_____.pdf"');
    expect(result).toContain(
      "filename*=UTF-8''%D0%BE%D1%82%D1%87%D1%91%D1%82.pdf",
    );
  });

  it('percent-encodes RFC 5987 special characters', () => {
    const result = buildAttachmentDisposition("file'(1)*.txt");

    expect(result).toContain("filename*=UTF-8''file%27%281%29%2A.txt");
  });

  it('falls back to a default name when nothing printable remains', () => {
    const result = buildAttachmentDisposition('\r\n');

    expect(result).toContain('filename="download"');
  });
});
