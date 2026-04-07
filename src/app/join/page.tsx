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
                <Card className="max-w-md w-full text-center relative z-10 overflow-hidden p-0 shadow-2xl border-[var(--error)]/30">
                    <div className="absolute top-0 left-0 w-full h-1 bg-[var(--error)]"></div>
                    <div className="p-8 flex flex-col items-center">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--error)]/10 flex items-center justify-center shrink-0 mb-6">
                            <AlertTriangle className="w-6 h-6 text-[var(--error)]" />
                        </div>
                        <div className="space-y-1 mb-4">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--error)]">Invalid Invite</span>
                            <h1 className="text-lg font-bold tracking-tight">Invite Error</h1>
                        </div>
                        <p className="text-[var(--muted-foreground)]">No invite token provided. Please check your link.</p>
                    </div>
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
                <Card className="max-w-md w-full text-center relative z-10 overflow-hidden p-0 shadow-2xl border-[var(--error)]/30">
                    <div className="absolute top-0 left-0 w-full h-1 bg-[var(--error)]"></div>
                    <div className="p-8 flex flex-col items-center">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--error)]/10 flex items-center justify-center shrink-0 mb-6">
                            <AlertTriangle className="w-6 h-6 text-[var(--error)]" />
                        </div>
                        <div className="space-y-1 mb-4">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--error)]">Invalid Invite</span>
                            <h1 className="text-lg font-bold tracking-tight">Invite Error</h1>
                        </div>
                        <p className="text-[var(--muted-foreground)]">The invite link is invalid or has expired.</p>
                    </div>
                </Card>
            </div>
        );
    }

    if (invite.expiresAt < new Date()) {
         return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)] relative overflow-hidden">
                <BackgroundBeams className="opacity-20" />
                <Card className="max-w-md w-full text-center relative z-10 overflow-hidden p-0 shadow-2xl border-[var(--error)]/30">
                    <div className="absolute top-0 left-0 w-full h-1 bg-[var(--error)]"></div>
                    <div className="p-8 flex flex-col items-center">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--error)]/10 flex items-center justify-center shrink-0 mb-6">
                            <Clock className="w-6 h-6 text-[var(--error)]" />
                        </div>
                        <div className="space-y-1 mb-4">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--error)]">Invite Expired</span>
                            <h1 className="text-lg font-bold tracking-tight">Invite Error</h1>
                        </div>
                        <p className="text-[var(--muted-foreground)]">This invite link has expired. Please request a new one.</p>
                    </div>
                </Card>
            </div>
        );
    }

    const team = await getTeamById(invite.teamId);

    if (!team) {
         return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)] relative overflow-hidden">
                <BackgroundBeams className="opacity-20" />
                <Card className="max-w-md w-full text-center relative z-10 overflow-hidden p-0 shadow-2xl border-[var(--error)]/30">
                    <div className="absolute top-0 left-0 w-full h-1 bg-[var(--error)]"></div>
                    <div className="p-8 flex flex-col items-center">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--error)]/10 flex items-center justify-center shrink-0 mb-6">
                            <Users className="w-6 h-6 text-[var(--error)]" />
                        </div>
                        <div className="space-y-1 mb-4">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--error)]">Team Not Found</span>
                            <h1 className="text-lg font-bold tracking-tight">Invite Error</h1>
                        </div>
                        <p className="text-[var(--muted-foreground)]">The team associated with this invite no longer exists.</p>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[var(--background)] relative overflow-hidden">
            <BackgroundBeams className="opacity-40" />

            <Card className="max-w-md w-full text-center relative z-10 overflow-hidden p-0 shadow-2xl border-[var(--primary)]/10">
                <div className="p-8 flex flex-col items-center">
                    <div className="mb-6 flex justify-center relative">
                        <div className="absolute -inset-4 bg-[var(--primary)]/10 blur-xl rounded-full animate-pulse-glow" />
                        <Avatar className="w-20 h-20 text-lg font-bold border-4 border-[var(--background)] relative z-10 shadow-lg rounded-2xl">
                            <AvatarImage src={team.avatarUrl || undefined} alt={team.name} />
                            <AvatarFallback className="bg-[var(--primary)] text-[var(--primary-foreground)] rounded-2xl">
                                {team.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="absolute -bottom-1 -right-1 bg-[var(--background)] p-1.5 rounded-full border border-[var(--border)] shadow-md z-20">
                            <UserPlus className="w-4 h-4 text-[var(--primary)]" />
                        </div>
                    </div>

                    <div className="space-y-1 mb-6">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Team Invitation</span>
                        <h1 className="text-lg font-bold tracking-tight">Join {team.name}</h1>
                    </div>

                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-8 leading-relaxed">
                            You have been invited to collaborate with <strong className="text-[var(--foreground)] uppercase">{team.name}</strong> on Deployify. Accept the invitation to get started.
                    </p>

                    <JoinButton token={token} teamName={team.name} />
                </div>
            </Card>
        </div>
    );
}
