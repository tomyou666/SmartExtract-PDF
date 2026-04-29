import type { ReactNode } from 'react';
import { createContext, useCallback, useState } from 'react';

export interface PdfSidebarSlots {
	thumbnails: ReactNode;
	bookmarks: ReactNode;
}

type SetSlots = (slots: PdfSidebarSlots | null) => void;

const PdfSidebarContext = createContext<{
	slots: PdfSidebarSlots | null;
	setSlots: SetSlots;
}>({
	slots: null,
	setSlots: () => {},
});

export function PdfSidebarProvider({ children }: { children: ReactNode }) {
	const [slots, setSlotsState] = useState<PdfSidebarSlots | null>(null);
	const setSlots = useCallback<SetSlots>((s) => setSlotsState(s), []);
	return (
		<PdfSidebarContext.Provider value={{ slots, setSlots }}>
			{children}
		</PdfSidebarContext.Provider>
	);
}

export { PdfSidebarContext };
