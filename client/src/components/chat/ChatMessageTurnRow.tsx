import { memo, type RefObject } from 'react';
import {
	type BlockProps,
	Streamdown,
	Block as StreamdownBlock,
} from 'streamdown';
import 'streamdown/styles.css';
import 'katex/dist/katex.min.css';
import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import { Copy, Trash2 } from 'lucide-react';
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
import {
	ChatAccordion,
	ChatAccordionContent,
	ChatAccordionItem,
	ChatAccordionTrigger,
} from '@/components/ui/chatAccordion';
import type { ChatMessage, MessageTurn } from './chatTypes';

const mathPlugin = createMathPlugin({ singleDollarTextMath: true });
const streamdownPlugins = { math: mathPlugin, cjk, code, mermaid };

interface ChatMessageTurnRowProps {
	turn: MessageTurn;
	allMessages: ChatMessage[];
	status: string;
	copyMessage: (text: string) => void;
	deleteConversationTurn: (id: string) => void;
	onScrollToTurnTop: () => void;
	copyBlockContentRef: RefObject<Map<string, string>>;
}

export const ChatMessageTurnRow = memo(function ChatMessageTurnRow({
	turn,
	allMessages,
	status,
	copyMessage,
	deleteConversationTurn,
	onScrollToTurnTop,
	copyBlockContentRef,
}: ChatMessageTurnRowProps) {
	return (
		<>
			{turn.messages.map((msg) => {
				const isLastAssistant =
					msg.role === 'assistant' &&
					msg.id === allMessages[allMessages.length - 1]?.id;
				const streaming = isLastAssistant && status === 'streaming';

				const textFromParts =
					msg.parts
						?.filter((p) => p.type === 'text')
						.map((p) => p.text ?? '')
						.join('') ??
					msg.content ??
					'';

				const assistantText = textFromParts;
				const userText = textFromParts;
				const isFirstInTurn = msg.id === turn.messages[0].id;

				const content = (
					<>
						<div className='flex items-center justify-between gap-1'>
							<span className='text-muted-foreground text-xs font-medium'>
								{msg.role === 'assistant' ? 'アシスタント' : null}
							</span>
							<div className='flex items-center gap-0'>
								{msg.role === 'assistant' && isFirstInTurn && (
									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button
												variant='ghost'
												size='icon'
												className='h-6 w-6 text-muted-foreground hover:text-destructive'
												aria-label='この会話を削除'
												title='この会話を削除'
											>
												<Trash2 className='h-3 w-3' />
											</Button>
										</AlertDialogTrigger>
										<AlertDialogContent size='sm'>
											<AlertDialogHeader>
												<AlertDialogTitle>
													この会話を削除しますか？
												</AlertDialogTitle>
												<AlertDialogDescription>
													この1件の会話（ユーザーとアシスタントのペア）が削除されます。この操作は取り消せません。
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel>キャンセル</AlertDialogCancel>
												<AlertDialogAction
													variant='destructive'
													onClick={() => deleteConversationTurn(turn.id)}
												>
													削除する
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								)}
								{msg.role === 'assistant' && (
									<Button
										variant='ghost'
										size='icon'
										className='h-6 w-6'
										title='この回答をコピー'
										onClick={() => {
											const text =
												msg.parts
													?.map((p) => (p.type === 'text' ? p.text : ''))
													.filter(Boolean)
													.join('') ??
												msg.content ??
												'';
											if (text) copyMessage(text);
										}}
									>
										<Copy className='h-3 w-3' />
									</Button>
								)}
							</div>
						</div>
						{msg.role === 'assistant' ? (
							(() => {
								// Wrap Streamdown blocks with stable DOM markers so we can expand selection on copy.
								const blockComponent = (blockProps: BlockProps) => {
									const blockKey = `${msg.id}:${blockProps.index}`;
									copyBlockContentRef.current.set(blockKey, blockProps.content);
									return (
										<div
											data-sd-copy-block='1'
											data-sd-copy-msg-id={msg.id}
											data-sd-copy-key={blockKey}
											style={{ display: 'contents' }}
										>
											<StreamdownBlock {...blockProps} />
										</div>
									);
								};

								return (
									<Streamdown
										plugins={streamdownPlugins}
										mode='streaming'
										caret='circle'
										isAnimating={streaming}
										parseIncompleteMarkdown={streaming}
										BlockComponent={blockComponent}
									>
										{assistantText}
									</Streamdown>
								);
							})()
						) : msg.role === 'user' ? (
							<p className='whitespace-pre-wrap text-sm'>{userText}</p>
						) : null}
					</>
				);

				if (msg.role === 'user') {
					return (
						<div
							key={msg.id}
							className='sticky -top-2 -mt-2 z-20 bg-background/95 pt-1'
						>
							<ChatAccordion
								type='single'
								collapsible
								className='mb-3 ml-4 rounded-lg bg-primary/10 p-2 shadow-sm'
							>
								<ChatAccordionItem value={turn.id}>
									<ChatAccordionTrigger
										header={
											<span className='text-muted-foreground text-xs font-medium block mb-1'>
												あなた
											</span>
										}
										summary={
											<button
												type='button'
												className='line-clamp-2 text-left text-sm whitespace-pre-wrap overflow-hidden mt-0.5'
												onClick={onScrollToTurnTop}
											>
												{userText}
											</button>
										}
										className='px-0 py-0 border-0 hover:no-underline w-full'
										aside={
											<div className='flex items-center gap-0 pl-1'>
												{isFirstInTurn && (
													<AlertDialog>
														<AlertDialogTrigger asChild>
															<Button
																variant='ghost'
																size='icon'
																className='h-6 w-6 text-muted-foreground hover:text-destructive'
																aria-label='この会話を削除'
																title='この会話を削除'
															>
																<Trash2 className='h-3 w-3' />
															</Button>
														</AlertDialogTrigger>
														<AlertDialogContent size='sm'>
															<AlertDialogHeader>
																<AlertDialogTitle>
																	この会話を削除しますか？
																</AlertDialogTitle>
																<AlertDialogDescription>
																	この1件の会話（ユーザーとアシスタントのペア）が削除されます。この操作は取り消せません。
																</AlertDialogDescription>
															</AlertDialogHeader>
															<AlertDialogFooter>
																<AlertDialogCancel>
																	キャンセル
																</AlertDialogCancel>
																<AlertDialogAction
																	variant='destructive'
																	onClick={() =>
																		deleteConversationTurn(turn.id)
																	}
																>
																	削除する
																</AlertDialogAction>
															</AlertDialogFooter>
														</AlertDialogContent>
													</AlertDialog>
												)}
												<Button
													variant='ghost'
													size='icon'
													className='h-6 w-6'
													title='このメッセージをコピー'
													onClick={(e) => {
														e.preventDefault();
														e.stopPropagation();
														if (userText) copyMessage(userText);
													}}
												>
													<Copy className='h-3 w-3' />
												</Button>
											</div>
										}
									/>
									<ChatAccordionContent
										onClick={onScrollToTurnTop}
										className='pt-0'
									>
										<div className='relative z-10 pointer-events-none [&_button]:pointer-events-auto'>
											{content}
										</div>
									</ChatAccordionContent>
								</ChatAccordionItem>
							</ChatAccordion>
						</div>
					);
				}

				return (
					<div
						key={msg.id}
						className='mb-3 mr-4 rounded-lg bg-muted/50 p-2 relative'
					>
						{content}
					</div>
				);
			})}
		</>
	);
});
