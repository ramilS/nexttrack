export class RateLimiter {
  private timestamps: number[] = [];

  constructor(private maxPerSecond: number) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 1000);

    if (this.timestamps.length >= this.maxPerSecond) {
      const oldestInWindow = this.timestamps[0]!;
      const waitMs = 1000 - (now - oldestInWindow);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    this.timestamps.push(Date.now());
  }
}
