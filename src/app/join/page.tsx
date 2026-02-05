import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getInviteByToken, getTeamById } from '@/lib/db';
import JoinButton from './JoinButton';

interface JoinPageProps {
    searchParams: Promise<{ token?: string }>;
}

export default async function JoinPage({ searchParams }: JoinPageProps) {
    const { token } = await searchParams;

    if (!token) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)]">
                <div className="card max-w-md w-full text-center">
                    <h1 className="text-xl font-bold text-[var(--error)] mb-2">Invalid Invite</h1>
                    <p className="text-[var(--muted-foreground)]">No invite token provided.</p>
                </div>
            </div>
        );
    }

    const session = await getSession();

    if (!session) {
        redirect(`/login?callbackUrl=${encodeURIComponent(`/join?token=${token}`)}`);
    }

    const invite = await getInviteByToken(token);

    if (!invite) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)]">
                <div className="card max-w-md w-full text-center">
                    <h1 className="text-xl font-bold text-[var(--error)] mb-2">Invalid Invite</h1>
                    <p className="text-[var(--muted-foreground)]">The invite link is invalid or has expired.</p>
                </div>
            </div>
        );
    }

    if (invite.expiresAt < new Date()) {
         return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)]">
                <div className="card max-w-md w-full text-center">
                    <h1 className="text-xl font-bold text-[var(--error)] mb-2">Invite Expired</h1>
                    <p className="text-[var(--muted-foreground)]">This invite link has expired.</p>
                </div>
            </div>
        );
    }

    const team = await getTeamById(invite.teamId);

    if (!team) {
         return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)]">
                <div className="card max-w-md w-full text-center">
                    <h1 className="text-xl font-bold text-[var(--error)] mb-2">Team Not Found</h1>
                    <p className="text-[var(--muted-foreground)]">The team associated with this invite no longer exists.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)]">
            <div className="card max-w-md w-full text-center">
                <div className="mb-6">
                    {team.avatarUrl ? (
                        <img
                            src={team.avatarUrl}
                            alt={team.name}
                            className="w-16 h-16 rounded-full mx-auto"
                        />
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-[var(--muted)]/20 mx-auto flex items-center justify-center text-2xl font-bold text-[var(--muted-foreground)]">
                            {team.name.charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>
                <h1 className="text-2xl font-bold mb-2">Join {team.name}</h1>
                <p className="text-[var(--muted-foreground)] mb-6">
                    You have been invited to join <strong>{team.name}</strong> on Deployify.
                </p>

                <JoinButton token={token} teamName={team.name} />
            </div>
        </div>
    );
}
