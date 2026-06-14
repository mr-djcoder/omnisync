import { describe, it, expect } from 'vitest';
import { parseLookupResponse } from './emailLookup';

describe('parseLookupResponse', () => {
  it('reads exists:true', () => {
    expect(parseLookupResponse({ exists: true })).toEqual({ mode: 'login' });
  });
  it('reads exists:false', () => {
    expect(parseLookupResponse({ exists: false })).toEqual({ mode: 'signup' });
  });
  it('defaults to signup on malformed payload', () => {
    expect(parseLookupResponse(null)).toEqual({ mode: 'signup' });
  });
});
