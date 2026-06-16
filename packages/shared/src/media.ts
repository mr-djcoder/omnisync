// Platform-aware media rules — the single source of truth for what the
// composer accepts. Values follow each platform's documented limits, capped to
// app-practical sizes (mobile upload + storage). Only Facebook is wired today;
// add entries as other platforms come online.

export type MediaKind = 'image' | 'video';

export type MediaAsset = {
  uri: string;
  kind: MediaKind;
  mimeType?: string;
  fileName?: string;
  sizeBytes?: number;
  durationMs?: number;
};

type KindRule = { exts: string[]; maxBytes: number; maxCount: number };
type PlatformRule = {
  image: KindRule;
  video: KindRule & { maxDurationSec: number };
  // Whether photos and a video may be combined in one post.
  allowMixingImageVideo: boolean;
};

const MB = 1024 * 1024;

export const MEDIA_RULES: Record<string, PlatformRule> = {
  facebook: {
    // FB Pages accept these image types; 10MB is FB's per-photo limit.
    image: {
      exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'],
      maxBytes: 10 * MB,
      maxCount: 10,
    },
    // FB allows up to 10GB/240min; capped here to a practical mobile size.
    video: {
      exts: ['mp4', 'mov', 'm4v'],
      maxBytes: 100 * MB,
      maxCount: 1,
      maxDurationSec: 20 * 60,
    },
    allowMixingImageVideo: false,
  },
};

export function mediaExt(a: Pick<MediaAsset, 'fileName' | 'uri' | 'mimeType'>): string {
  const fromName = a.fileName?.split('.').pop();
  const fromUri = (a.uri?.split('?')[0] ?? '').split('.').pop();
  const fromMime = a.mimeType?.split('/').pop();
  return (fromName || fromUri || fromMime || '').toLowerCase();
}

// The set of providers whose rules we know about, from a list of target providers.
function knownRules(platforms: string[]): PlatformRule[] {
  return platforms.map((p) => MEDIA_RULES[p]).filter((r): r is PlatformRule => Boolean(r));
}

// Returns an error string if the asset set violates the tightest rule across
// the selected platforms, or null if acceptable.
export function validateMedia(assets: MediaAsset[], platforms: string[]): string | null {
  if (assets.length === 0) return null;
  const rules = knownRules(platforms);
  if (rules.length === 0) return null;

  const images = assets.filter((a) => a.kind === 'image');
  const videos = assets.filter((a) => a.kind === 'video');

  if (images.length > 0 && videos.length > 0 && rules.some((r) => !r.allowMixingImageVideo)) {
    return "You can't combine photos and a video in one post.";
  }

  const maxImages = Math.min(...rules.map((r) => r.image.maxCount));
  const maxVideos = Math.min(...rules.map((r) => r.video.maxCount));
  if (images.length > maxImages)
    return `Up to ${maxImages} photo${maxImages === 1 ? '' : 's'} per post.`;
  if (videos.length > maxVideos)
    return `Up to ${maxVideos} video${maxVideos === 1 ? '' : 's'} per post.`;

  for (const a of assets) {
    const kindRules = rules.map((r) => (a.kind === 'image' ? r.image : r.video));
    const ext = mediaExt(a);
    if (ext && !kindRules.every((kr) => kr.exts.includes(ext))) {
      return `${a.kind === 'image' ? 'Photo' : 'Video'} format .${ext} isn't supported.`;
    }
    const maxBytes = Math.min(...kindRules.map((kr) => kr.maxBytes));
    if (a.sizeBytes && a.sizeBytes > maxBytes) {
      return `${a.kind === 'image' ? 'Photo' : 'Video'} is too large (max ${Math.round(maxBytes / MB)}MB).`;
    }
    if (a.kind === 'video' && a.durationMs) {
      const maxDur = Math.min(...rules.map((r) => r.video.maxDurationSec));
      if (a.durationMs / 1000 > maxDur) {
        return `Video is too long (max ${Math.round(maxDur / 60)} min).`;
      }
    }
  }
  return null;
}

// Max items the composer should allow for the given platforms (tightest).
export function maxMediaCount(platforms: string[]): number {
  const rules = knownRules(platforms);
  if (rules.length === 0) return 10;
  // Either several photos or a single video — use the larger so picking starts open.
  return Math.max(...rules.map((r) => Math.max(r.image.maxCount, r.video.maxCount)));
}
