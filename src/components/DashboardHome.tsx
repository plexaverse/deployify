'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import { ProjectCard } from '@/components/ProjectCard';
import { CommandPalette } from '@/components/CommandPalette';
import { Project } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
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
           <h1 className="text-2xl font-bold">
               {activeTeam ? `${activeTeam.name} Projects` : 'Project Overview'}
           </h1>
           <p className="text-neutral-500 text-sm mt-1">
               Command Center • {projects.length} Projects
           </p>
        </div>
        <Link href="/dashboard/new" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
           <Plus className="w-4 h-4" />
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
        <div className="text-center py-20 border border-white/10 rounded-2xl bg-white/5">
           <h2 className="text-xl font-bold mb-2">No projects found</h2>
           <p className="text-neutral-400 mb-6">Get started by creating your first project.</p>
           <Link href="/dashboard/new" className="bg-white text-black px-6 py-3 rounded-xl font-bold hover:bg-neutral-200 transition-colors inline-flex items-center gap-2">
             <Plus className="w-4 h-4" />
             Create Project
           </Link>
        </div>
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
                 className="h-full min-h-[12rem] cursor-pointer hover:border-indigo-500/50 transition-colors"
               />
             </Link>
           ))}
        </BentoGrid>
      )}
    </div>
  );
}
