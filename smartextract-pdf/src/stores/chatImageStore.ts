import { create } from 'zustand';

/** Data URLs of images to attach to the next chat message (from PDF or upload). */
interface ChatImageState {
	pendingImages: string[];
	addImage: (dataUrl: string) => void;
	removeImage: (index: number) => void;
	clearImages: () => void;
}

export const useChatImageStore = create<ChatImageState>((set) => ({
	pendingImages: [],
	addImage: (dataUrl) =>
		set((s) => ({ pendingImages: [...s.pendingImages, dataUrl] })),
	removeImage: (index) =>
		set((s) => ({
			pendingImages: s.pendingImages.filter((_, i) => i !== index),
		})),
	clearImages: () => set({ pendingImages: [] }),
}));
