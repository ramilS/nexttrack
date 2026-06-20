type AuthEvent = 'logged-in' | 'logged-out';

const CHANNEL_NAME = 'next-track:auth';

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

export function publishAuthEvent(event: AuthEvent): void {
  getChannel()?.postMessage({ event });
}

export function subscribeAuthEvent(
  handler: (event: AuthEvent) => void,
): () => void {
  const ch = getChannel();
  if (!ch) return () => {};

  const listener = (msg: MessageEvent<{ event: AuthEvent }>) => {
    handler(msg.data.event);
  };
  ch.addEventListener('message', listener);
  return () => ch.removeEventListener('message', listener);
}
