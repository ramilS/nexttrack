import { BackgroundTasks } from './background-tasks.service';

describe('BackgroundTasks', () => {
  let background: BackgroundTasks;

  beforeEach(() => {
    background = new BackgroundTasks();
  });

  const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  describe('whenIdle', () => {
    it('resolves to true immediately when nothing is tracked', async () => {
      await expect(background.whenIdle()).resolves.toBe(true);
    });

    it('returns false when it times out with work still pending', async () => {
      // Arrange — a task that never settles within the window
      const stuck = deferred<void>();
      background.track(stuck.promise);

      // Act
      const drained = await background.whenIdle(20);

      // Assert
      expect(drained).toBe(false);

      // Cleanup so the dangling promise doesn't leak into other tests
      stuck.resolve();
      await background.whenIdle();
    });

    it('returns true when work settles before the timeout', async () => {
      // Arrange
      const task = deferred<void>();
      background.track(task.promise);
      setTimeout(() => task.resolve(), 5);

      // Act / Assert
      await expect(background.whenIdle(1000)).resolves.toBe(true);
    });

    it('waits for a tracked promise to settle before resolving', async () => {
      // Arrange
      const task = deferred<void>();
      let settled = false;
      background.track(task.promise);

      // Act
      const idle = background.whenIdle().then(() => {
        settled = true;
      });
      await Promise.resolve();

      // Assert — still pending while the task is in flight
      expect(settled).toBe(false);
      task.resolve();
      await idle;
      expect(settled).toBe(true);
    });

    it('waits for tasks spawned by other tasks (nested scheduling)', async () => {
      // Arrange
      const inner = deferred<void>();
      const outer = Promise.resolve().then(() => {
        background.track(inner.promise);
      });
      background.track(outer);

      // Act
      let settled = false;
      const idle = background.whenIdle().then(() => {
        settled = true;
      });

      // Assert — must keep waiting for the inner task scheduled after outer
      await outer;
      await Promise.resolve();
      expect(settled).toBe(false);
      inner.resolve();
      await idle;
      expect(settled).toBe(true);
    });
  });

  describe('run', () => {
    it('routes a rejected task to onError without rethrowing', async () => {
      // Arrange
      const onError = jest.fn();
      const boom = new Error('boom');

      // Act
      background.run(() => Promise.reject(boom), onError);
      await background.whenIdle();

      // Assert
      expect(onError).toHaveBeenCalledWith(boom);
    });

    it('wraps a non-Error rejection in an Error', async () => {
      // Arrange
      const onError = jest.fn();

      // Act
      background.run(() => Promise.reject('string failure'), onError);
      await background.whenIdle();

      // Assert
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('string failure');
    });

    it('invokes the task synchronously', () => {
      // Arrange
      const task = jest.fn().mockResolvedValue(undefined);

      // Act
      background.run(task, jest.fn());

      // Assert — callers that fire side effects rely on eager invocation
      expect(task).toHaveBeenCalledTimes(1);
    });
  });

  describe('onModuleDestroy', () => {
    it('drains in-flight work before resolving', async () => {
      // Arrange
      const task = deferred<void>();
      background.track(task.promise);

      // Act
      let destroyed = false;
      const destroy = background.onModuleDestroy().then(() => {
        destroyed = true;
      });
      await Promise.resolve();

      // Assert
      expect(destroyed).toBe(false);
      task.resolve();
      await destroy;
      expect(destroyed).toBe(true);
    });
  });
});
