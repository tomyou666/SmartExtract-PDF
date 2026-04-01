import { Settings, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
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
import { useLlmSettingsApi } from '@/contexts/AppApiContext';
import { clearOcrCacheDatabase } from '@/lib/ocrCache';
import { useApiKeyStore } from '@/stores/apiKeyStore';

interface ProviderOption {
	value: string;
	label: string;
}

interface SettingsSheetProps {
	open: boolean;
	onClose: () => void;
}

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
	const llmSettings = useLlmSettingsApi();
	const setApiKeyConfigured = useApiKeyStore((s) => s.setApiKeyConfigured);
	const [providers, setProviders] = useState<ProviderOption[]>([]);
	const [models, setModels] = useState<string[]>([]);
	const [provider, setProvider] = useState('');
	const [model, setModel] = useState('');
	const [apiKey, setApiKey] = useState('');
	const [saved, setSaved] = useState(false);
	const [clearingCache, setClearingCache] = useState(false);
	const [cacheCleared, setCacheCleared] = useState(false);

	const fetchModelsForProvider = useCallback(
		(p: string) => {
			if (!p) {
				setModels([]);
				return;
			}
			llmSettings
				.listModels(p)
				.then((names) => setModels(names))
				.catch((e) => {
					console.error('[SettingsSheet] listModels', e);
					toast.error(
						e instanceof Error ? e.message : 'モデル一覧の取得に失敗しました',
					);
					setModels([]);
				});
		},
		[llmSettings],
	);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		(async () => {
			try {
				const data = await llmSettings.listProviders();
				if (cancelled) return;
				setProviders(Array.isArray(data) ? data : []);
			} catch (e) {
				console.error('[SettingsSheet] listProviders', e);
				if (!cancelled) {
					toast.error(
						e instanceof Error
							? e.message
							: 'プロバイダー一覧の取得に失敗しました',
					);
					setProviders([]);
				}
			}
			try {
				const settings = await llmSettings.getSettings();
				if (cancelled) return;
				if (!settings) return;
				const p = settings.provider ?? 'openai';
				const m = settings.model ?? '';
				setProvider(p);
				setModel(m);
				setApiKey(settings.api_key_masked ? '********' : '');
				fetchModelsForProvider(p);
			} catch (e) {
				console.error('[SettingsSheet] getSettings', e);
				if (!cancelled) {
					toast.error(
						e instanceof Error ? e.message : 'LLM設定の取得に失敗しました',
					);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [open, fetchModelsForProvider, llmSettings]);

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
		try {
			await llmSettings.saveSettings(body);
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
			if (body.api_key !== undefined) {
				setApiKeyConfigured(true);
			}
			onClose();
		} catch (err) {
			console.error('[SettingsSheet] saveSettings', err);
			toast.error(
				err instanceof Error ? err.message : 'LLM設定の保存に失敗しました',
			);
		}
	};

	const handleClearOcrCache = async () => {
		setClearingCache(true);
		try {
			await clearOcrCacheDatabase();
			setCacheCleared(true);
			setTimeout(() => setCacheCleared(false), 2000);
		} catch (err) {
			console.error('[SettingsSheet] clearOcrCacheDatabase', err);
			toast.error(
				err instanceof Error
					? err.message
					: 'OCRキャッシュの削除に失敗しました',
			);
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
							ブラウザに保存されている OCR
							結果とレイアウトのキャッシュをすべて削除します。
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
										ブラウザに保存されている
										OCR／レイアウトキャッシュをすべて削除します。
										<br />
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
