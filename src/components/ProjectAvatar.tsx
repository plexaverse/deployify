'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { FolderGit2 } from 'lucide-react';

interface ProjectAvatarProps {
    name: string;
    productionUrl?: string | null;
    className?: string;
}

export function ProjectAvatar({ name, productionUrl, className }: ProjectAvatarProps) {
    const [error, setError] = useState(false);
    const [faviconUrl, setFaviconUrl] = useState<string | null>(null);

    useEffect(() => {
        if (productionUrl) {
            try {
                // Ensure URL has protocol
                const urlStr = productionUrl.startsWith('http') ? productionUrl : `https://${productionUrl}`;
                const domain = new URL(urlStr).hostname;
                setFaviconUrl(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`);
                setError(false);
            } catch (e) {
                // Invalid URL
                setError(true);
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

    // Generate a consistent color based on the name hash
    const colors = [
        'bg-blue-500',
        'bg-green-500',
        'bg-yellow-500',
        'bg-purple-500',
        'bg-pink-500',
        'bg-indigo-500',
        'bg-red-500',
        'bg-orange-500',
        'bg-teal-500',
        'bg-cyan-500',
    ];

    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const bgColor = colors[hash % colors.length];

    if (faviconUrl && !error) {
        return (
            <div className={cn("relative w-10 h-10 rounded-full overflow-hidden border border-[var(--border)] bg-[var(--background)] flex-shrink-0", className)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={faviconUrl}
                    alt={`${name} favicon`}
                    className="w-full h-full object-contain p-1.5"
                    onError={() => setError(true)}
                />
            </div>
        );
    }

    return (
        <div
            className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-xs shadow-sm flex-shrink-0",
                bgColor,
                className
            )}
            title={name}
        >
            {initials || <FolderGit2 className="w-5 h-5" />}
        </div>
    );
}
