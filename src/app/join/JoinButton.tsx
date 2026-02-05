'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
        <div className="flex flex-col items-center">
            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">
                    {error}
                </div>
            )}
            <button
                onClick={handleJoin}
                disabled={isLoading}
                className="bg-black text-white px-6 py-2 rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
                {isLoading ? 'Joining...' : `Join ${teamName}`}
            </button>
        </div>
    );
}
