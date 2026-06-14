import { describe, it, expect } from 'vitest';
import { colors } from './tokens';

describe('design tokens', () => {
  it('exposes the brand primary and secondary', () => {
    expect(colors.primary).toBe('#ddb7ff');
    expect(colors.secondary).toBe('#4cd7f6');
  });

  it('exposes the base background', () => {
    expect(colors.background).toBe('#16111b');
  });
});
