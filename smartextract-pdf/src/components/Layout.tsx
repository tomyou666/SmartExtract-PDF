import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface LayoutProps {
	children: ReactNode;
	className?: string;
}

export function Layout({ children, className }: LayoutProps) {
	return (
		<div
			className={cn(
				'flex h-screen flex-col bg-background text-foreground',
				className,
			)}
		>
			{children}
		</div>
	);
}
