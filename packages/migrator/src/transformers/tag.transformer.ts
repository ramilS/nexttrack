const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;

// The target accepts a palette name or #RRGGBB. YouTrack tag colors come as
// { background?, foreground? } objects; keep the background when it is a hex,
// otherwise fall back to the neutral palette color.
export function mapTagColor(ytColor: unknown): string {
  const background = (ytColor as { background?: unknown } | null | undefined)
    ?.background;
  if (typeof background === 'string') {
    if (HEX6.test(background)) return background;
    const short = HEX3.exec(background);
    if (short) {
      return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
    }
  }
  return 'gray';
}
