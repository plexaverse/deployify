'use client';

import { useEffect, useState } from 'react';
import { useTeam } from '@/contexts/TeamContext';
import { useRouter } from 'next/navigation';
import {
    Users,
    UserPlus,
    Trash2,
    Mail,
    Check,
    X,
    Shield,
    AlertTriangle,
    LogOut
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { NativeSelect } from '@/components/ui/native-select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import type { TeamMembership, TeamInvite, TeamRole } from '@/types';

interface MemberWithUser extends TeamMembership {
    user: {
        id: string;
        name: string | null;
        email: string | null;
        avatarUrl: string;
        githubUsername: string;
    } | null;
}

export default function TeamSettingsPage() {
    const { activeTeam, isLoading: isTeamLoading, setActiveTeam, fetchTeams } = useTeam();
    const router = useRouter();

    const [members, setMembers] = useState<MemberWithUser[]>([]);
    const [invites, setInvites] = useState<TeamInvite[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<TeamRole>('member');
    const [isInviting, setIsInviting] = useState(false);

    const [confirmDeleteTeam, setConfirmDeleteTeam] = useState(false);
    const [confirmLeaveTeam, setConfirmLeaveTeam] = useState(false);
    const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
    const [inviteToCancel, setInviteToCancel] = useState<string | null>(null);

    const isOwner = activeTeam?.membership.role === 'owner';
    const isAdmin = activeTeam?.membership.role === 'admin';
    const canManage = isOwner || isAdmin;

    useEffect(() => {
        if (!isTeamLoading && !activeTeam) {
            // Personal workspace - redirect or show message?
        } else if (activeTeam) {
            fetchData();
        }
    }, [activeTeam, isTeamLoading]);

    const fetchData = async () => {
        if (!activeTeam) return;
        setIsLoading(true);
        try {
            const [membersRes, invitesRes] = await Promise.all([
                fetch(`/api/teams/${activeTeam.id}/members`),
                fetch(`/api/teams/${activeTeam.id}/invites`)
            ]);

            const membersData = await membersRes.json();
            const invitesData = await invitesRes.json();

            if (membersData.members) setMembers(membersData.members);
            if (invitesData.invites) setInvites(invitesData.invites);
        } catch (error) {
            console.error('Failed to fetch team data:', error);
            toast.error('Failed to load team settings');
        } finally {
            setIsLoading(false);
        }
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeTeam || !inviteEmail) return;

        setIsInviting(true);
        try {
            const res = await fetch(`/api/teams/${activeTeam.id}/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed to send invite');

            toast.success(`Invite sent to ${inviteEmail}`);
            setInviteEmail('');
            setInvites([...invites, data.invite]);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to send invite');
        } finally {
            setIsInviting(false);
        }
    };

    const handleRemoveMember = async () => {
        if (!activeTeam || !memberToRemove) return;

        try {
            const res = await fetch(`/api/teams/${activeTeam.id}/members/${memberToRemove}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to remove member');
            }

            toast.success('Member removed');
            setMembers(members.filter(m => m.userId !== memberToRemove));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to remove member');
        } finally {
            setMemberToRemove(null);
        }
    };

    const handleCancelInvite = async () => {
        if (!activeTeam || !inviteToCancel) return;

        try {
            const res = await fetch(`/api/teams/${activeTeam.id}/invites/${inviteToCancel}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to cancel invite');
            }

            toast.success('Invite cancelled');
            setInvites(invites.filter(i => i.id !== inviteToCancel));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to cancel invite');
        } finally {
            setInviteToCancel(null);
        }
    };

    const handleLeaveTeam = async () => {
        if (!activeTeam) return;

        try {
            // Use remove member logic for self
            const res = await fetch(`/api/teams/${activeTeam.id}/members/${activeTeam.membership.userId}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to leave team');
            }

            toast.success('Left team successfully');
            setActiveTeam(null);
            await fetchTeams();
            router.push('/dashboard');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to leave team');
        } finally {
            setConfirmLeaveTeam(false);
        }
    };

    const handleDeleteTeam = async () => {
        if (!activeTeam) return;

        try {
            const res = await fetch(`/api/teams/${activeTeam.id}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete team');
            }

            toast.success('Team deleted successfully');
            setActiveTeam(null);
            await fetchTeams();
            router.push('/dashboard');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete team');
        } finally {
            setConfirmDeleteTeam(false);
        }
    };

    if (isTeamLoading) {
        return (
            <div className="max-w-4xl mx-auto p-6 space-y-8">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-48" />
                </div>
                <Card className="p-6">
                    <Skeleton className="h-32 w-full" />
                </Card>
                <Card className="p-6">
                    <Skeleton className="h-64 w-full" />
                </Card>
            </div>
        );
    }

    if (!activeTeam) {
        return (
            <div className="max-w-4xl mx-auto p-6">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold">Account Settings</h1>
                    <p className="text-[var(--muted-foreground)]">Manage your personal account settings.</p>
                </div>

                <Card className="p-6">
                    <div className="text-center py-8">
                        <Users className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-4" />
                        <h3 className="text-lg font-medium mb-2">Personal Workspace</h3>
                        <p className="text-[var(--muted-foreground)] mb-6">
                            You are currently viewing your personal workspace.
                            Switch to a team to manage team settings.
                        </p>
                        <Button onClick={() => router.push('/billing')} variant="outline">
                            Manage Billing
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8 pb-24">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">{activeTeam.name} Settings</h1>
                    <p className="text-[var(--muted-foreground)]">Manage team members and permissions.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                        {activeTeam.membership.role}
                    </Badge>
                </div>
            </div>

            {/* Invite Members */}
            {canManage && (
                <Card className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <UserPlus className="w-5 h-5 text-[var(--primary)]" />
                        <h2 className="text-lg font-semibold">Invite Members</h2>
                    </div>
                    <Separator className="mb-6" />
                    <form onSubmit={handleInvite} className="flex flex-col md:flex-row gap-4">
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
                        <div className="w-full md:w-32">
                            <Label htmlFor="role" className="sr-only">Role</Label>
                            <NativeSelect
                                id="role"
                                value={inviteRole}
                                onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                            >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                                <option value="viewer">Viewer</option>
                            </NativeSelect>
                        </div>
                        <Button type="submit" loading={isInviting}>
                            Send Invite
                        </Button>
                    </form>
                </Card>
            )}

            {/* Members List */}
            <Card className="overflow-hidden p-0">
                <div className="p-6 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-[var(--primary)]" />
                        <h2 className="text-lg font-semibold">Team Members</h2>
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
                    ) : members.length === 0 ? (
                        <div className="p-12 text-center text-[var(--muted-foreground)]">No members found</div>
                    ) : (
                        members.map((member) => (
                            <div key={member.id} className="p-4 flex items-center justify-between hover:bg-[var(--muted)]/5 transition-colors">
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
                                        <p className="font-medium text-[var(--foreground)]">
                                            {member.user?.name || member.user?.githubUsername || 'Unknown User'}
                                        </p>
                                        <p className="text-sm text-[var(--muted-foreground)]">
                                            {member.user?.email}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <Badge variant={member.role === 'owner' ? 'default' : 'secondary'} className="capitalize">
                                        {member.role}
                                    </Badge>

                                    {canManage && member.userId !== activeTeam.membership.userId && member.role !== 'owner' && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setMemberToRemove(member.userId)}
                                            className="text-[var(--muted-foreground)] hover:text-[var(--error)] transition-colors"
                                            title="Remove member"
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>

            {/* Pending Invites */}
            {canManage && invites.length > 0 && (
                <Card className="overflow-hidden p-0">
                    <div className="p-6 border-b border-[var(--border)]">
                        <div className="flex items-center gap-2">
                            <Mail className="w-5 h-5 text-[var(--primary)]" />
                            <h2 className="text-lg font-semibold">Pending Invites</h2>
                        </div>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                        {invites.map((invite) => (
                            <div key={invite.id} className="p-4 flex items-center justify-between hover:bg-[var(--muted)]/5 transition-colors">
                                <div>
                                    <p className="font-medium text-[var(--foreground)]">{invite.email}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="text-xs">
                                            {invite.role}
                                        </Badge>
                                        <span className="text-xs text-[var(--muted-foreground)]">
                                            Sent {new Date(invite.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setInviteToCancel(invite.id)}
                                    className="text-[var(--muted-foreground)] hover:text-[var(--error)] transition-colors"
                                    title="Cancel invite"
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Danger Zone */}
            <Card className="border-[var(--error)]/20 overflow-hidden p-0">
                <div className="p-6 border-b border-[var(--border)] bg-[var(--error)]/5">
                    <div className="flex items-center gap-2 text-[var(--error)]">
                        <AlertTriangle className="w-5 h-5" />
                        <h2 className="text-lg font-semibold">Danger Zone</h2>
                    </div>
                </div>
                <Separator />
                <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-medium">Leave Team</h3>
                            <p className="text-sm text-[var(--muted-foreground)]">
                                Revoke your access to this team. You will need to be re-invited to join again.
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            className="text-[var(--error)] border-[var(--error)]/20 hover:bg-[var(--error)]/10 hover:text-[var(--error)]"
                            onClick={() => setConfirmLeaveTeam(true)}
                        >
                            Leave Team
                        </Button>
                    </div>

                    {isOwner && (
                        <>
                            <div className="h-px bg-[var(--border)]" />
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-medium text-[var(--error)]">Delete Team</h3>
                                    <p className="text-sm text-[var(--muted-foreground)]">
                                        Permanently remove this team and all of its data. This action cannot be undone.
                                    </p>
                                </div>
                                <Button
                                    variant="secondary"
                                    className="bg-[var(--error)] text-white hover:bg-[var(--error)]/90"
                                    onClick={() => setConfirmDeleteTeam(true)}
                                >
                                    Delete Team
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </Card>

            {/* Confirmation Modals */}
            <ConfirmationModal
                isOpen={!!memberToRemove}
                onClose={() => setMemberToRemove(null)}
                onConfirm={handleRemoveMember}
                title="Remove Member"
                description="Are you sure you want to remove this member from the team?"
                confirmText="Remove"
                variant="destructive"
            />

            <ConfirmationModal
                isOpen={!!inviteToCancel}
                onClose={() => setInviteToCancel(null)}
                onConfirm={handleCancelInvite}
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
