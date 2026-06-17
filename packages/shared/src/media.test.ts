import { describe, it, expect } from 'vitest';
import { validateMedia, mediaExt, type MediaAsset } from './media';

const img = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  uri: 'file:///a.jpg',
  kind: 'image',
  mimeType: 'image/jpeg',
  fileName: 'a.jpg',
  sizeBytes: 1024,
  ...over,
});
const vid = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  uri: 'file:///a.mp4',
  kind: 'video',
  mimeType: 'video/mp4',
  fileName: 'a.mp4',
  sizeBytes: 1024,
  durationMs: 5000,
  ...over,
});

describe('validateMedia (facebook)', () => {
  it('accepts an empty set', () => {
    expect(validateMedia([], ['facebook'])).toBeNull();
  });

  it('accepts a few photos', () => {
    expect(validateMedia([img(), img()], ['facebook'])).toBeNull();
  });

  it('accepts a single video', () => {
    expect(validateMedia([vid()], ['facebook'])).toBeNull();
  });

  it('rejects mixing photos and a video', () => {
    expect(validateMedia([img(), vid()], ['facebook'])).toMatch(/combine/i);
  });

  it('rejects more than one video', () => {
    expect(validateMedia([vid(), vid({ uri: 'file:///b.mp4' })], ['facebook'])).toMatch(/video/i);
  });

  it('rejects an oversized photo', () => {
    expect(validateMedia([img({ sizeBytes: 20 * 1024 * 1024 })], ['facebook'])).toMatch(/large/i);
  });

  it('rejects an unsupported format', () => {
    expect(
      validateMedia([img({ fileName: 'a.heic', mimeType: 'image/heic' })], ['facebook']),
    ).toMatch(/format/i);
  });

  it('ignores unknown platforms', () => {
    expect(validateMedia([img({ sizeBytes: 99 * 1024 * 1024 })], ['tiktok'])).toBeNull();
  });
});

describe('validateMedia (instagram)', () => {
  it('rejects PNG images (JPEG only)', () => {
    expect(
      validateMedia([img({ fileName: 'a.png', mimeType: 'image/png' })], ['instagram']),
    ).toMatch(/format .png/i);
  });

  it('allows JPEG', () => {
    expect(validateMedia([img()], ['instagram'])).toBeNull();
  });

  it('allows mixing photos and a video (carousel)', () => {
    expect(validateMedia([img(), vid()], ['instagram'])).toBeNull();
  });

  it('facebook+instagram enforces the tightest rule (PNG rejected)', () => {
    expect(
      validateMedia([img({ fileName: 'a.png', mimeType: 'image/png' })], ['facebook', 'instagram']),
    ).toMatch(/png/i);
  });
});

describe('mediaExt', () => {
  it('reads the extension from the file name', () => {
    expect(mediaExt({ fileName: 'clip.MP4', uri: 'file:///x', mimeType: 'video/mp4' })).toBe('mp4');
  });
});
