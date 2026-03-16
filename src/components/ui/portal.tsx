'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
    children: React.ReactNode;
}

export function Portal({ children }: PortalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setMounted(true);
        }, 0);
        return () => {
            clearTimeout(timeoutId);
            setMounted(false);
        };
    }, []);

    if (!mounted) {
        return null;
    }

    return createPortal(children, document.body);
}
