import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getInviteByToken, getTeamById } from '@/lib/db';
import JoinButton from './JoinButton';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { UserPlus } from 'lucide-react';

interface JoinPageProps {
    searchParams: Promise<{ token?: string }>;
}

export default async function JoinPage({ searchParams }: JoinPageProps) {
    const { token } = await searchParams;

    if (!token) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)] relative overflow-hidden">
                <BackgroundBeams className="opacity-20" />
                <Card className="max-w-md w-full text-center relative z-10 p-8">
                    <div className="w-16 h-16 bg-[var(--error-bg)] text-[var(--error)] rounded-full flex items-center justify-center mx-auto mb-4">
                        <X className="w-8 h-8" />
                    </div>
                    <h1 className="text-xl font-bold text-[var(--error)] mb-2">Invalid Invite</h1>
                    <p className="text-[var(--muted-foreground)]">No invite token provided. Please check your link.</p>
                </Card>
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
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)] relative overflow-hidden">
                <BackgroundBeams className="opacity-20" />
                <Card className="max-w-md w-full text-center relative z-10 p-8">
                    <div className="w-16 h-16 bg-[var(--error-bg)] text-[var(--error)] rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-8 h-8" />
                    </div>
                    <h1 className="text-xl font-bold text-[var(--error)] mb-2">Invalid Invite</h1>
                    <p className="text-[var(--muted-foreground)]">The invite link is invalid or has expired.</p>
                </Card>
            </div>
        );
    }

    if (invite.expiresAt < new Date()) {
         return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)] relative overflow-hidden">
                <BackgroundBeams className="opacity-20" />
                <Card className="max-w-md w-full text-center relative z-10 p-8">
                    <div className="w-16 h-16 bg-[var(--error-bg)] text-[var(--error)] rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock className="w-8 h-8" />
                    </div>
                    <h1 className="text-xl font-bold text-[var(--error)] mb-2">Invite Expired</h1>
                    <p className="text-[var(--muted-foreground)]">This invite link has expired. Please request a new one.</p>
                </Card>
            </div>
        );
    }

    const team = await getTeamById(invite.teamId);

    if (!team) {
         return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)] relative overflow-hidden">
                <BackgroundBeams className="opacity-20" />
                <Card className="max-w-md w-full text-center relative z-10 p-8">
                    <div className="w-16 h-16 bg-[var(--error-bg)] text-[var(--error)] rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="w-8 h-8" />
                    </div>
                    <h1 className="text-xl font-bold text-[var(--error)] mb-2">Team Not Found</h1>
                    <p className="text-[var(--muted-foreground)]">The team associated with this invite no longer exists.</p>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)] relative overflow-hidden">
            <BackgroundBeams className="opacity-40" />

            <Card className="max-w-md w-full text-center relative z-10 p-8 shadow-2xl border-[var(--primary)]/10">
                <div className="mb-6 flex justify-center relative">
                    <div className="absolute -inset-4 bg-[var(--primary)]/10 blur-xl rounded-full animate-pulse-glow" />
                    <Avatar className="w-20 h-20 text-3xl font-bold border-4 border-[var(--background)] relative z-10 shadow-lg">
                        <AvatarImage src={team.avatarUrl || undefined} alt={team.name} />
                        <AvatarFallback className="bg-[var(--primary)] text-[var(--primary-foreground)]">
                            {team.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 bg-[var(--background)] p-1.5 rounded-full border border-[var(--border)] shadow-md z-20">
                        <UserPlus className="w-4 h-4 text-[var(--primary)]" />
                    </div>
                </div>

                <h1 className="text-2xl font-bold mb-2 tracking-tight">Join {team.name}</h1>
                <p className="text-[var(--muted-foreground)] mb-8 leading-relaxed">
                    You have been invited to collaborate with <strong>{team.name}</strong> on Deployify. Accept the invitation to get started.
                </p>

                <JoinButton token={token} teamName={team.name} />
            </Card>
        </div>
    );
}

// Helper icons for error states
function X({ className }: { className?: string }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
}
function AlertTriangle({ className }: { className?: string }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
}
function Clock({ className }: { className?: string }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function Users({ className }: { className?: string }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
}
