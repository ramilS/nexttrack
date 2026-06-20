import { EventEmitter2 } from '@nestjs/event-emitter';
import { currentRequestId, runWithRequestId } from './request-context';

describe('request-context', () => {
  it('returns undefined outside of a context', () => {
    expect(currentRequestId()).toBeUndefined();
  });

  it('exposes the request id inside the context', () => {
    runWithRequestId('req-1', () => {
      expect(currentRequestId()).toBe('req-1');
    });
  });

  it('survives across await boundaries', async () => {
    await runWithRequestId('req-async', async () => {
      await new Promise((r) => setImmediate(r));
      expect(currentRequestId()).toBe('req-async');
    });
  });

  it('propagates into EventEmitter2 listeners fired within the context', async () => {
    const emitter = new EventEmitter2();
    let observed: string | undefined;

    emitter.on('evt', async () => {
      await new Promise((r) => setImmediate(r));
      observed = currentRequestId();
    });

    await runWithRequestId('req-evt', async () => {
      await emitter.emitAsync('evt');
    });

    expect(observed).toBe('req-evt');
  });

  it('isolates concurrent contexts', async () => {
    const results: Array<string | undefined> = [];
    await Promise.all([
      runWithRequestId('a', async () => {
        await new Promise((r) => setTimeout(r, 5));
        results.push(currentRequestId());
      }),
      runWithRequestId('b', async () => {
        results.push(currentRequestId());
      }),
    ]);
    expect(results.sort()).toEqual(['a', 'b']);
  });
});
