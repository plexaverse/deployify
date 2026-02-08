import { StateCreator } from 'zustand';
import type { Team } from '@/types';

export interface TeamSlice {
    activeTeam: Team | null;
    teams: Team[];
    isLoadingTeams: boolean;
    setActiveTeam: (team: Team | null) => void;
    fetchTeams: () => Promise<void>;
    createTeam: (name: string, slug: string) => Promise<Team | null>;
}

export const createTeamSlice: StateCreator<TeamSlice> = (set, get) => ({
    activeTeam: null,
    teams: [],
    isLoadingTeams: true,
    setActiveTeam: (team) => {
        set({ activeTeam: team });
        if (team) {
            localStorage.setItem('activeTeamId', team.id);
        } else {
            localStorage.removeItem('activeTeamId');
        }
    },
    fetchTeams: async () => {
        set({ isLoadingTeams: true });
        try {
            const response = await fetch('/api/teams');
            const data = await response.json();
            if (data.teams) {
                set({ teams: data.teams });

                // Initialize active team from localStorage if not set
                const storedTeamId = localStorage.getItem('activeTeamId');
                if (storedTeamId && data.teams.length > 0) {
                    const team = data.teams.find((t: Team) => t.id === storedTeamId);
                    if (team) {
                        set({ activeTeam: team });
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch teams:', error);
        } finally {
            set({ isLoadingTeams: false });
        }
    },
    createTeam: async (name: string, slug: string) => {
        try {
            const response = await fetch('/api/teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, slug }),
            });
            const data = await response.json();
            if (response.ok && data.team) {
                const { teams } = get();
                set({ teams: [...teams, data.team] });
                return data.team;
            } else {
                console.error('Failed to create team:', data.error);
                return null;
            }
        } catch (error) {
            console.error('Failed to create team:', error);
            return null;
        }
    },
});
