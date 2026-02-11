'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Rocket, X } from 'lucide-react';
import { Project } from '@/types';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
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
    if (isOpen) {
      // In a real app we might cache this or use a context
      fetch('/api/projects')
        .then(res => res.json())
        .then(data => setProjects(data.projects || []))
        .catch(err => console.error(err));

      // Focus input
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.repoFullName.toLowerCase().includes(query.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-start justify-center pt-[20vh] px-4" onClick={() => setIsOpen(false)}>
       <div
         className="w-full max-w-xl bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
         onClick={e => e.stopPropagation()}
       >
          <div className="flex items-center border-b border-white/10 px-4 group">
            <Search className="w-5 h-5 text-neutral-500 group-focus-within:text-white transition-colors" />
            <input
               ref={inputRef}
               role="combobox"
               aria-expanded={isOpen}
               aria-haspopup="listbox"
               aria-controls="command-results"
               aria-activedescendant={filtered.length > 0 ? `project-${filtered[selectedIndex]?.id}` : undefined}
               className="flex-1 bg-transparent border-0 p-4 text-white placeholder:text-neutral-500 focus:ring-0 focus:outline-none"
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
                   className="p-1 rounded-md hover:bg-white/10 text-neutral-500 hover:text-white transition-colors"
                   aria-label="Clear search"
                 >
                   <X className="w-4 h-4" />
                 </button>
               )}
               <span className="text-xs text-neutral-500 font-mono border border-white/10 rounded px-1.5 py-0.5">ESC</span>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
             {!isOpen ? (
               <div className="p-4 text-center text-neutral-500 text-sm">Loading...</div>
             ) : filtered.length === 0 && projects.length > 0 ? (
               <div className="p-4 text-center text-neutral-500 text-sm">No results found.</div>
             ) : projects.length === 0 ? (
               <div className="p-4 text-center text-neutral-500 text-sm">Loading projects...</div>
             ) : (
               <div className="space-y-1" role="listbox" id="command-results">
                 {filtered.map((project, index) => (
                   <button
                     id={`project-${project.id}`}
                     key={project.id}
                     role="option"
                     aria-selected={selectedIndex === index}
                     onClick={() => {
                       router.push(`/dashboard/${project.id}`);
                       setIsOpen(false);
                     }}
                     className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors group ${
                       selectedIndex === index ? 'bg-white/10' : 'hover:bg-white/5'
                     }`}
                   >
                     <Rocket className={`w-4 h-4 ${selectedIndex === index ? 'text-indigo-500' : 'text-neutral-500 group-hover:text-indigo-500'}`} />
                     <div className="flex-1">
                        <div className="text-sm font-medium text-white">{project.name}</div>
                        <div className="text-xs text-neutral-500">{project.repoFullName}</div>
                     </div>
                     <span className="text-xs text-neutral-600 group-hover:text-neutral-400">Jump to</span>
                   </button>
                 ))}
               </div>
             )}
          </div>
          <div className="p-2 border-t border-white/10 bg-white/5 text-xs text-neutral-500 flex justify-between px-4">
             <span>Deployify Command</span>
             <span>{projects.length} projects</span>
          </div>
       </div>
    </div>
  );
}
