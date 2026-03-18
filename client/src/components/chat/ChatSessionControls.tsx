import { Pencil, PlusCircle, Trash2 } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
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
import type { Session } from './chatTypes';

interface ChatSessionControlsProps {
	loadingSessions: boolean;
	sessions: Session[];
	currentSessionId: string | null;
	currentSessionTitle: string;
	onCreateSession: () => void | Promise<void>;
	onSelectSession: (id: string | null) => void;
	onUpdateTitle: (newTitle: string) => void | Promise<void>;
	onDeleteSession: (sessionId: string) => void | Promise<void>;
}

export const ChatSessionControls = memo(function ChatSessionControls({
	loadingSessions,
	sessions,
	currentSessionId,
	currentSessionTitle,
	onCreateSession,
	onSelectSession,
	onUpdateTitle,
	onDeleteSession,
}: ChatSessionControlsProps) {
	const [editingTitle, setEditingTitle] = useState(false);
	const [editTitleValue, setEditTitleValue] = useState('');
	const editTitleInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!editingTitle) return;
		setEditTitleValue(currentSessionTitle);
		editTitleInputRef.current?.focus();
	}, [editingTitle, currentSessionTitle]);

	const saveTitle = async () => {
		if (!currentSessionId || editTitleValue.trim() === '') {
			setEditingTitle(false);
			return;
		}
		const newTitle = editTitleValue.trim();
		try {
			await onUpdateTitle(newTitle);
			setEditingTitle(false);
		} catch {
			setEditingTitle(false);
		}
	};

	return (
		<>
			<div className='flex items-center justify-between gap-2 border-b border-border px-2 py-1'>
				<span className='text-muted-foreground text-xs'>セッション</span>
				<Button
					variant='ghost'
					size='sm'
					onClick={onCreateSession}
					title='新しいセッションを作成'
				>
					<PlusCircle className='h-4 w-4' />
					新規
				</Button>
			</div>
			{loadingSessions ? (
				<p className='text-muted-foreground p-2 text-sm'>読み込み中...</p>
			) : (
				<div className='space-y-1 px-2'>
					<div className='flex items-center gap-1'>
						{editingTitle && currentSessionId ? (
							<input
								ref={editTitleInputRef}
								type='text'
								value={editTitleValue}
								onChange={(e) => setEditTitleValue(e.target.value)}
								onBlur={saveTitle}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										saveTitle();
									}
									if (e.key === 'Escape') {
										setEditingTitle(false);
										setEditTitleValue(currentSessionTitle);
									}
								}}
								className='border-border bg-background text-foreground flex-1 rounded border px-2 py-1 text-sm'
								placeholder='タイトル'
							/>
						) : (
							<>
								<select
									className='border-border bg-background text-foreground min-w-0 flex-1 rounded border px-2 py-1 text-sm'
									value={currentSessionId ?? ''}
									onChange={(e) => {
										const id = e.target.value || null;
										setEditingTitle(false);
										onSelectSession(id);
									}}
								>
									<option value=''>選択してください</option>
									{sessions.map((s) => (
										<option key={s.id} value={s.id}>
											{s.title}
										</option>
									))}
								</select>
								{currentSessionId && (
									<>
										<Button
											variant='ghost'
											size='icon'
											className='h-7 w-7 shrink-0'
											aria-label='タイトルを編集'
											title='タイトルを編集'
											onClick={() => setEditingTitle(true)}
										>
											<Pencil className='h-3.5 w-3.5' />
										</Button>
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													variant='ghost'
													size='icon'
													className='h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive'
													aria-label='セッションを削除'
													title='このセッションを削除'
												>
													<Trash2 className='h-3.5 w-3.5' />
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent size='sm'>
												<AlertDialogHeader>
													<AlertDialogTitle>
														このセッションを削除しますか？
													</AlertDialogTitle>
													<AlertDialogDescription>
														このセッション内のすべての会話が削除されます。この操作は取り消せません。
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>キャンセル</AlertDialogCancel>
													<AlertDialogAction
														variant='destructive'
														onClick={() => onDeleteSession(currentSessionId)}
													>
														削除する
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									</>
								)}
							</>
						)}
					</div>
				</div>
			)}
		</>
	);
});
