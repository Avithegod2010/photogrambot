import { create } from "zustand";
import {
  onUploadProgress,
  requestCancelUpload,
  processQueue,
  isProcessing,
  type UploadProgress,
} from "../lib/uploader";

interface UploadState {
  progress: UploadProgress;
  start: () => Promise<void>;
  cancel: () => void;
  subscribe: () => () => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  progress: {
    running: false,
    current: 0,
    total: 0,
    currentFile: null,
    done: 0,
    failed: 0,
    skipped: 0,
    duplicates: 0,
    sentBytes: 0,
    totalBytes: 0,
    percent: null,
  },
  start: async () => {
    if (!isProcessing()) void processQueue();
  },
  cancel: () => requestCancelUpload(),
  subscribe: () =>
    onUploadProgress((p) => set({ progress: p })),
}));
