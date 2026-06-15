import { describe, it, expect } from 'vitest';
import { parseFacebookHandle } from './fbUrl';

describe('parseFacebookHandle', () => {
  it('extracts a handle from a page url', () => {
    expect(parseFacebookHandle('https://www.facebook.com/nursenextdoor/')).toBe('nursenextdoor');
  });
  it('handles no trailing slash + query', () => {
    expect(parseFacebookHandle('https://facebook.com/nursenextdoor?ref=x')).toBe('nursenextdoor');
  });
  it('returns null for non-facebook url', () => {
    expect(parseFacebookHandle('https://example.com/x')).toBeNull();
  });
});
