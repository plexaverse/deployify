'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Team, TeamRole } from '@/types';

export type TeamWithRole = Team & { role: TeamRole };

interface TeamContextType {
    activeTeam: TeamWithRole | null;
    setActiveTeam: (team: TeamWithRole | null) => void;
    teams: TeamWithRole[];
    isLoading: boolean;
    role: TeamRole | undefined;
    refreshTeams: () => Promise<void>;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
    const [activeTeam, setActiveTeam] = useState<TeamWithRole | null>(null);
    const [teams, setTeams] = useState<TeamWithRole[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    async function fetchTeams() {
        if (teams.length === 0) setIsLoading(true);
        try {
            const response = await fetch('/api/teams');
            if (response.ok) {
                const data = await response.json();
                if (data.teams) {
                    setTeams(data.teams);
                }
            }
        } catch (error) {
            console.error('Failed to fetch teams:', error);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchTeams();
    }, []);

    useEffect(() => {
        const storedTeamId = localStorage.getItem('activeTeamId');
        if (storedTeamId && teams.length > 0) {
            const team = teams.find(t => t.id === storedTeamId);
            if (team) {
                setActiveTeam(team);
            } else if (!isLoading) {
                // If teams loaded and stored team not found, clear it
                setActiveTeam(null);
                localStorage.removeItem('activeTeamId');
            }
        }
    }, [teams, isLoading]);

    const handleSetActiveTeam = (team: TeamWithRole | null) => {
        setActiveTeam(team);
        if (team) {
            localStorage.setItem('activeTeamId', team.id);
        } else {
            localStorage.removeItem('activeTeamId');
        }
    };

    return (
        <TeamContext.Provider value={{
            activeTeam,
            setActiveTeam: handleSetActiveTeam,
            teams,
            isLoading,
            role: activeTeam?.role,
            refreshTeams: fetchTeams
        }}>
            {children}
        </TeamContext.Provider>
    );
}

export function useTeam() {
    const context = useContext(TeamContext);
    if (context === undefined) {
        throw new Error('useTeam must be used within a TeamProvider');
    }
    return context;
}
