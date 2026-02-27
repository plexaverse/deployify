'use client';

import { useEffect, useState } from 'react';
import { useTeam } from '@/contexts/TeamContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Users,
    UserPlus,
    Mail,
    AlertTriangle,
    History,
    Trash2,
    Github,
    User as UserIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useStore } from '@/store';
import type { TeamRole, User } from '@/types';

export default function TeamSettingsPage() {
    const { activeTeam, isLoading: isTeamLoading, setActiveTeam, fetchTeams } = useTeam();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);

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
        sendTeamInvite,
        updateMemberRole,
        removeTeamMember,
        revokeTeamInvite
    } = useStore();

    useEffect(() => {
        if (activeTeam) {
            fetchTeamSettingsData(activeTeam.id);
        } else {
            fetch('/api/user')
                .then(res => res.json())
                .then(data => {
                    if (data.user) setUser(data.user);
                })
                .catch(err => console.error('Failed to fetch user:', err));
        }
    }, [activeTeam, fetchTeamSettingsData]);

    useEffect(() => {
        if (error) {
            toast.error(error);
            useStore.getState().setSettingsError(null);
        }
    }, [error]);

    const [confirmDeleteTeam, setConfirmDeleteTeam] = useState(false);
    const [confirmLeaveTeam, setConfirmLeaveTeam] = useState(false);
    const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
    const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
    const [inviteToCancel, setInviteToCancel] = useState<string | null>(null);

    const isOwner = activeTeam?.membership.role === 'owner';
    const isAdmin = activeTeam?.membership.role === 'admin';
    const canManage = isOwner || isAdmin;

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

    const handleConfirmRemoveMember = async () => {
        if (activeTeam && memberToRemove) {
            await removeTeamMember(activeTeam.id, memberToRemove);
            setMemberToRemove(null);
        }
    };

    const handleConfirmCancelInvite = async () => {
        if (activeTeam && inviteToCancel) {
            await revokeTeamInvite(activeTeam.id, inviteToCancel);
            setInviteToCancel(null);
        }
    };

    const handleLeaveTeam = async () => {
        if (!activeTeam) return;
        const res = await fetch(`/api/teams/${activeTeam.id}/members/${activeTeam.membership.userId}`, {
            method: 'DELETE',
        });
        if (res.ok) {
            toast.success('Left team successfully');
            setActiveTeam(null);
            await fetchTeams();
            router.push('/dashboard');
        } else {
            const data = await res.json();
            toast.error(data.error || 'Failed to leave team');
        }
        setConfirmLeaveTeam(false);
    };

    const handleDeleteTeam = async () => {
        if (!activeTeam) return;
        const res = await fetch(`/api/teams/${activeTeam.id}`, {
            method: 'DELETE',
        });
        if (res.ok) {
            toast.success('Team deleted successfully');
            setActiveTeam(null);
            await fetchTeams();
            router.push('/dashboard');
        } else {
            const data = await res.json();
            toast.error(data.error || 'Failed to delete team');
        }
        setConfirmDeleteTeam(false);
    };

    const handleDeleteAccount = async () => {
        const res = await fetch('/api/user', { method: 'DELETE' });
        if (res.ok) {
            toast.success('Account deleted successfully');
            window.location.href = '/';
        } else {
            const data = await res.json();
            toast.error(data.error || 'Failed to delete account');
        }
        setConfirmDeleteAccount(false);
    };

    if (isTeamLoading) {
        return (
            <div className="max-w-6xl mx-auto p-6 space-y-8">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-48" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                        <Card className="p-6">
                            <Skeleton className="h-32 w-full" />
                        </Card>
                        <Card className="p-6">
                            <Skeleton className="h-64 w-full" />
                        </Card>
                    </div>
                    <Card className="p-6">
                        <Skeleton className="h-96 w-full" />
                    </Card>
                </div>
            </div>
        );
    }

    if (!activeTeam) {
        return (
            <div className="max-w-4xl mx-auto p-6 space-y-10 pb-24">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
                    <p className="text-[var(--muted-foreground)] text-lg">Manage your personal account settings and workspace.</p>
                </div>

                <Card className="p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <UserIcon className="w-5 h-5 text-[var(--primary)]" />
                        <h2 className="text-lg font-semibold">Personal Profile</h2>
                    </div>
                    <Separator className="mb-6" />

                    {/* We can't use useSession here easily without adding it to the project,
                        but TeamContext or some global state might have it.
                        Actually, let's just show the placeholder or use the store if user info is there.
                        The session is available in some contexts.
                    */}
                    <div className="flex items-center gap-6">
                        <Avatar className="w-20 h-20 border-2 border-[var(--border)]">
                            <AvatarImage src={user?.avatarUrl} alt={user?.name || user?.githubUsername} />
                            <AvatarFallback>
                                <UserIcon className="w-10 h-10" />
                            </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                            <h3 className="text-xl font-bold text-[var(--foreground)]">
                                {user?.name || user?.githubUsername || 'Personal Workspace'}
                            </h3>
                            <p className="text-[var(--muted-foreground)]">
                                {user?.email || 'You are using your individual workspace for hobby projects.'}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                                <Button onClick={() => router.push('/billing')} variant="outline" size="sm">
                                    Manage Billing
                                </Button>
                                <Link href="/api/auth/github" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1">
                                    <Github className="w-3 h-3" />
                                    Account connected via GitHub
                                </Link>
                            </div>
                        </div>
                    </div>
                </Card>

                <Card className="border-[var(--error)]/30 bg-[var(--error)]/5 overflow-hidden p-0">
                    <div className="p-6">
                        <div className="flex items-center gap-2 text-[var(--error)] mb-1">
                            <AlertTriangle className="w-5 h-5" />
                            <h2 className="text-lg font-semibold">Danger Zone</h2>
                        </div>
                        <p className="text-sm text-[var(--muted-foreground)]">
                            Irreversible and destructive actions.
                        </p>
                    </div>
                    <Separator className="bg-[var(--error)]/20" />
                    <div className="p-6">
                        <div className="flex items-center justify-between p-4 border border-[var(--error)]/20 rounded-lg bg-[var(--background)]">
                            <div>
                                <h3 className="font-medium text-[var(--error)]">Delete Account</h3>
                                <p className="text-sm text-[var(--muted-foreground)]">
                                    Permanently remove your account and all of your data. This action cannot be undone.
                                </p>
                            </div>
                            <Button
                                variant="destructive"
                                onClick={() => setConfirmDeleteAccount(true)}
                            >
                                Delete Account
                            </Button>
                        </div>
                    </div>
                </Card>

                <ConfirmationModal
                    isOpen={confirmDeleteAccount}
                    onClose={() => setConfirmDeleteAccount(false)}
                    onConfirm={handleDeleteAccount}
                    title="Delete Account"
                    description="Are you sure you want to delete your account? All your projects, deployments, and data will be permanently removed. This action cannot be undone."
                    confirmText="Delete Account"
                    variant="destructive"
                />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-10 pb-24">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">{activeTeam.name} Settings</h1>
                    <p className="text-[var(--muted-foreground)] text-lg">Manage team members, roles, and permissions.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                        {activeTeam.membership.role}
                    </Badge>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {/* Invite Members */}
                    {canManage && (
                        <Card className="p-6">
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-1">
                                    <UserPlus className="w-5 h-5 text-[var(--primary)]" />
                                    <h2 className="text-lg font-semibold">Invite New Member</h2>
                                </div>
                                <p className="text-sm text-[var(--muted-foreground)]">
                                    Add new members to your team by email.
                                </p>
                            </div>
                            <Separator className="mb-6" />
                            <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-4">
                                <div className="flex-1">
                                    <Label htmlFor="email" className="sr-only">Email address</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="colleague@example.com"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="role" className="text-[10px] uppercase font-bold text-[var(--muted-foreground)] tracking-wider px-1">Role</Label>
                                    <SegmentedControl
                                        options={[
                                            { value: 'admin', label: 'Admin' },
                                            { value: 'member', label: 'Member' },
                                            { value: 'viewer', label: 'Viewer' },
                                        ]}
                                        value={inviteRole}
                                        onChange={(v) => setInviteRole(v as TeamRole)}
                                    />
                                </div>
                                <MovingBorderButton
                                    type="submit"
                                    disabled={isInviting || !inviteEmail}
                                    containerClassName="h-10 w-full sm:w-32"
                                    className="font-medium text-sm"
                                >
                                    {isInviting ? 'Sending...' : 'Send Invite'}
                                </MovingBorderButton>
                            </form>
                        </Card>
                    )}

                    {/* Members List */}
                    <Card className="overflow-hidden p-0">
                        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Users className="w-5 h-5 text-[var(--primary)]" />
                                <h2 className="text-lg font-semibold">Team Members</h2>
                            </div>
                            <div className="text-sm text-[var(--muted-foreground)]">
                                {members.length} {members.length === 1 ? 'member' : 'members'}
                            </div>
                        </div>
                        <div className="divide-y divide-[var(--border)]">
                            {isLoading ? (
                                <div className="p-12 space-y-4">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="flex items-center gap-4">
                                            <Skeleton className="w-10 h-10 rounded-full" />
                                            <div className="flex-1 space-y-2">
                                                <Skeleton className="h-4 w-32" />
                                                <Skeleton className="h-3 w-48" />
                                            </div>
                                            <Skeleton className="h-8 w-20" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <>
                                    {members.map((member) => (
                                        <div key={member.id} className="p-4 flex items-center justify-between hover:bg-[var(--card-hover)] transition-colors">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="w-10 h-10">
                                                    <AvatarImage
                                                        src={member.user?.avatarUrl || `https://github.com/${member.user?.githubUsername}.png`}
                                                        alt={member.user?.name || 'User'}
                                                    />
                                                    <AvatarFallback>
                                                        {(member.user?.name || member.user?.githubUsername || 'U').slice(0, 2).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="font-medium text-[var(--foreground)] flex items-center gap-2">
                                                        {member.user?.name || member.user?.githubUsername || 'Unknown User'}
                                                        {member.role === 'owner' && <Badge variant="warning" className="text-[9px] px-1 py-0 uppercase">Owner</Badge>}
                                                    </p>
                                                    <p className="text-sm text-[var(--muted-foreground)]">
                                                        {member.user?.email}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                {canManage && member.role !== 'owner' && member.userId !== activeTeam.membership.userId ? (
                                                    <SegmentedControl
                                                        options={[
                                                            { value: 'admin', label: 'Admin' },
                                                            { value: 'member', label: 'Member' },
                                                            { value: 'viewer', label: 'Viewer' },
                                                        ]}
                                                        value={member.role}
                                                        onChange={(v) => handleRoleUpdate(member.userId, v as TeamRole)}
                                                    />
                                                ) : (
                                                    <Badge variant={member.role === 'owner' ? 'success' : member.role === 'admin' ? 'info' : 'secondary'} className="capitalize">
                                                        {member.role}
                                                    </Badge>
                                                )}

                                                {canManage && member.userId !== activeTeam.membership.userId && member.role !== 'owner' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setMemberToRemove(member.userId)}
                                                        className="text-[var(--muted-foreground)] hover:text-[var(--error)] transition-colors"
                                                        title="Remove member"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    {/* Pending Invites */}
                                    {invites.map((invite) => (
                                        <div key={invite.id} className="p-4 flex items-center justify-between bg-[var(--muted)]/5 hover:bg-[var(--card-hover)] transition-colors">
                                            <div className="flex items-center gap-3 opacity-75">
                                                <div className="w-10 h-10 rounded-full bg-[var(--muted)]/20 flex items-center justify-center border border-dashed border-[var(--border)]">
                                                    <Mail className="w-4 h-4 text-[var(--muted-foreground)]" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-[var(--foreground)] flex items-center gap-2">
                                                        {invite.email}
                                                        <Badge variant="info" className="text-[10px] px-1.5 py-0 uppercase">Invited</Badge>
                                                    </p>
                                                    <p className="text-xs text-[var(--muted-foreground)]">
                                                        Sent {new Date(invite.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <Badge variant="secondary" className="capitalize">{invite.role}</Badge>
                                                {canManage && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setInviteToCancel(invite.id)}
                                                        className="text-[var(--muted-foreground)] hover:text-[var(--error)] transition-colors"
                                                        title="Cancel invite"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    {members.length === 0 && invites.length === 0 && (
                                        <div className="p-12 text-center text-[var(--muted-foreground)]">No members or invites found</div>
                                    )}
                                </>
                            )}
                        </div>
                    </Card>

                    {/* Danger Zone */}
                    <Card className="border-[var(--error)]/30 bg-[var(--error)]/5 overflow-hidden p-0">
                        <div className="p-6">
                            <div className="flex items-center gap-2 text-[var(--error)] mb-1">
                                <AlertTriangle className="w-5 h-5" />
                                <h2 className="text-lg font-semibold">Danger Zone</h2>
                            </div>
                            <p className="text-sm text-[var(--muted-foreground)]">
                                Irreversible and destructive actions.
                            </p>
                        </div>
                        <Separator className="bg-[var(--error)]/20" />
                        <div className="p-6 space-y-6">
                            <div className="flex items-center justify-between p-4 border border-[var(--error)]/20 rounded-lg bg-[var(--background)]">
                                <div>
                                    <h3 className="font-medium">Leave Team</h3>
                                    <p className="text-sm text-[var(--muted-foreground)]">
                                        Revoke your access to this team. You will need to be re-invited to join again.
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    onClick={() => setConfirmLeaveTeam(true)}
                                    className="text-[var(--error)] hover:bg-[var(--error)]/10 hover:text-[var(--error)]"
                                >
                                    Leave Team
                                </Button>
                            </div>

                            {isOwner && (
                                <>
                                    <Separator className="bg-[var(--error)]/20" />
                                    <div className="flex items-center justify-between p-4 border border-[var(--error)]/20 rounded-lg bg-[var(--background)]">
                                        <div>
                                            <h3 className="font-medium text-[var(--error)]">Delete Team</h3>
                                            <p className="text-sm text-[var(--muted-foreground)]">
                                                Permanently remove this team and all of its data. This action cannot be undone.
                                            </p>
                                        </div>
                                        <Button
                                            variant="destructive"
                                            onClick={() => setConfirmDeleteTeam(true)}
                                        >
                                            Delete Team
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
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
                                                {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                                            </span>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)]/20 text-[var(--muted-foreground)] font-medium">
                                                    {log.user?.email || 'Unknown User'}
                                                </span>
                                                <span className="text-[10px] text-[var(--muted-foreground)]">
                                                    {new Date(log.createdAt).toLocaleDateString()}
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

            {/* Confirmation Modals */}
            <ConfirmationModal
                isOpen={!!memberToRemove}
                onClose={() => setMemberToRemove(null)}
                onConfirm={handleConfirmRemoveMember}
                title="Remove Member"
                description="Are you sure you want to remove this member from the team? They will lose all access to team projects."
                confirmText="Remove"
                variant="destructive"
            />

            <ConfirmationModal
                isOpen={!!inviteToCancel}
                onClose={() => setInviteToCancel(null)}
                onConfirm={handleConfirmCancelInvite}
                title="Cancel Invite"
                description="Are you sure you want to cancel this invitation?"
                confirmText="Cancel"
                variant="destructive"
            />

            <ConfirmationModal
                isOpen={confirmLeaveTeam}
                onClose={() => setConfirmLeaveTeam(false)}
                onConfirm={handleLeaveTeam}
                title="Leave Team"
                description="Are you sure you want to leave this team?"
                confirmText="Leave Team"
                variant="destructive"
            />

            <ConfirmationModal
                isOpen={confirmDeleteTeam}
                onClose={() => setConfirmDeleteTeam(false)}
                onConfirm={handleDeleteTeam}
                title="Delete Team"
                description="Are you sure you want to delete this team? All projects and deployments will be permanently deleted."
                confirmText="Delete Team"
                variant="destructive"
            />
        </div>
    );
}
