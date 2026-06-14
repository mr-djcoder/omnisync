import { describe, it, expect } from 'vitest';
import { ProfileSchema } from './schemas';

describe('ProfileSchema', () => {
  it('accepts a valid profile', () => {
    const parsed = ProfileSchema.parse({
      id: '00000000-0000-0000-0000-000000000000',
      username: 'creator',
      created_at: '2026-06-13T00:00:00.000Z',
    });
    expect(parsed.username).toBe('creator');
  });

  it('rejects a non-uuid id', () => {
    expect(() => ProfileSchema.parse({ id: 'nope', username: 'x' })).toThrow();
  });
});
