import { describe, it, expect } from 'vitest';
import { igItemPayload, igPublishKind } from './instagram';

describe('igItemPayload', () => {
  it('image → image_url', () => {
    expect(igItemPayload('https://x/a.jpg', false)).toEqual({ image_url: 'https://x/a.jpg' });
  });

  it('video → REELS media_type + video_url', () => {
    expect(igItemPayload('https://x/a.mp4', false)).toEqual({
      media_type: 'REELS',
      video_url: 'https://x/a.mp4',
    });
  });

  it('carousel image child sets is_carousel_item', () => {
    expect(igItemPayload('https://x/a.jpg', true)).toEqual({
      image_url: 'https://x/a.jpg',
      is_carousel_item: true,
    });
  });

  it('carousel video child uses VIDEO (not REELS) + is_carousel_item', () => {
    expect(igItemPayload('https://x/a.mp4', true)).toEqual({
      media_type: 'VIDEO',
      video_url: 'https://x/a.mp4',
      is_carousel_item: true,
    });
  });
});

describe('igPublishKind', () => {
  it('classifies media counts', () => {
    expect(igPublishKind([])).toBe('none');
    expect(igPublishKind(['a.jpg'])).toBe('single');
    expect(igPublishKind(['a.jpg', 'b.jpg'])).toBe('carousel');
  });
});
