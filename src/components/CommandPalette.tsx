'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Search, Rocket, X, Loader2, CornerDownLeft } from 'lucide-react';
import { Project } from '@/types';
import { Spotlight } from '@/components/ui/spotlight';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Toggle with Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Fetch projects when opened
  useEffect(() => {
    if (!isOpen) return;

    // Defer state update to appease strict linter (pattern from .Jules/palette.md)
    const rafId = requestAnimationFrame(() => {
      setIsLoading(true);
    });

    // In a real app we might cache this or use a context
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => setProjects(data.projects || []))
      .catch(err => console.error(err))
      .finally(() => setIsLoading(false));

    // Focus input
    const focusTimeoutId = setTimeout(() => inputRef.current?.focus(), 100);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(focusTimeoutId);
    };
  }, [isOpen]);

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.repoFullName.toLowerCase().includes(query.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-start justify-center pt-[20vh] px-4" onClick={() => setIsOpen(false)}>
       <div
         className="w-full max-w-xl bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 relative"
         onClick={e => e.stopPropagation()}
       >
          <Spotlight className="-top-40 left-0" fill="var(--primary)" />
          <div className="flex items-center border-b border-[var(--border)] px-4 group relative z-10">
            <label htmlFor="command-search" className="sr-only">Search projects</label>
            <Search className="w-5 h-5 text-[var(--muted-foreground)] group-focus-within:text-[var(--foreground)] transition-colors" />
            <input
               id="command-search"
               ref={inputRef}
               role="combobox"
               aria-expanded={isOpen}
               aria-haspopup="listbox"
               aria-controls="command-results"
               aria-activedescendant={filtered.length > 0 ? `project-${filtered[selectedIndex]?.id}` : undefined}
               className="flex-1 bg-transparent border-0 p-4 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-0 focus:outline-none"
               placeholder="Search projects..."
               value={query}
               onChange={e => {
                 setQuery(e.target.value);
                 setSelectedIndex(0);
               }}
               onKeyDown={(e) => {
                 if (e.key === 'ArrowDown') {
                   e.preventDefault();
                   setSelectedIndex(prev => (prev < filtered.length - 1 ? prev + 1 : prev));
                 } else if (e.key === 'ArrowUp') {
                   e.preventDefault();
                   setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
                 } else if (e.key === 'Enter' && filtered[selectedIndex]) {
                   router.push(`/dashboard/${filtered[selectedIndex].id}`);
                   setIsOpen(false);
                 }
               }}
            />
            <div className="flex items-center gap-2">
               {query && (
                 <button
                   onClick={() => {
                     setQuery('');
                     setSelectedIndex(0);
                   }}
                   className="p-1 rounded-md hover:bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                   aria-label="Clear search"
                 >
                   <X className="w-4 h-4" />
                 </button>
               )}
               <span className="text-xs text-[var(--muted-foreground)] font-mono border border-[var(--border)] rounded px-1.5 py-0.5" aria-hidden="true">ESC</span>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2 relative z-10">
             {isLoading ? (
               <div className="p-8 text-center flex flex-col items-center gap-3">
                 <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
                 <span className="text-sm text-[var(--muted-foreground)]">Loading projects...</span>
               </div>
             ) : filtered.length === 0 && projects.length > 0 ? (
               <div className="p-8 text-center text-[var(--muted-foreground)] text-sm">No results found for &quot;{query}&quot;</div>
             ) : projects.length === 0 && !isLoading ? (
                <div className="p-8 text-center text-[var(--muted-foreground)] text-sm">No projects found.</div>
             ) : (
               <div className="space-y-1" role="listbox" id="command-results">
                 {filtered.map((project, index) => (
                   <motion.button
                     whileTap={{ scale: 0.98 }}
                     onMouseEnter={() => setSelectedIndex(index)}
                     id={`project-${project.id}`}
                     key={project.id}
                     role="option"
                     aria-selected={selectedIndex === index}
                     onClick={() => {
                       router.push(`/dashboard/${project.id}`);
                       setIsOpen(false);
                     }}
                     className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors group ${
                       selectedIndex === index ? 'bg-[var(--card-hover)]' : 'hover:bg-[var(--card-hover)]'
                     }`}
                   >
                     <Rocket className={`w-4 h-4 transition-colors ${selectedIndex === index ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]'}`} />
                     <div className="flex-1">
                        <div className={`text-sm font-medium transition-colors ${selectedIndex === index ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]'}`}>{project.name}</div>
                        <div className="text-xs text-[var(--muted-foreground)] opacity-70">{project.repoFullName}</div>
                     </div>
                     <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-opacity ${selectedIndex === index ? 'opacity-100' : 'opacity-0'}`}>
                        <span className="text-[var(--muted-foreground)]">Select</span>
                        <CornerDownLeft className="w-3 h-3 text-[var(--muted-foreground)]" />
                     </div>
                   </motion.button>
                 ))}
               </div>
             )}
          </div>
          <div className="p-2 border-t border-[var(--border)] bg-[var(--background)] text-xs text-[var(--muted-foreground)] flex justify-between px-4 relative z-10">
             <span className="font-medium">Deployify Search</span>
             <span className="opacity-70">{projects.length} projects loaded</span>
          </div>
       </div>
    </div>
  );
}
