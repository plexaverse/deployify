import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getInviteByToken, getTeamById } from '@/lib/db';
import JoinButton from './JoinButton';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { UserPlus, AlertTriangle, Clock, Users } from 'lucide-react';

interface JoinPageProps {
    searchParams: Promise<{ token?: string }>;
}

export default async function JoinPage({ searchParams }: JoinPageProps) {
    const { token } = await searchParams;

    if (!token) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)] relative overflow-hidden">
                <BackgroundBeams className="opacity-20" />
                <Card className="max-w-md w-full text-center relative z-10 p-10 shadow-2xl">
                    <div className="w-20 h-20 bg-[var(--error-bg)] text-[var(--error)] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[var(--error-bg)]">
                        <AlertTriangle className="w-10 h-10" />
                    </div>
                    <h1 className="text-2xl font-bold text-[var(--error)] mb-2">Invalid Invite</h1>
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
                <Card className="max-w-md w-full text-center relative z-10 p-10 shadow-2xl">
                    <div className="w-20 h-20 bg-[var(--error-bg)] text-[var(--error)] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[var(--error-bg)]">
                        <AlertTriangle className="w-10 h-10" />
                    </div>
                    <h1 className="text-2xl font-bold text-[var(--error)] mb-2">Invalid Invite</h1>
                    <p className="text-[var(--muted-foreground)]">The invite link is invalid or has expired.</p>
                </Card>
            </div>
        );
    }

    if (invite.expiresAt < new Date()) {
         return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)] relative overflow-hidden">
                <BackgroundBeams className="opacity-20" />
                <Card className="max-w-md w-full text-center relative z-10 p-10 shadow-2xl">
                    <div className="w-20 h-20 bg-[var(--error-bg)] text-[var(--error)] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[var(--error-bg)]">
                        <Clock className="w-10 h-10" />
                    </div>
                    <h1 className="text-2xl font-bold text-[var(--error)] mb-2">Invite Expired</h1>
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
                <Card className="max-w-md w-full text-center relative z-10 p-10 shadow-2xl">
                    <div className="w-20 h-20 bg-[var(--error-bg)] text-[var(--error)] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[var(--error-bg)]">
                        <Users className="w-10 h-10" />
                    </div>
                    <h1 className="text-2xl font-bold text-[var(--error)] mb-2">Team Not Found</h1>
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
