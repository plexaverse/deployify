'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

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
            {error && (
                <div className="bg-[var(--error-bg)] text-[var(--error)] p-3 rounded-lg mb-4 text-sm w-full">
                    {error}
                </div>
            )}
            <Button
                onClick={handleJoin}
                loading={isLoading}
                className="w-full"
            >
                Join {teamName}
            </Button>
        </div>
    );
}
