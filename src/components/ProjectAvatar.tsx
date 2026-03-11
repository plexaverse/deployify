'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { FolderGit2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface ProjectAvatarProps {
    name: string;
    productionUrl?: string | null;
    className?: string;
}

export function ProjectAvatar({ name, productionUrl, className }: ProjectAvatarProps) {
    const [faviconUrl, setFaviconUrl] = useState<string | null>(null);

    useEffect(() => {
        if (productionUrl) {
            try {
                // Ensure URL has protocol
                const urlStr = productionUrl.startsWith('http') ? productionUrl : `https://${productionUrl}`;
                const domain = new URL(urlStr).hostname;
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setFaviconUrl(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`);
            } catch {
                // Invalid URL
                setFaviconUrl(null);
            }
        } else {
            setFaviconUrl(null);
        }
    }, [productionUrl]);

    // Generate initials (max 2 chars)
    const initials = name
        .replace(/[^a-zA-Z0-9\s-_]/g, '')
        .split(/[\s-_]+/)
        .map(part => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || name.substring(0, 2).toUpperCase();

    // Generate a consistent color based on the name hash using theme variables
    const colors = [
        'bg-[var(--info)] text-[var(--primary-foreground)]',
        'bg-[var(--success)] text-[var(--primary-foreground)]',
        'bg-[var(--warning)] text-[var(--primary-foreground)]',
        'bg-[var(--error)] text-[var(--primary-foreground)]',
        'bg-[var(--muted-foreground)] text-[var(--primary-foreground)]',
        'bg-[var(--primary)] text-[var(--primary-foreground)]',
    ];

    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colorClass = colors[hash % colors.length];

    return (
        <Avatar className={cn("w-10 h-10 border border-[var(--border)] bg-[var(--background)]", className)}>
            {faviconUrl && (
                <AvatarImage
                    src={faviconUrl}
                    alt={`${name} favicon`}
                    className="object-contain p-1.5"
                />
            )}
            <AvatarFallback
                className={cn("text-[10px] font-bold uppercase tracking-wider", colorClass)}
            >
                {initials || <FolderGit2 className="w-5 h-5" />}
            </AvatarFallback>
        </Avatar>
    );
}
