// Pure builders for the Instagram Content Publishing API container payloads.
// Kept dependency-free so they can be unit-tested and mirrored in the Deno
// publish function (which can't import this workspace package).

function isVideo(u: string): boolean {
  return /\.(mp4|mov|m4v)(\?|$)/i.test(u);
}

// Body for a single media container. Standalone videos publish as REELS;
// carousel children use media_type VIDEO and set is_carousel_item.
export function igItemPayload(url: string, isCarouselItem: boolean): Record<string, unknown> {
  if (isVideo(url)) {
    return isCarouselItem
      ? { media_type: 'VIDEO', video_url: url, is_carousel_item: true }
      : { media_type: 'REELS', video_url: url };
  }
  return isCarouselItem ? { image_url: url, is_carousel_item: true } : { image_url: url };
}

// How a media set publishes to IG: nothing, one container, or a carousel.
export function igPublishKind(media: string[]): 'none' | 'single' | 'carousel' {
  if (media.length === 0) return 'none';
  return media.length === 1 ? 'single' : 'carousel';
}

export { isVideo as igIsVideoUrl };
