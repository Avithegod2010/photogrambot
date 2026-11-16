// Pure caption-field metadata (no react-native / storage imports) so both the
// caption builder and the Node test suite can use it.

// Caption field keys, in the natural order they appear in the channel post.
export const DEFAULT_CAPTION_FIELDS = [
  "version",
  "filename",
  "path",
  "size",
  "duration",
  "dateTaken",
  "dateAdded",
  "camera",
  "exposure",
  "lens",
  "gps",
  "ai",
  "tags",
  "hash",
];

export const CAPTION_FIELD_LABELS: { key: string; label: string }[] = [
  { key: "version", label: "Edited-version marker" },
  { key: "filename", label: "File name" },
  { key: "path", label: "Folder path" },
  { key: "size", label: "Size / resolution" },
  { key: "duration", label: "Video duration" },
  { key: "dateTaken", label: "Date taken" },
  { key: "dateAdded", label: "Date added" },
  { key: "camera", label: "Camera" },
  { key: "exposure", label: "Exposure" },
  { key: "lens", label: "Lens" },
  { key: "gps", label: "GPS coordinates" },
  { key: "ai", label: "AI description" },
  { key: "tags", label: "Tags" },
  { key: "hash", label: "Content hash" },
];
