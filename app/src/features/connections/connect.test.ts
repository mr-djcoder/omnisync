import { describe, it, expect } from 'vitest';
import { providerLabel, isWired } from './connect';

describe('connect helpers', () => {
  it('labels facebook', () => {
    expect(providerLabel('facebook')).toBe('Facebook');
  });
  it('marks facebook as wired and others as coming soon', () => {
    expect(isWired('facebook')).toBe(true);
    expect(isWired('tiktok')).toBe(false);
  });
});
