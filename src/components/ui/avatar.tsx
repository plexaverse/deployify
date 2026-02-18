'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type AvatarContextValue = {
    imageLoadingStatus: 'loading' | 'loaded' | 'error';
    onImageLoadingStatusChange: (status: 'loading' | 'loaded' | 'error') => void;
};

const AvatarContext = React.createContext<AvatarContextValue | undefined>(undefined);

const Avatar = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
    const [imageLoadingStatus, setImageLoadingStatus] = React.useState<'loading' | 'loaded' | 'error'>('loading');

    return (
        <AvatarContext.Provider value={{ imageLoadingStatus, onImageLoadingStatusChange: setImageLoadingStatus }}>
            <div
                ref={ref}
                className={cn(
                    "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
                    className
                )}
                {...props}
            />
        </AvatarContext.Provider>
    );
});
Avatar.displayName = "Avatar";

const AvatarImage = React.forwardRef<
    HTMLImageElement,
    React.ImgHTMLAttributes<HTMLImageElement>
>(({ className, src, alt, ...props }, ref) => {
    const context = React.useContext(AvatarContext);

    if (!context) {
        throw new Error("AvatarImage must be used within an Avatar");
    }

    const { imageLoadingStatus, onImageLoadingStatusChange } = context;

    React.useEffect(() => {
        if (!src) {
            onImageLoadingStatusChange('error');
            return;
        }

        const img = new Image();
        img.src = src as string;

        const handleLoad = () => onImageLoadingStatusChange('loaded');
        const handleError = () => onImageLoadingStatusChange('error');

        img.addEventListener('load', handleLoad);
        img.addEventListener('error', handleError);

        // If cached
        if (img.complete) {
             if (img.naturalWidth === 0) {
                 handleError();
             } else {
                 handleLoad();
             }
        }

        return () => {
            img.removeEventListener('load', handleLoad);
            img.removeEventListener('error', handleError);
        };
    }, [src, onImageLoadingStatusChange]);

    if (imageLoadingStatus === 'error') {
        return null;
    }

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            ref={ref}
            src={src}
            alt={alt}
            className={cn("aspect-square h-full w-full object-cover", className)}
            {...props}
        />
    );
});
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
    const context = React.useContext(AvatarContext);

    if (!context) {
        throw new Error("AvatarFallback must be used within an Avatar");
    }

    const { imageLoadingStatus } = context;

    if (imageLoadingStatus === 'loaded') {
        return null;
    }

    return (
        <div
            ref={ref}
            className={cn(
                "flex h-full w-full items-center justify-center rounded-full bg-[var(--muted)]/20 text-[var(--muted-foreground)]",
                className
            )}
            {...props}
        />
    );
});
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarImage, AvatarFallback };
