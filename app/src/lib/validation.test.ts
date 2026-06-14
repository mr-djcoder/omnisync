import { describe, it, expect } from 'vitest';
import { isValidEmail } from './validation';

describe('isValidEmail', () => {
  it('accepts a normal address', () => {
    expect(isValidEmail('name@company.com')).toBe(true);
  });
  it('rejects a missing domain', () => {
    expect(isValidEmail('name@')).toBe(false);
  });
  it('rejects empty input', () => {
    expect(isValidEmail('')).toBe(false);
  });
});
