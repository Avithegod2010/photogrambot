import { create } from "zustand";
import {
  getGalleryPage,
  getFavorites,
  getAlbums,
  getAlbumPhotos,
  getTrashItems,
  searchPhotos,
  setFavorite,
  addToTrash,
  restoreFromTrash,
  markTrashRemoteDeleted,
  purgeExpiredTrash,
  createAlbum,
  deleteAlbum,
  addToAlbum,
  removeFromAlbum,
  deletePhoto,
  getStats,
  type PhotoRow,
  type AlbumWithCover,
} from "../lib/db";
import { getBotToken, getChannelId } from "../lib/settings";
import { deleteMessage, setMessageReaction } from "../lib/telegram";

export interface TrashItem extends PhotoRow {
  trashed_at: number;
  remote_deleted: number;
}

interface LibraryState {
  photos: PhotoRow[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  favorites: PhotoRow[];
  albums: AlbumWithCover[];
  trash: TrashItem[];
  stats: Awaited<ReturnType<typeof getStats>>;
  selection: Set<string>;
  selectionMode: boolean;
  loadInitial: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshMeta: () => Promise<void>;
  toggleFavorite: (photo: PhotoRow) => Promise<void>;
  trashPhotos: (ids: string[], alsoDeleteRemote: boolean) => Promise<void>;
  restorePhotos: (ids: string[]) => Promise<void>;
  deleteForever: (ids: string[]) => Promise<void>;
  emptyTrash: () => Promise<void>;
  purgeOldTrash: () => Promise<void>;
  toggleSelect: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  setSelectionMode: (on: boolean) => void;
  newAlbum: (name: string) => Promise<number>;
  removeAlbum: (id: number) => Promise<void>;
  addPhotosToAlbum: (albumId: number, ids: string[]) => Promise<void>;
  removePhotosFromAlbum: (albumId: number, ids: string[]) => Promise<void>;
  loadAlbumPhotos: (albumId: number) => Promise<PhotoRow[]>;
  search: (query: string) => Promise<PhotoRow[]>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  photos: [],
  loading: false,
  loadingMore: false,
  hasMore: true,
  favorites: [],
  albums: [],
  trash: [],
  stats: {
    total: 0,
    uploaded: 0,
    pending: 0,
    failed: 0,
    skipped: 0,
    favorites: 0,
    trashed: 0,
    totalBytes: 0,
  },
  selection: new Set<string>(),
  selectionMode: false,

  loadInitial: async () => {
    set({ loading: true });
    const page = await getGalleryPage(120, null, false);
    set({ photos: page.photos, hasMore: page.hasMore, loading: false });
    await get().refreshMeta();
  },

  loadMore: async () => {
    const { photos, loadingMore, hasMore } = get();
    if (loadingMore || !hasMore || photos.length === 0) return;
    set({ loadingMore: true });
    const last = photos[photos.length - 1];
    const page = await getGalleryPage(120, { taken_at: last.taken_at, id: last.id }, false);
    const seen = new Set(photos.map((p) => p.id));
    const merged = [...photos, ...page.photos.filter((p) => !seen.has(p.id))];
    set({ photos: merged, hasMore: page.hasMore, loadingMore: false });
  },

  refresh: async () => {
    const page = await getGalleryPage(120, null, false);
    set({ photos: page.photos, hasMore: page.hasMore });
    await get().refreshMeta();
  },

  refreshMeta: async () => {
    const [favorites, albums, trash, stats] = await Promise.all([
      getFavorites(),
      getAlbums(),
      getTrashItems(),
      getStats(),
    ]);
    set({ favorites, albums, trash, stats });
  },

  toggleFavorite: async (photo) => {
    const next = !photo.favorite;
    await setFavorite(photo.id, next);
    const channelId = await getChannelId();
    if (next && channelId && photo.message_id) {
      await setMessageReaction(channelId, photo.message_id, "❤️");
    } else if (!next && channelId && photo.message_id) {
      await setMessageReaction(channelId, photo.message_id, null);
    }
    await get().refresh();
  },

  trashPhotos: async (ids, alsoDeleteRemote) => {
    const channelId = await getChannelId();
    for (const id of ids) {
      if (alsoDeleteRemote) {
        const photo = get().photos.find((p) => p.id === id) ??
          (await (async () => {
            const { getPhoto } = await import("../lib/db");
            return getPhoto(id);
          })());
        if (photo?.message_id && channelId) {
          await deleteMessage(channelId, photo.message_id);
          const previewMsgId = (photo as any).preview_message_id;
          if (previewMsgId) {
            await deleteMessage(channelId, previewMsgId);
          }
        }
        await markTrashRemoteDeleted(id);
      }
      await addToTrash(id);
    }
    get().clearSelection();
    await get().refresh();
  },

  restorePhotos: async (ids) => {
    for (const id of ids) await restoreFromTrash(id);
    get().clearSelection();
    await get().refresh();
  },

  deleteForever: async (ids) => {
    const channelId = await getChannelId();
    const { getPhoto } = await import("../lib/db");
    for (const id of ids) {
      const photo = await getPhoto(id);
      if (photo?.message_id && channelId) {
        await deleteMessage(channelId, photo.message_id);
      }
      await deletePhoto(id);
    }
    get().clearSelection();
    await get().refresh();
  },

  emptyTrash: async () => {
    const items = get().trash;
    await get().deleteForever(items.map((t) => t.id));
  },

  purgeOldTrash: async () => {
    const prefs = (await import("../lib/settings")).loadPrefs;
    const p = await prefs();
    await purgeExpiredTrash(p.trashAutoPurgeDays);
    await get().refreshMeta();
  },

  toggleSelect: (id) => {
    const selection = new Set(get().selection);
    if (selection.has(id)) selection.delete(id);
    else selection.add(id);
    set({ selection, selectionMode: selection.size > 0 });
  },

  selectAll: (ids) => {
    set({ selection: new Set(ids), selectionMode: ids.length > 0 });
  },

  clearSelection: () => set({ selection: new Set(), selectionMode: false }),

  setSelectionMode: (on) => {
    if (!on) set({ selection: new Set() });
    set({ selectionMode: on });
  },

  newAlbum: async (name) => {
    const id = await createAlbum(name);
    await get().refreshMeta();
    return id;
  },

  removeAlbum: async (id) => {
    await deleteAlbum(id);
    await get().refreshMeta();
  },

  addPhotosToAlbum: async (albumId, ids) => {
    await addToAlbum(albumId, ids);
    get().clearSelection();
    await get().refreshMeta();
  },

  removePhotosFromAlbum: async (albumId, ids) => {
    await removeFromAlbum(albumId, ids);
    get().clearSelection();
    await get().refreshMeta();
  },

  loadAlbumPhotos: async (albumId) => {
    return getAlbumPhotos(albumId);
  },

  search: async (query) => {
    return searchPhotos(query);
  },
}));
