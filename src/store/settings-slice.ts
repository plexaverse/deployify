import { StateCreator } from 'zustand';
import type { TeamMembership, TeamInvite, TeamRole, AuditEvent } from '@/types';

export interface SettingsSlice {
    teamMembers: (TeamMembership & { user: any })[];
    teamInvites: TeamInvite[];
    auditLogs: AuditEvent[];
    isLoadingSettings: boolean;
    isInvitingMember: boolean;
    inviteEmail: string;
    inviteRole: TeamRole;
    settingsError: string | null;

    setTeamMembers: (members: (TeamMembership & { user: any })[]) => void;
    setTeamInvites: (invites: TeamInvite[]) => void;
    setAuditLogs: (logs: AuditEvent[]) => void;
    setLoadingSettings: (isLoading: boolean) => void;
    setInvitingMember: (isInviting: boolean) => void;
    setInviteEmail: (email: string) => void;
    setInviteRole: (role: TeamRole) => void;
    setSettingsError: (error: string | null) => void;

    fetchTeamSettingsData: (teamId: string) => Promise<void>;
    fetchAuditLogs: (teamId: string) => Promise<void>;
    sendTeamInvite: (teamId: string) => Promise<void>;
    updateMemberRole: (teamId: string, userId: string, role: TeamRole) => Promise<void>;
    removeTeamMember: (teamId: string, userId: string) => Promise<void>;
    revokeTeamInvite: (teamId: string, inviteId: string) => Promise<void>;
}

export const createSettingsSlice: StateCreator<SettingsSlice> = (set, get) => ({
    teamMembers: [],
    teamInvites: [],
    auditLogs: [],
    isLoadingSettings: true,
    isInvitingMember: false,
    inviteEmail: '',
    inviteRole: 'member',
    settingsError: null,

    setTeamMembers: (members) => set({ teamMembers: members }),
    setTeamInvites: (invites) => set({ teamInvites: invites }),
    setAuditLogs: (logs) => set({ auditLogs: logs }),
    setLoadingSettings: (isLoading) => set({ isLoadingSettings: isLoading }),
    setInvitingMember: (isInviting) => set({ isInvitingMember: isInviting }),
    setInviteEmail: (email) => set({ inviteEmail: email }),
    setInviteRole: (role) => set({ inviteRole: role }),
    setSettingsError: (error) => set({ settingsError: error }),

    fetchTeamSettingsData: async (teamId) => {
        set({ isLoadingSettings: true });
        try {
            const [membersRes, invitesRes, auditRes] = await Promise.all([
                fetch(`/api/teams/${teamId}/members`),
                fetch(`/api/teams/${teamId}/invites`),
                fetch(`/api/teams/${teamId}/audit`)
            ]);

            if (membersRes.ok) {
                const data = await membersRes.json();
                set({ teamMembers: data.members });
            }

            if (invitesRes.ok) {
                const data = await invitesRes.json();
                set({ teamInvites: data.invites });
            }

            if (auditRes.ok) {
                const data = await auditRes.json();
                set({ auditLogs: data.logs || [] });
            }
        } catch (err) {
            console.error('Failed to fetch team data', err);
        } finally {
            set({ isLoadingSettings: false });
        }
    },

    fetchAuditLogs: async (teamId) => {
        try {
            const res = await fetch(`/api/teams/${teamId}/audit`);
            if (res.ok) {
                const data = await res.json();
                set({ auditLogs: data.logs || [] });
            }
        } catch (err) {
            console.error('Failed to fetch audit logs', err);
        }
    },

    sendTeamInvite: async (teamId) => {
        const { inviteEmail, inviteRole } = get();
        if (!inviteEmail) return;

        set({ isInvitingMember: true, settingsError: null });
        try {
            const res = await fetch(`/api/teams/${teamId}/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to send invite');
            }

            // Refresh invites and audit logs
            const invitesRes = await fetch(`/api/teams/${teamId}/invites`);
            if (invitesRes.ok) {
                const invitesData = await invitesRes.json();
                set({ teamInvites: invitesData.invites });
            }
            get().fetchAuditLogs(teamId);

            set({ inviteEmail: '' });
            alert('Invite sent successfully!');
        } catch (err) {
            set({ settingsError: err instanceof Error ? err.message : 'Failed to send invite' });
        } finally {
            set({ isInvitingMember: false });
        }
    },

    updateMemberRole: async (teamId, userId, role) => {
        try {
            const res = await fetch(`/api/teams/${teamId}/members/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update role');
            }

            const { teamMembers } = get();
            set({
                teamMembers: teamMembers.map(m => m.userId === userId ? { ...m, role } : m)
            });
            get().fetchAuditLogs(teamId);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to update role');
        }
    },

    removeTeamMember: async (teamId, userId) => {
        if (!confirm('Are you sure you want to remove this member?')) return;

        try {
            const res = await fetch(`/api/teams/${teamId}/members/${userId}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to remove member');
            }

            const { teamMembers } = get();
            set({
                teamMembers: teamMembers.filter(m => m.userId !== userId)
            });
            get().fetchAuditLogs(teamId);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to remove member');
        }
    },

    revokeTeamInvite: async (teamId, inviteId) => {
        if (!confirm('Are you sure you want to revoke this invite?')) return;

        try {
            const res = await fetch(`/api/teams/${teamId}/invites/${inviteId}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to revoke invite');
            }

            const { teamInvites } = get();
            set({
                teamInvites: teamInvites.filter(i => i.id !== inviteId)
            });
            // Revoke isn't audited yet in API but if we add it, we should fetch logs here too.
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to revoke invite');
        }
    }
});
