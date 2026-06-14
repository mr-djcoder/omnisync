import { describe, it, expect } from 'vitest';
import { AIVariationsSchema, buildVariationPrompt, charCount } from './variation';

describe('variation', () => {
  it('counts characters', () => {
    expect(charCount('hello')).toBe(5);
  });
  it('validates AI output', () => {
    const v = AIVariationsSchema.parse({ facebook: 'a', tiktok: 'b' });
    expect(v.facebook).toBe('a');
  });
  it('rejects non-string variation', () => {
    expect(() => AIVariationsSchema.parse({ facebook: 5 })).toThrow();
  });
  it('builds a prompt that includes the source text and platforms', () => {
    const p = buildVariationPrompt('Launch day!', ['facebook', 'tiktok']);
    expect(p).toContain('Launch day!');
    expect(p).toContain('facebook');
    expect(p).toContain('tiktok');
  });
});
