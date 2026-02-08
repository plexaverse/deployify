'use client';

import { useEffect, useState } from 'react';
import { useTeam } from '@/contexts/TeamContext';
import {
    User as UserIcon,
    Shield,
    Trash2,
    Mail,
    AlertCircle,
    History
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/moving-border';
import { useStore } from '@/store';
import type { TeamRole } from '@/types';

export default function TeamSettingsPage() {
    const { activeTeam, isLoading: teamLoading } = useTeam();
    const {
        teamMembers: members,
        teamInvites: invites,
        isLoadingSettings: isLoading,
        inviteEmail,
        setInviteEmail,
        inviteRole,
        setInviteRole,
        isInvitingMember: isInviting,
        settingsError: error,
        fetchTeamSettingsData,
        sendTeamInvite,
        updateMemberRole,
        removeTeamMember,
        revokeTeamInvite
    } = useStore();

    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);

    useEffect(() => {
        if (activeTeam) {
            fetchTeamSettingsData(activeTeam.id);
        }
    }, [activeTeam, fetchTeamSettingsData]);

    useEffect(() => {
        async function fetchAuditLogs() {
            if (!activeTeam) return;
            setIsLoadingLogs(true);
            try {
                const res = await fetch(`/api/teams/${activeTeam.id}/audit`);
                if (res.ok) {
                    const data = await res.json();
                    setAuditLogs(data.logs);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoadingLogs(false);
            }
        }

        if (activeTeam) {
            fetchAuditLogs();
        }
    }, [activeTeam]);

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

    const handleRemoveMember = async (userId: string) => {
        if (activeTeam) {
            await removeTeamMember(activeTeam.id, userId);
        }
    };

    const handleRevokeInvite = async (inviteId: string) => {
        if (activeTeam) {
            await revokeTeamInvite(activeTeam.id, inviteId);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    const formatDetails = (details: any) => {
        if (typeof details === 'string') return details;
        if (details && typeof details === 'object') {
            // Try to find a human readable message field or stringify
            return details.message || details.description || JSON.stringify(details);
        }
        return JSON.stringify(details);
    };

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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content: Members & Invites */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Invite Section */}
                    <div className="card p-6">
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
                                    <input
                                        type="email"
                                        required
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        placeholder="colleague@example.com"
                                        className="input"
                                    />
                                </div>
                                <div className="w-full sm:w-40">
                                    <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1 block">
                                        Role
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={inviteRole}
                                            onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                                            className="input appearance-none cursor-pointer"
                                        >
                                            <option value="admin">Admin</option>
                                            <option value="member">Member</option>
                                            <option value="viewer">Viewer</option>
                                        </select>
                                        <Shield className="w-4 h-4 text-[var(--muted-foreground)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>
                                <div className="flex items-end">
                                    <Button
                                        type="submit"
                                        disabled={isInviting || !inviteEmail}
                                        containerClassName="h-[42px] w-full sm:w-auto"
                                        className="bg-black text-white dark:bg-slate-900 font-medium text-sm"
                                    >
                                        {isInviting ? 'Sending...' : 'Send Invite'}
                                    </Button>
                                </div>
                            </div>
                            {error && (
                                <div className="flex items-center gap-2 text-sm text-[var(--error)] bg-[var(--error-bg)] p-3 rounded-md">
                                    <AlertCircle className="w-4 h-4" />
                                    {error}
                                </div>
                            )}
                        </form>
                    </div>

                    {/* Members List */}
                    <div className="card overflow-hidden p-0">
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
                                            {membership.user?.avatarUrl ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img
                                                    src={membership.user.avatarUrl}
                                                    alt={membership.user.name || 'User'}
                                                    className="w-10 h-10 rounded-full border border-[var(--border)]"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-[var(--muted)]/20 flex items-center justify-center text-[var(--muted-foreground)]">
                                                    <UserIcon className="w-5 h-5" />
                                                </div>
                                            )}
                                            <div>
                                                <div className="font-medium flex items-center gap-2">
                                                    {membership.user?.name || 'Unknown User'}
                                                    {membership.role === 'owner' && (
                                                        <span className="badge badge-warning text-[10px] px-1.5 py-0.5 h-5">Owner</span>
                                                    )}
                                                </div>
                                                <div className="text-sm text-[var(--muted-foreground)]">
                                                    {membership.user?.email}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="relative">
                                                <select
                                                    value={membership.role}
                                                    onChange={(e) => handleRoleUpdate(membership.userId, e.target.value as TeamRole)}
                                                    className="appearance-none bg-transparent text-sm px-3 py-1 pr-8 rounded-full border border-[var(--border)] hover:border-[var(--muted-foreground)] transition-colors capitalize cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                                >
                                                    <option value="owner">Owner</option>
                                                    <option value="admin">Admin</option>
                                                    <option value="member">Member</option>
                                                    <option value="viewer">Viewer</option>
                                                </select>
                                                <Shield className="w-3 h-3 text-[var(--muted-foreground)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                            </div>

                                            {membership.role !== 'owner' && (
                                                <button
                                                    onClick={() => handleRemoveMember(membership.userId)}
                                                    className="p-2 text-[var(--muted-foreground)] hover:text-[var(--error)] hover:bg-[var(--error-bg)] rounded-md transition-colors"
                                                    title="Remove member"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
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
                                                    <span className="badge badge-info text-[10px] px-1.5 py-0.5 h-5">Invited</span>
                                                </div>
                                                <div className="text-sm text-[var(--muted-foreground)]">
                                                    Expires in {Math.ceil((new Date(invite.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="text-sm px-3 py-1 rounded-full bg-[var(--muted)]/10 border border-[var(--border)] capitalize">
                                                {invite.role}
                                            </div>
                                            <button
                                                onClick={() => handleRevokeInvite(invite.id)}
                                                className="p-2 text-[var(--muted-foreground)] hover:text-[var(--error)] hover:bg-[var(--error-bg)] rounded-md transition-colors"
                                                title="Revoke invite"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
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
                    </div>
                </div>

                {/* Sidebar: Audit Log */}
                <div className="space-y-6">
                    <div className="card p-6 h-full">
                        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                            <History className="w-5 h-5 text-[var(--muted-foreground)]" />
                            Audit Log
                        </h3>

                        {isLoadingLogs ? (
                            <div className="space-y-4">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="flex gap-3">
                                        <Skeleton className="w-2 h-2 rounded-full mt-2" />
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-4 w-3/4" />
                                            <Skeleton className="h-3 w-1/2" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : auditLogs.length > 0 ? (
                            <div className="space-y-6 relative before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-[1px] before:bg-[var(--border)]">
                                {auditLogs.map((log) => (
                                    <div key={log.id} className="relative pl-8">
                                        <div className="absolute left-[11px] top-1.5 w-2 h-2 rounded-full bg-[var(--muted-foreground)] ring-4 ring-[var(--card)]" />
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm font-medium text-[var(--foreground)]">
                                                {log.action}
                                            </span>
                                            <span className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                                                {formatDetails(log.details)}
                                            </span>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)]/20 text-[var(--muted-foreground)] font-medium">
                                                    {log.userName}
                                                </span>
                                                <span className="text-[10px] text-[var(--muted-foreground)]">
                                                    {formatDate(log.createdAt)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-[var(--muted-foreground)] text-sm">
                                <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                No audit logs yet.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
