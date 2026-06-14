import { describe, it, expect } from 'vitest';
import { parseFacebookPost } from './sourcePost';

describe('parseFacebookPost', () => {
  it('parses a text-only post', () => {
    const p = parseFacebookPost({ id: 'p1', message: 'hello' });
    expect(p).toEqual({ external_post_id: 'p1', type: 'text', text: 'hello', media: [] });
  });
  it('parses a single-image post', () => {
    const p = parseFacebookPost({ id: 'p2', message: 'pic', full_picture: 'http://img/1.jpg' });
    expect(p.type).toBe('image');
    expect(p.media).toEqual(['http://img/1.jpg']);
  });
  it('parses a video post', () => {
    const p = parseFacebookPost({ id: 'p3', message: 'vid', attachments: { data: [{ media_type: 'video', media: { source: 'http://v/1.mp4' } }] } });
    expect(p.type).toBe('video');
    expect(p.media).toEqual(['http://v/1.mp4']);
  });
  it('defaults empty message to empty text', () => {
    expect(parseFacebookPost({ id: 'p4' }).text).toBe('');
  });
});
