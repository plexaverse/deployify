'use client';

import { useState, useEffect } from 'react';
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
import type { TeamMembership, TeamInvite, TeamRole } from '@/types';

// Mock Audit Log Data
const MOCK_AUDIT_LOGS = [
    { id: 1, action: 'Member Invited', details: 'Alice invited Bob to the team', user: 'Alice', time: '2 hours ago' },
    { id: 2, action: 'Role Updated', details: 'Charlie promoted to Admin', user: 'Alice', time: '1 day ago' },
    { id: 3, action: 'Project Created', details: 'New project "Frontend V2" created', user: 'Bob', time: '2 days ago' },
    { id: 4, action: 'Deployment', details: 'Production deployment for "API Service"', user: 'Charlie', time: '3 days ago' },
];

export default function TeamSettingsPage() {
    const { activeTeam, isLoading: teamLoading, role } = useTeam();
    const [members, setMembers] = useState<(TeamMembership & { user: any })[]>([]);
    const [invites, setInvites] = useState<TeamInvite[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<TeamRole>('member');
    const [isInviting, setIsInviting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canManageMembers = role === 'owner' || role === 'admin';

    useEffect(() => {
        if (!activeTeam) return;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [membersRes, invitesRes] = await Promise.all([
                    fetch(`/api/teams/${activeTeam.id}/members`),
                    fetch(`/api/teams/${activeTeam.id}/invites`)
                ]);

                if (membersRes.ok) {
                    const data = await membersRes.json();
                    setMembers(data.members);
                }

                if (invitesRes.ok) {
                    const data = await invitesRes.json();
                    setInvites(data.invites);
                }
            } catch (err) {
                console.error('Failed to fetch team data', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [activeTeam]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeTeam || !inviteEmail) return;

        setIsInviting(true);
        setError(null);

        try {
            const res = await fetch(`/api/teams/${activeTeam.id}/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to send invite');
            }

            // Refresh invites
            const invitesRes = await fetch(`/api/teams/${activeTeam.id}/invites`);
            if (invitesRes.ok) {
                const invitesData = await invitesRes.json();
                setInvites(invitesData.invites);
            }

            setInviteEmail('');
            alert('Invite sent successfully!');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send invite');
        } finally {
            setIsInviting(false);
        }
    };

    const handleRoleUpdate = async (userId: string, newRole: TeamRole) => {
        if (!activeTeam) return;

        try {
            const res = await fetch(`/api/teams/${activeTeam.id}/members/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update role');
            }

            setMembers(members.map(m => m.userId === userId ? { ...m, role: newRole } : m));
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to update role');
        }
    };

    const handleRemoveMember = async (userId: string) => {
        if (!activeTeam || !confirm('Are you sure you want to remove this member?')) return;

        try {
            const res = await fetch(`/api/teams/${activeTeam.id}/members/${userId}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to remove member');
            }

            setMembers(members.filter(m => m.userId !== userId));
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to remove member');
        }
    };

    const handleRevokeInvite = async (inviteId: string) => {
        if (!activeTeam || !confirm('Are you sure you want to revoke this invite?')) return;

        try {
            const res = await fetch(`/api/teams/${activeTeam.id}/invites/${inviteId}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to revoke invite');
            }

            setInvites(invites.filter(i => i.id !== inviteId));
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to revoke invite');
        }
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
                    {canManageMembers && (
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
                    )}

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
                                                    disabled={!canManageMembers || membership.role === 'owner'}
                                                    className="appearance-none bg-transparent text-sm px-3 py-1 pr-8 rounded-full border border-[var(--border)] hover:border-[var(--muted-foreground)] transition-colors capitalize cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <option value="owner">Owner</option>
                                                    <option value="admin">Admin</option>
                                                    <option value="member">Member</option>
                                                    <option value="viewer">Viewer</option>
                                                </select>
                                                <Shield className="w-3 h-3 text-[var(--muted-foreground)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                            </div>

                                            {canManageMembers && membership.role !== 'owner' && (
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
                                            {canManageMembers && (
                                                <button
                                                    onClick={() => handleRevokeInvite(invite.id)}
                                                    className="p-2 text-[var(--muted-foreground)] hover:text-[var(--error)] hover:bg-[var(--error-bg)] rounded-md transition-colors"
                                                    title="Revoke invite"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
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

                        <div className="space-y-6 relative before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-[1px] before:bg-[var(--border)]">
                            {MOCK_AUDIT_LOGS.map((log) => (
                                <div key={log.id} className="relative pl-8">
                                    <div className="absolute left-[11px] top-1.5 w-2 h-2 rounded-full bg-[var(--muted-foreground)] ring-4 ring-[var(--card)]" />
                                    <div className="flex flex-col gap-1">
                                        <span className="text-sm font-medium text-[var(--foreground)]">
                                            {log.action}
                                        </span>
                                        <span className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                                            {log.details}
                                        </span>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)]/20 text-[var(--muted-foreground)] font-medium">
                                                {log.user}
                                            </span>
                                            <span className="text-[10px] text-[var(--muted-foreground)]">
                                                {log.time}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button className="w-full mt-8 btn btn-secondary text-xs">
                            View Full History
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
