// Shared media-picking + upload logic for Compose and Review.
//
// Two layers:
//  - Pure helpers (pickMediaAssets / captureMediaAssets / uploadAssets) are
//    stateless so callers that need several independent media sets (Review's
//    per-target mode) can manage their own state.
//  - useMediaPicker wraps them with single-list state for the common case
//    (Compose, Review's shared mode).
//
// Uploads stream to the public draft-media bucket via expo-file-system so large
// videos never load into JS memory.
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { validateMedia, mediaExt, maxMediaCount, type MediaAsset } from '@omnisync/shared';
import { supabase } from '../../lib/supabase';

function toMediaAssets(assets: ImagePicker.ImagePickerAsset[]): MediaAsset[] {
  return assets.map((a) => ({
    uri: a.uri,
    kind: a.type === 'video' ? 'video' : 'image',
    mimeType: a.mimeType,
    fileName: a.fileName ?? undefined,
    sizeBytes: a.fileSize,
    durationMs: a.duration ?? undefined,
  }));
}

// Pick existing photos/videos from the gallery. Returns null on cancel.
export async function pickMediaAssets(platforms: string[]): Promise<MediaAsset[] | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    allowsMultipleSelection: true,
    selectionLimit: maxMediaCount(platforms),
    quality: 0.8,
    videoMaxDuration: 20 * 60,
  });
  return result.canceled ? null : toMediaAssets(result.assets);
}

// Capture a new photo/video. `error` is set when permission is denied; both
// fields empty means the user cancelled.
export async function captureMediaAssets(): Promise<{ assets?: MediaAsset[]; error?: string }> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { error: 'Camera permission is needed to take a photo or video.' };
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    quality: 0.8,
    videoMaxDuration: 20 * 60,
  });
  return result.canceled ? {} : { assets: toMediaAssets(result.assets) };
}

// Upload a set of media to the draft-media bucket under `pathPrefix`; returns
// the public URLs in order.
export async function uploadAssets(
  assets: MediaAsset[],
  pathPrefix: string,
): Promise<string[]> {
  // Storage RLS requires the user's JWT (auth.uid()); a stale/expired session
  // would fall back to anon and be rejected. Refresh if needed, and fail clearly
  // rather than silently uploading as anon.
  let { data: sess } = await supabase.auth.getSession();
  if (!sess.session?.access_token) {
    sess = (await supabase.auth.refreshSession()).data;
  }
  const token = sess.session?.access_token;
  if (!token) throw new Error('Your session expired — please sign in again.');
  const supaUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const urls: string[] = [];
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    if (!a) continue;
    // Already uploaded (e.g. media loaded from an existing draft) — keep as-is.
    if (a.remoteUrl) {
      urls.push(a.remoteUrl);
      continue;
    }
    const ext = mediaExt(a) || (a.kind === 'video' ? 'mp4' : 'jpg');
    const contentType = a.mimeType ?? (a.kind === 'video' ? 'video/mp4' : 'image/jpeg');
    const path = `${pathPrefix}/${i}.${ext}`;
    const res = await FileSystem.uploadAsync(
      `${supaUrl}/storage/v1/object/draft-media/${path}`,
      a.uri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: anon,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
      },
    );
    if (res.status !== 200) {
      throw new Error(`Media upload failed (${res.status}). ${res.body?.slice(0, 120) ?? ''}`);
    }
    urls.push(supabase.storage.from('draft-media').getPublicUrl(path).data.publicUrl);
  }
  return urls;
}

// `getPlatforms` is read lazily so validation always reflects the currently
// selected targets (which can change after media is first picked).
export function useMediaPicker(getPlatforms: () => string[]) {
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);

  function addMedia(assets: MediaAsset[]) {
    const next = [...media, ...assets];
    const err = validateMedia(next, getPlatforms());
    if (err) {
      setMediaError(err);
      return;
    }
    setMediaError(null);
    setMedia(next);
  }

  async function pickMedia() {
    const assets = await pickMediaAssets(getPlatforms());
    if (assets) addMedia(assets);
  }

  async function captureMedia() {
    const { assets, error } = await captureMediaAssets();
    if (error) setMediaError(error);
    else if (assets) addMedia(assets);
  }

  function removeMedia(uri: string) {
    setMedia((prev) => prev.filter((m) => m.uri !== uri));
  }

  async function uploadMedia(userId: string, draftId: string): Promise<string[]> {
    return uploadAssets(media, `${userId}/${draftId}`);
  }

  return {
    media,
    setMedia,
    mediaError,
    setMediaError,
    pickMedia,
    captureMedia,
    removeMedia,
    uploadMedia,
  };
}
