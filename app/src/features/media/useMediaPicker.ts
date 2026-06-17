// Shared media-picking + upload logic for Compose and Review. Owns the selected
// media list and validates against the active target platforms. Uploads stream
// to the public draft-media bucket via expo-file-system so large videos never
// load into JS memory.
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

  // Pick existing photos/videos from the device gallery.
  async function pickMedia() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: maxMediaCount(getPlatforms()),
      quality: 0.8,
      videoMaxDuration: 20 * 60,
    });
    if (!result.canceled) addMedia(toMediaAssets(result.assets));
  }

  // Capture a new photo or video with the camera.
  async function captureMedia() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setMediaError('Camera permission is needed to take a photo or video.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
      videoMaxDuration: 20 * 60,
    });
    if (!result.canceled) addMedia(toMediaAssets(result.assets));
  }

  function removeMedia(uri: string) {
    setMedia((prev) => prev.filter((m) => m.uri !== uri));
  }

  // Upload the selected media to the draft-media bucket; returns public URLs.
  async function uploadMedia(userId: string, draftId: string): Promise<string[]> {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const supaUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const urls: string[] = [];
    for (let i = 0; i < media.length; i++) {
      const a = media[i];
      if (!a) continue;
      const ext = mediaExt(a) || (a.kind === 'video' ? 'mp4' : 'jpg');
      const contentType = a.mimeType ?? (a.kind === 'video' ? 'video/mp4' : 'image/jpeg');
      const path = `${userId}/${draftId}/${i}.${ext}`;
      const res = await FileSystem.uploadAsync(
        `${supaUrl}/storage/v1/object/draft-media/${path}`,
        a.uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            Authorization: `Bearer ${token ?? anon}`,
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
