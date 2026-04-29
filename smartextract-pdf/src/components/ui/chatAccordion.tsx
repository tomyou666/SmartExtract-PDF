import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

type ChatAccordionTriggerProps = React.ComponentProps<
	typeof AccordionPrimitive.Trigger
> & {
	/** 1行目左側（例: 「あなた」ラベル） */
	header: React.ReactNode;
	/** 2行目のサマリ（例: userText） */
	summary?: React.ReactNode;
	/** 1行目右側（例: 削除ボタンなど） */
	aside?: React.ReactNode;
};

function ChatAccordion({
	className,
	...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
	return (
		<AccordionPrimitive.Root
			data-slot='accordion'
			className={cn('flex w-full flex-col', className)}
			{...props}
		/>
	);
}

function ChatAccordionItem({
	className,
	...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
	return (
		<AccordionPrimitive.Item
			data-slot='accordion-item'
			className={cn('not-last:border-b group/chat-accordion-item', className)}
			{...props}
		/>
	);
}

function ChatAccordionTrigger({
	className,
	header,
	summary,
	aside,
	...props
}: ChatAccordionTriggerProps) {
	return (
		<AccordionPrimitive.Header className='flex w-full flex-col gap-0'>
			<div className='flex items-start justify-between gap-1 w-full'>
				<AccordionPrimitive.Trigger
					data-slot='accordion-trigger'
					className={cn(
						'group/accordion-trigger relative flex flex-1 items-start rounded-lg border border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:border-ring disabled:pointer-events-none disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground',
						className,
					)}
					{...props}
				>
					<div className='text-left min-w-0 flex-1'>{header}</div>
					<ChevronDownIcon
						data-slot='accordion-trigger-icon'
						className='pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden'
					/>
					<ChevronUpIcon
						data-slot='accordion-trigger-icon'
						className='pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline'
					/>
				</AccordionPrimitive.Trigger>
				{aside}
			</div>
			{summary && (
				<div className='line-clamp-2 text-left text-sm whitespace-pre-wrap overflow-hidden transition-[max-height,opacity,margin-top] duration-200 ease-out max-h-16 opacity-100 mt-0.5 group-data-[state=open]/chat-accordion-item:max-h-0 group-data-[state=open]/chat-accordion-item:opacity-0 group-data-[state=open]/chat-accordion-item:mt-0'>
					{summary}
				</div>
			)}
		</AccordionPrimitive.Header>
	);
}

function ChatAccordionContent({
	className,
	children,
	...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
	return (
		<AccordionPrimitive.Content
			data-slot='accordion-content'
			className='overflow-hidden text-sm data-open:animate-accordion-down data-closed:animate-accordion-up'
			{...props}
		>
			<div
				className={cn(
					'h-(--radix-accordion-content-height) pt-0 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
					className,
				)}
			>
				{children}
			</div>
		</AccordionPrimitive.Content>
	);
}

export {
	ChatAccordion,
	ChatAccordionItem,
	ChatAccordionTrigger,
	ChatAccordionContent,
};
