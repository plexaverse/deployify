'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import { ProjectCard } from '@/components/ProjectCard';
import { CommandPalette } from '@/components/CommandPalette';
import { Project } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { OnboardingGuide } from '@/components/OnboardingGuide';
import { buttonVariants } from '@/components/ui/button';
import { useTeam } from '@/contexts/TeamContext';

export default function DashboardHome() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const { activeTeam, isLoading: isTeamLoading } = useTeam();

  useEffect(() => {
    async function fetchProjects() {
      setLoading(true);
      try {
        let url = '/api/projects';
        if (activeTeam) {
          url += `?teamId=${activeTeam.id}`;
        }
        const response = await fetch(url);
        const data = await response.json();
        setProjects(data.projects || []);
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      } finally {
        setLoading(false);
      }
    }

    if (!isTeamLoading) {
      fetchProjects();
    }
  }, [activeTeam, isTeamLoading]);

  return (
    <div className="flex-1 w-full">
      <CommandPalette />

      <div className="flex items-center justify-between mb-8">
        <div>
           <h1 className="text-2xl font-bold text-[var(--foreground)]">
               {activeTeam ? `${activeTeam.name} Projects` : 'Project Overview'}
           </h1>
           <p className="text-[var(--muted-foreground)] text-sm mt-1">
               Command Center • {projects.length} Projects
           </p>
        </div>
        <Link href="/new" className={buttonVariants({ variant: 'primary' })}>
           <Plus className="w-4 h-4 mr-2" />
           New Project
        </Link>
      </div>

      {loading ? (
        <BentoGrid>
           {[...Array(6)].map((_, i) => (
             <BentoGridItem
               key={i}
               title={<Skeleton className="h-4 w-1/2 mb-2" />}
               description={<Skeleton className="h-3 w-3/4" />}
               header={<Skeleton className="h-24 w-full rounded-xl" />}
               className="min-h-[10rem]"
             />
           ))}
        </BentoGrid>
      ) : projects.length === 0 ? (
        <OnboardingGuide />
      ) : (
        <BentoGrid>
           {projects.map((project) => (
             <Link
               key={project.id}
               href={`/dashboard/${project.id}`}
               className="block h-full"
             >
               <BentoGridItem
                 title={null}
                 description={null}
                 header={<ProjectCard project={project} />}
                 className="h-full min-h-[12rem] cursor-pointer hover:border-[var(--primary)] transition-colors"
               />
             </Link>
           ))}
        </BentoGrid>
      )}
    </div>
  );
}
