import { Settings, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { clearOcrCacheDatabase } from '@/lib/ocrCache';
import { API_BASE } from '@/lib/utils';

interface ProviderOption {
	value: string;
	label: string;
}

interface SettingsSheetProps {
	open: boolean;
	onClose: () => void;
}

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
	const [providers, setProviders] = useState<ProviderOption[]>([]);
	const [models, setModels] = useState<string[]>([]);
	const [provider, setProvider] = useState('');
	const [model, setModel] = useState('');
	const [apiKey, setApiKey] = useState('');
	const [saved, setSaved] = useState(false);
	const [clearingCache, setClearingCache] = useState(false);
	const [cacheCleared, setCacheCleared] = useState(false);

	const fetchModelsForProvider = useCallback((p: string) => {
		if (!p) {
			setModels([]);
			return;
		}
		fetch(
			`${API_BASE}/api/settings/llm/models?provider=${encodeURIComponent(p)}`,
		)
			.then((r) => r.json())
			.then((data: { models: string[] }) => setModels(data.models ?? []))
			.catch(() => setModels([]));
	}, []);

	useEffect(() => {
		if (!open) return;
		// LLM 設定の読み込み
		fetch(`${API_BASE}/api/settings/llm/providers`)
			.then((r) => r.json())
			.then((data: ProviderOption[]) =>
				setProviders(Array.isArray(data) ? data : []),
			)
			.catch(() => setProviders([]));
		fetch(`${API_BASE}/api/settings/llm`)
			.then((r) => r.json())
			.then(
				(data: {
					provider: string;
					model: string;
					api_key_masked?: boolean;
				}) => {
					const p = data.provider ?? 'openai';
					const m = data.model ?? '';
					setProvider(p);
					setModel(m);
					setApiKey(data.api_key_masked ? '********' : '');
					fetchModelsForProvider(p);
				},
			)
			.catch(() => {});
	}, [open, fetchModelsForProvider]);

	// モデル一覧が変わったときのフォールバック
	useEffect(() => {
		if (models.length > 0 && model && !models.includes(model)) {
			setModel(models[0]);
		}
	}, [models, model]);

	const handleProviderChange = (p: string) => {
		setProvider(p);
		setModel('');
		fetchModelsForProvider(p);
	};

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		const body: { provider: string; model: string; api_key?: string } = {
			provider,
			model,
		};
		if (apiKey && apiKey !== '********') body.api_key = apiKey;
		const res = await fetch(`${API_BASE}/api/settings/llm`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		if (res.ok) {
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
		}
	};

	const handleClearOcrCache = async () => {
		setClearingCache(true);
		try {
			await clearOcrCacheDatabase();
			setCacheCleared(true);
			setTimeout(() => setCacheCleared(false), 2000);
		} finally {
			setClearingCache(false);
		}
	};

	const modelSelectDisabled = !provider || models.length === 0;

	if (!open) return null;

	return (
		<div
			className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'
			role='dialog'
			aria-modal='true'
		>
			<div className='bg-background border-border flex max-h-[90vh] w-full max-w-md flex-col rounded-lg border p-4 shadow-lg'>
				<h3 className='mb-4 flex items-center gap-2 text-lg font-semibold'>
					<Settings className='h-5 w-5' />
					設定
				</h3>
				<form onSubmit={handleSave} className='flex flex-col gap-4'>
					<section className='flex flex-col gap-3'>
						<h4 className='text-sm font-semibold text-muted-foreground'>
							LLM 設定
						</h4>
						<label className='text-sm font-medium'>
							プロバイダー
							<select
								className='border-border bg-background mt-1 w-full rounded border px-2 py-1'
								value={provider}
								onChange={(e) => handleProviderChange(e.target.value)}
							>
								<option value=''>選択してください</option>
								{providers.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{opt.label}
									</option>
								))}
							</select>
						</label>
						<label className='text-sm font-medium'>
							モデル
							<select
								className='border-border bg-background mt-1 w-full rounded border px-2 py-1 disabled:opacity-50'
								value={model}
								onChange={(e) => setModel(e.target.value)}
								disabled={modelSelectDisabled}
							>
								<option value=''>
									{modelSelectDisabled
										? 'プロバイダーを選択してください'
										: '選択してください'}
								</option>
								{models.map((m) => (
									<option key={m} value={m}>
										{m}
									</option>
								))}
							</select>
						</label>
						<label className='text-sm font-medium'>
							API キー
							<input
								type='password'
								className='border-border bg-background mt-1 w-full rounded border px-2 py-1'
								value={apiKey}
								onChange={(e) => setApiKey(e.target.value)}
								placeholder='設定済みの場合は変更時のみ入力'
							/>
						</label>
					</section>

					<section className='mt-2 border-t pt-3'>
						<h4 className='mb-1 text-sm font-semibold text-muted-foreground'>
							OCR キャッシュ
						</h4>
						<p className='mb-2 text-xs text-muted-foreground'>
							ブラウザに保存されている OCR 結果とレイアウトのキャッシュ
							（IndexedDB: ndlocr-pdf-cache）をすべて削除します。
						</p>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									type='button'
									variant='destructive'
									disabled={clearingCache}
								>
									<Trash2 className='mr-2 h-4 w-4' />
									{clearingCache
										? '削除中...'
										: cacheCleared
											? '削除しました'
											: 'OCR キャッシュをクリア'}
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										OCR キャッシュを削除しますか？
									</AlertDialogTitle>
									<AlertDialogDescription>
										ブラウザに保存されている OCR／レイアウトキャッシュ
										（ndlocr-pdf-cache）をすべて削除します。
										この操作は取り消せません。本当に実行してよろしいですか？
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>キャンセル</AlertDialogCancel>
									<AlertDialogAction
										variant='destructive'
										onClick={handleClearOcrCache}
									>
										削除する
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</section>

					<div className='flex justify-end gap-2'>
						<Button type='button' variant='outline' onClick={onClose}>
							キャンセル
						</Button>
						<Button type='submit'>{saved ? '保存しました' : '保存'}</Button>
					</div>
				</form>
			</div>
		</div>
	);
}
