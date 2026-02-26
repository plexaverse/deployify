'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { Loader2, UserPlus, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface JoinButtonProps {
    token: string;
    teamName: string;
}

export default function JoinButton({ token, teamName }: JoinButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleJoin = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/invites/accept', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to join team');
            }

            // Redirect to dashboard on success
            router.push('/dashboard');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center w-full">
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-[var(--error-bg)] text-[var(--error)] p-4 rounded-xl mb-6 text-sm w-full flex items-center gap-3 border border-[var(--error)]/20 shadow-sm"
                    >
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <p>{error}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            <MovingBorderButton
                onClick={handleJoin}
                disabled={isLoading}
                containerClassName="w-full h-14"
                className="font-bold text-base flex items-center justify-center gap-2"
            >
                {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                    <UserPlus className="w-5 h-5" />
                )}
                {isLoading ? 'Joining...' : `Join ${teamName}`}
            </MovingBorderButton>
        </div>
    );
}
