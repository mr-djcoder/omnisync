import { describe, it, expect } from 'vitest';
import { ConnectionSchema, PROVIDERS } from './connections';

describe('connections', () => {
  it('lists the supported providers', () => {
    expect(PROVIDERS).toContain('facebook');
  });
  it('validates a token-free connection row', () => {
    const row = ConnectionSchema.parse({
      id: '00000000-0000-0000-0000-000000000000',
      user_id: '00000000-0000-0000-0000-000000000000',
      provider: 'facebook',
      external_id: '123',
      handle: 'Passport Planet',
      scopes: ['pages_show_list'],
      is_owned: true,
      connector_type: 'owned_api',
      status: 'active',
    });
    expect(row.provider).toBe('facebook');
  });
  it('rejects an unknown provider', () => {
    expect(() => ConnectionSchema.parse({ provider: 'myspace' })).toThrow();
  });
});
