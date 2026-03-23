import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export function AuthPage() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [isRegisterMode, setIsRegisterMode] = useState(false);
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const setToken = useAuthStore((s) => s.setToken);
	const [, setLocation] = useLocation();

	const login = async () => {
		const form = new URLSearchParams();
		form.set('username', email);
		form.set('password', password);
		const res = await fetch(apiUrl('/api/auth/jwt/login'), {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: form.toString(),
		});
		if (!res.ok) {
			throw new Error('ログインに失敗しました');
		}
		const data = (await res.json()) as { access_token: string };
		setToken(data.access_token);
		setLocation('/');
	};

	const register = async () => {
		const res = await fetch(apiUrl('/api/auth/register'), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password }),
		});
		if (!res.ok && res.status !== 400) {
			throw new Error('ユーザー登録に失敗しました');
		}
	};

	const onSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setErrorMessage(null);
		setLoading(true);
		try {
			if (isRegisterMode) {
				await register();
			}
			await login();
		} catch (err) {
			setErrorMessage(
				err instanceof Error ? err.message : '認証に失敗しました',
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Layout className='items-center justify-center px-4'>
			<div className='bg-card text-card-foreground w-full max-w-md rounded-xl border p-6 shadow-sm'>
				<h1 className='mb-2 text-xl font-semibold'>開発用ログイン</h1>
				<p className='text-muted-foreground mb-6 text-sm'>
					この画面は開発環境でのみ有効です。
				</p>
				<form onSubmit={onSubmit} className='space-y-4'>
					<label className='block text-sm font-medium'>
						Email
						<input
							type='email'
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className='border-input bg-background mt-1 w-full rounded-md border px-3 py-2'
							required
						/>
					</label>
					<label className='block text-sm font-medium'>
						Password
						<input
							type='password'
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className='border-input bg-background mt-1 w-full rounded-md border px-3 py-2'
							minLength={6}
							required
						/>
					</label>
					{errorMessage && (
						<p className='text-destructive text-sm'>{errorMessage}</p>
					)}
					<Button type='submit' className='w-full' disabled={loading}>
						{loading
							? '処理中...'
							: isRegisterMode
								? '登録してログイン'
								: 'ログイン'}
					</Button>
				</form>
				{import.meta.env.DEV && (
					<Button
						type='button'
						variant='link'
						className='mt-3 px-0'
						onClick={() => setIsRegisterMode((v) => !v)}
					>
						{isRegisterMode
							? '既存アカウントでログインする'
							: '初回はユーザー登録してからログイン'}
					</Button>
				)}
			</div>
		</Layout>
	);
}
