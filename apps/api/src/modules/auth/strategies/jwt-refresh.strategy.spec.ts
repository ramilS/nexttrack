import { JwtRefreshStrategy } from './jwt-refresh.strategy';
import { mockAuthConfig } from '@test/helpers';

describe('JwtRefreshStrategy', () => {
  let strategy: JwtRefreshStrategy;

  beforeEach(() => {
    strategy = new JwtRefreshStrategy(mockAuthConfig);
  });

  describe('validate', () => {
    it('should return id from sub and refreshToken from jti', async () => {
      const payload = { sub: 'user-123', jti: 'raw-token-abc' };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        id: 'user-123',
        refreshToken: 'raw-token-abc',
      });
    });

    it('should not read raw cookie value as refreshToken', () => {
      const payload = { sub: 'user-456', jti: 'correct-raw-token' };

      const result = strategy.validate(payload);

      expect(result.refreshToken).toBe('correct-raw-token');
    });
  });
});
