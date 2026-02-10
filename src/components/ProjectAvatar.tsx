'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';

interface ProjectAvatarProps {
    project: Project;
    className?: string;
    size?: number;
}

export function ProjectAvatar({ project, className, size = 32 }: ProjectAvatarProps) {
    const [imageError, setImageError] = useState(false);

    // Reset error state when project changes
    useEffect(() => {
        setImageError(false);
    }, [project.id, project.productionUrl]);

    const getFaviconUrl = (url: string) => {
        try {
            const domain = new URL(url).hostname;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size * 2}`;
        } catch {
            return null;
        }
    };

    const faviconUrl = project.productionUrl ? getFaviconUrl(project.productionUrl) : null;

    // Deterministic fallback avatar
    // Using avatar.vercel.sh which generates consistent avatars based on text
    const fallbackUrl = `https://avatar.vercel.sh/${encodeURIComponent(project.name)}.svg?text=${encodeURIComponent(project.name.slice(0, 2).toUpperCase())}`;

    return (
        <div
            className={cn("relative overflow-hidden rounded-full border border-[var(--border)] bg-[var(--card)] shrink-0 flex items-center justify-center", className)}
            style={{ width: size, height: size }}
        >
            {!imageError && faviconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={faviconUrl}
                    alt={`${project.name} icon`}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                />
            ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={fallbackUrl}
                    alt={`${project.name} avatar`}
                    className="w-full h-full object-cover"
                />
            )}
        </div>
    );
}
