import { useAuthStore } from '@/stores/authStore';
import { API_BASE } from '@/lib/utils';

const mergeHeaders = (original?: HeadersInit): Headers => {
	const headers = new Headers(original);
	const token = useAuthStore.getState().token;
	if (token) {
		headers.set('Authorization', `Bearer ${token}`);
	}
	return headers;
};

export const getAuthHeaderValue = () => {
	const token = useAuthStore.getState().token;
	return token ? `Bearer ${token}` : undefined;
};

export async function authFetch(
	input: string | URL | Request,
	init?: RequestInit,
): Promise<Response> {
	const res = await fetch(input, {
		...init,
		headers: mergeHeaders(init?.headers),
	});

	if (res.status === 401) {
		const currentPath = window.location.pathname;
		if (!currentPath.startsWith('/auth')) {
			window.location.assign('/auth');
		}
	}

	return res;
}

export const apiUrl = (path: string) => `${API_BASE}${path}`;
