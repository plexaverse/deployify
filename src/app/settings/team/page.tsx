'use client';

import { useState, useEffect } from 'react';
import { useTeam } from '@/contexts/TeamContext';
import {
    User as UserIcon,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Shield,
    Trash2,
    Mail,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Plus,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Clock,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    CheckCircle2,
    AlertCircle,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Search,
    History,
    X
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/native-select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useStore } from '@/store';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { TeamMembership, TeamInvite, TeamRole } from '@/types';

export default function TeamSettingsPage() {
    const { activeTeam, isLoading: teamLoading } = useTeam();
    const {
        teamMembers: members,
        teamInvites: invites,
        auditLogs: logs,
        isLoadingSettings: isLoading,
        inviteEmail,
        setInviteEmail,
        inviteRole,
        setInviteRole,
        isInvitingMember: isInviting,
        settingsError: error,
        fetchTeamSettingsData,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        fetchAuditLogs,
        sendTeamInvite,
        updateMemberRole,
        removeTeamMember,
        revokeTeamInvite
    } = useStore();

    useEffect(() => {
        if (activeTeam) {
            fetchTeamSettingsData(activeTeam.id);
            // fetchAuditLogs(activeTeam.id); // Included in fetchTeamSettingsData now
        }
    }, [activeTeam, fetchTeamSettingsData]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (activeTeam) {
            await sendTeamInvite(activeTeam.id);
        }
    };

    const handleRoleUpdate = async (userId: string, newRole: TeamRole) => {
        if (activeTeam) {
            await updateMemberRole(activeTeam.id, userId, newRole);
        }
    };

    const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
    const [inviteToRevoke, setInviteToRevoke] = useState<string | null>(null);

    const handleRevokeInvite = async () => {
        if (activeTeam && inviteToRevoke) {
            await revokeTeamInvite(activeTeam.id, inviteToRevoke);
            setInviteToRevoke(null);
        }
    };

    const handleConfirmRemoveMember = async () => {
        if (activeTeam && memberToRemove) {
            await removeTeamMember(activeTeam.id, memberToRemove);
            setMemberToRemove(null);
        }
    };

    const [now, setNow] = useState<number>(0);
    useEffect(() => {
        setTimeout(() => setNow(Date.now()), 0);
    }, []);

    if (teamLoading) {
        return (
            <div className="max-w-6xl mx-auto space-y-8 p-6">
                <div>
                    <Skeleton className="h-10 w-48 mb-2" />
                    <Skeleton className="h-4 w-96" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                        <Skeleton className="h-48 w-full rounded-xl" />
                        <Skeleton className="h-96 w-full rounded-xl" />
                    </div>
                    <Skeleton className="h-96 w-full rounded-xl" />
                </div>
            </div>
        );
    }

    if (!activeTeam) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="w-16 h-16 bg-[var(--muted)]/20 rounded-full flex items-center justify-center mb-4">
                    <UserIcon className="w-8 h-8 text-[var(--muted-foreground)]" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Personal Workspace</h2>
                <p className="text-[var(--muted-foreground)] max-w-md">
                    Team settings are not available in your personal workspace. Please switch to a team or create a new one.
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold mb-2">Team Settings</h1>
                <p className="text-[var(--muted-foreground)]">Manage your team members, roles, and permissions.</p>
            </div>

            {error && (
                <div className="flex items-center gap-2 text-sm text-[var(--error)] bg-[var(--error-bg)] p-4 rounded-lg border border-[var(--error)]/20 animate-fade-in">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <div className="flex-1">{error}</div>
                    <Button variant="ghost" size="sm" onClick={() => useStore.getState().setSettingsError(null)} className="h-auto p-1 hover:bg-[var(--error)]/10">
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content: Members & Invites */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Invite Section */}
                    <Card className="p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Mail className="w-5 h-5 text-[var(--primary)]" />
                            Invite New Member
                        </h3>
                        <form onSubmit={handleInvite} className="space-y-4">
                            <div className="flex flex-col sm:flex-row gap-4">
                                <div className="flex-1">
                                    <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1 block">
                                        Email Address
                                    </label>
                                    <Input
                                        type="email"
                                        required
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        placeholder="colleague@example.com"
                                    />
                                </div>
                                <div className="w-full sm:w-40">
                                    <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1 block">
                                        Role
                                    </label>
                                    <NativeSelect
                                        value={inviteRole}
                                        onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                                    >
                                        <option value="admin">Admin</option>
                                        <option value="member">Member</option>
                                        <option value="viewer">Viewer</option>
                                    </NativeSelect>
                                </div>
                                <div className="flex items-end">
                                    <MovingBorderButton
                                        type="submit"
                                        disabled={isInviting || !inviteEmail}
                                        containerClassName="h-[42px] w-full sm:w-auto"
                                        className="font-medium text-sm"
                                    >
                                        {isInviting ? 'Sending...' : 'Send Invite'}
                                    </MovingBorderButton>
                                </div>
                            </div>
                        </form>
                    </Card>

                    {/* Members List */}
                    <Card className="overflow-hidden p-0">
                        <div className="p-6 border-b border-[var(--border)] flex justify-between items-center">
                            <h3 className="text-lg font-semibold">Team Members</h3>
                            <div className="text-sm text-[var(--muted-foreground)]">
                                {members.length} {members.length === 1 ? 'member' : 'members'}
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="divide-y divide-[var(--border)]">
                                {[...Array(3)].map((_, i) => (
                                    <div key={i} className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <Skeleton className="w-10 h-10 rounded-full" />
                                            <div>
                                                <Skeleton className="h-4 w-32 mb-2" />
                                                <Skeleton className="h-3 w-48" />
                                            </div>
                                        </div>
                                        <div className="flex gap-4">
                                            <Skeleton className="h-8 w-24" />
                                            <Skeleton className="h-8 w-8" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--border)]">
                                {members.map((membership) => (
                                    <div key={membership.id} className="p-4 flex items-center justify-between hover:bg-[var(--card-hover)] transition-colors">
                                        <div className="flex items-center gap-4">
                                            <Avatar className="w-10 h-10">
                                                <AvatarImage src={membership.user?.avatarUrl || undefined} alt={membership.user?.name || 'User'} />
                                                <AvatarFallback>
                                                    <UserIcon className="w-5 h-5" />
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="font-medium flex items-center gap-2">
                                                    {membership.user?.name || 'Unknown User'}
                                                    {membership.role === 'owner' && (
                                                        <Badge variant="warning" className="h-5 px-1.5 py-0.5 text-[10px]">Owner</Badge>
                                                    )}
                                                </div>
                                                <div className="text-sm text-[var(--muted-foreground)]">
                                                    {membership.user?.email}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <NativeSelect
                                                value={membership.role}
                                                onChange={(e) => handleRoleUpdate(membership.userId, e.target.value as TeamRole)}
                                                className="h-8 text-xs py-0 min-w-[100px]"
                                            >
                                                <option value="owner">Owner</option>
                                                <option value="admin">Admin</option>
                                                <option value="member">Member</option>
                                                <option value="viewer">Viewer</option>
                                            </NativeSelect>

                                            {membership.role !== 'owner' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setMemberToRemove(membership.userId)}
                                                    className="p-2 h-auto text-[var(--muted-foreground)] hover:text-[var(--error)] hover:bg-[var(--error-bg)]"
                                                    title="Remove member"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {/* Pending Invites within the same list or separate? Let's append them */}
                                {invites.map((invite) => (
                                    <div key={invite.id} className="p-4 flex items-center justify-between bg-[var(--muted)]/5 hover:bg-[var(--card-hover)] transition-colors">
                                        <div className="flex items-center gap-4 opacity-75">
                                            <div className="w-10 h-10 rounded-full bg-[var(--muted)]/20 flex items-center justify-center text-[var(--muted-foreground)] border border-dashed border-[var(--muted-foreground)]">
                                                <Mail className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="font-medium flex items-center gap-2">
                                                    {invite.email}
                                                    <Badge variant="info" className="h-5 px-1.5 py-0.5 text-[10px]">Invited</Badge>
                                                </div>
                                                <div className="text-sm text-[var(--muted-foreground)]">
                                                    {now > 0 ? `Expires in ${Math.ceil((new Date(invite.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24))} days` : '...'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="text-sm px-3 py-1 rounded-full bg-[var(--muted)]/10 border border-[var(--border)] capitalize">
                                                {invite.role}
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setInviteToRevoke(invite.id)}
                                                className="p-2 h-auto text-[var(--muted-foreground)] hover:text-[var(--error)] hover:bg-[var(--error-bg)]"
                                                title="Revoke invite"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}

                                {members.length === 0 && invites.length === 0 && !isLoading && (
                                    <div className="p-8 text-center text-[var(--muted-foreground)]">
                                        No members found.
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Sidebar: Audit Log */}
                <div className="space-y-6">
                    <Card className="p-6 h-full max-h-[800px] flex flex-col">
                        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 shrink-0">
                            <History className="w-5 h-5 text-[var(--muted-foreground)]" />
                            Audit Log
                        </h3>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-6 relative before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-[1px] before:bg-[var(--border)]">
                            {logs.length === 0 && !isLoading ? (
                                <div className="text-center text-[var(--muted-foreground)] text-sm py-8 pl-8">
                                    No activity recorded yet.
                                </div>
                            ) : (
                                logs.map((log) => (
                                    <div key={log.id} className="relative pl-8">
                                        <div className="absolute left-[11px] top-1.5 w-2 h-2 rounded-full bg-[var(--muted-foreground)] ring-4 ring-[var(--card)]" />
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm font-medium text-[var(--foreground)]">
                                                {log.action}
                                            </span>
                                            <span className="text-xs text-[var(--muted-foreground)] leading-relaxed line-clamp-2">
                                                {JSON.stringify(log.details)}
                                            </span>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)]/20 text-[var(--muted-foreground)] font-medium">
                                                    {log.user?.email || 'Unknown User'}
                                                </span>
                                                <span className="text-[10px] text-[var(--muted-foreground)]">
                                                    {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>
                </div>
            </div>

            <ConfirmationModal
                isOpen={!!memberToRemove}
                onClose={() => setMemberToRemove(null)}
                onConfirm={handleConfirmRemoveMember}
                title="Remove Team Member"
                description="Are you sure you want to remove this member? They will lose all access to team projects."
                confirmText="Remove"
                variant="destructive"
            />

            <ConfirmationModal
                isOpen={!!inviteToRevoke}
                onClose={() => setInviteToRevoke(null)}
                onConfirm={handleRevokeInvite}
                title="Revoke Invitation"
                description="Are you sure you want to revoke this invitation?"
                confirmText="Revoke"
                variant="destructive"
            />
        </div>
    );
}
