import React, { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { getCachedTelegramFile } from "../lib/media";

export function TelegramImage({
  fileId,
  localUri,
  style,
  resizeMode = "cover",
  onLoad,
}: {
  fileId: string | null;
  localUri?: string | null;
  style: any;
  resizeMode?: "cover" | "contain";
  onLoad?: () => void;
}) {
  const [uri, setUri] = useState<string | null>(localUri ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (localUri) {
      setUri(localUri);
      return;
    }
    if (!fileId) {
      setUri(null);
      return;
    }
    setUri(null);
    getCachedTelegramFile(fileId)
      .then((p) => {
        if (alive) setUri(`file://${p}`);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [fileId, localUri]);

  if (!uri) {
    return (
      <View
        style={[style, { backgroundColor: "rgba(128,128,128,0.12)" }, failed && { opacity: 0.5 }]}
      />
    );
  }
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      onLoad={onLoad}
      fadeDuration={120}
    />
  );
}

export function resolvePhotoThumb(p: {
  preview_file_id: string | null;
  thumb_file_id: string | null;
  remote_file_id: string | null;
  local_uri: string | null;
  status: string;
}): { fileId: string | null; localUri: string | null } {
  if (p.preview_file_id) return { fileId: p.preview_file_id, localUri: null };
  if (p.thumb_file_id) return { fileId: p.thumb_file_id, localUri: null };
  if (p.status === "uploaded" && p.remote_file_id) {
    return { fileId: p.remote_file_id, localUri: null };
  }
  return { fileId: null, localUri: p.local_uri };
}

export function resolvePhotoFull(p: {
  remote_file_id: string | null;
  preview_file_id: string | null;
  local_uri: string | null;
  status: string;
}): { fileId: string | null; localUri: string | null } {
  if (p.status === "uploaded" && p.remote_file_id) return { fileId: p.remote_file_id, localUri: null };
  if (p.preview_file_id) return { fileId: p.preview_file_id, localUri: null };
  return { fileId: null, localUri: p.local_uri };
}
