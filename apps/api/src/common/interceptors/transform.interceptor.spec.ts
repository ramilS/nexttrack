import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';
import { createMockExecutionContext } from '@test/helpers';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  it('should wrap plain data in { data, meta }', (done) => {
    const context = createMockExecutionContext();
    const handler = { handle: () => of({ id: 1, name: 'Test' }) };

    interceptor.intercept(context, handler).subscribe((result) => {
      expect(result.data).toEqual({ id: 1, name: 'Test' });
      expect(result.meta.timestamp).toBeDefined();
      done();
    });
  });

  it('should not double-wrap data that already has data+meta', (done) => {
    const context = createMockExecutionContext();
    const existing = { items: [1, 2], meta: { total: 2 } };
    const handler = { handle: () => of(existing) };

    interceptor.intercept(context, handler).subscribe((result) => {
      expect(result).toBe(existing);
      done();
    });
  });

  it('should wrap null data', (done) => {
    const context = createMockExecutionContext();
    const handler = { handle: () => of(null) };

    interceptor.intercept(context, handler).subscribe((result) => {
      expect(result.data).toBeNull();
      expect(result.meta.timestamp).toBeDefined();
      done();
    });
  });
});
