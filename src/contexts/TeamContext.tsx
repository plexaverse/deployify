'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Team } from '@/types';

interface TeamContextType {
    activeTeam: Team | null;
    setActiveTeam: (team: Team | null) => void;
    teams: Team[];
    isLoading: boolean;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
    const [activeTeam, setActiveTeam] = useState<Team | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function fetchTeams() {
            try {
                const response = await fetch('/api/teams');
                const data = await response.json();
                if (data.teams) {
                    setTeams(data.teams);
                }
            } catch (error) {
                console.error('Failed to fetch teams:', error);
            } finally {
                setIsLoading(false);
            }
        }

        fetchTeams();
    }, []);

    useEffect(() => {
        const storedTeamId = localStorage.getItem('activeTeamId');
        if (storedTeamId && teams.length > 0) {
            const team = teams.find(t => t.id === storedTeamId);
            if (team) {
                setActiveTeam(team);
            }
        }
    }, [teams]);

    const handleSetActiveTeam = (team: Team | null) => {
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
            isLoading
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
