// Shared media-picking + upload logic for Compose and Review.
//
// Two layers:
//  - Pure helpers (pickMediaAssets / captureMediaAssets / uploadAssets) are
//    stateless so callers that need several independent media sets (Review's
//    per-target mode) can manage their own state.
//  - useMediaPicker wraps them with single-list state for the common case
//    (Compose, Review's shared mode).
//
// Uploads go through the supabase-js storage client so they carry the user's
// auth (required by the draft-media RLS policy) exactly like our other calls.
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { validateMedia, mediaExt, maxMediaCount, type MediaAsset } from '@omnisync/shared';

// Decode base64 (from expo-file-system) into bytes for the storage upload,
// without relying on a global atob (not guaranteed in React Native).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(b64: string): Uint8Array {
  const lookup = new Uint8Array(256);
  for (let i = 0; i < B64.length; i++) lookup[B64.charCodeAt(i)] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  let len = clean.length;
  let pad = 0;
  if (b64.endsWith('==')) pad = 2;
  else if (b64.endsWith('=')) pad = 1;
  const byteLen = Math.floor((len * 3) / 4) - pad;
  const bytes = new Uint8Array(byteLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = lookup[clean.charCodeAt(i)];
    const e2 = lookup[clean.charCodeAt(i + 1)];
    const e3 = lookup[clean.charCodeAt(i + 2)];
    const e4 = lookup[clean.charCodeAt(i + 3)];
    if (p < byteLen) bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < byteLen) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < byteLen) bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return bytes;
}
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
  // Make sure we have a live session (storage RLS needs auth.uid()); refresh if
  // the access token has aged out so the upload isn't treated as anon.
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session?.access_token) await supabase.auth.refreshSession();

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
    const base64 = await FileSystem.readAsStringAsync(a.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const { error } = await supabase.storage
      .from('draft-media')
      .upload(path, base64ToBytes(base64), { contentType, upsert: true });
    if (error) throw new Error(`Media upload failed. ${error.message}`);
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
