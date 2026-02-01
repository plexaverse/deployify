'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Rocket, Github, Zap, Shield, Globe, ArrowRight, Search, X, Cpu } from 'lucide-react';
import { Spotlight } from '@/components/ui/spotlight';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import { BackgroundBeams } from '@/components/ui/background-beams';

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [os, setOs] = useState<'mac' | 'other' | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Detect OS and defer state update to avoid lint error
    if (typeof navigator !== 'undefined') {
      const isMac = navigator.userAgent.indexOf('Mac') !== -1;
      const timeoutId = setTimeout(() => {
        setOs(isMac ? 'mac' : 'other');
      }, 0);

      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        clearTimeout(timeoutId);
      };
    }
  }, []);

  return (
    <div className="min-h-screen bg-black/[0.96] antialiased relative overflow-hidden">
      <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="white" />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.1] bg-black/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Rocket className="w-6 h-6 text-indigo-500" />
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 bg-opacity-50">Deployify</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login" className="text-sm font-medium text-neutral-300 hover:text-white transition-colors">
                Sign In
              </Link>
              <Link
                href="/api/auth/github"
                prefetch={false}
                className="bg-white text-black px-4 py-2 rounded-lg text-sm font-semibold hover:bg-neutral-200 transition-colors flex items-center gap-2"
                aria-label="Sign in with GitHub"
              >
                <Github className="w-4 h-4" />
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-medium text-neutral-400 uppercase tracking-widest">
                Deployify 1.0 is here
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl md:text-7xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 bg-opacity-50 leading-tight mb-6"
            >
              Deploy like Vercel, <br /> Pay like raw GCP.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-neutral-400 text-lg md:text-xl max-w-2xl mx-auto mb-10"
            >
              The self-hosted deployment platform that brings Vercel&apos;s developer experience
              to your own Google Cloud infrastructure.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link
                href="/api/auth/github"
                prefetch={false}
                className="w-full sm:w-auto bg-white text-black px-8 py-4 rounded-xl text-lg font-bold hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
              >
                <Github className="w-5 h-5" />
                Connect GitHub
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="#features"
                className="w-full sm:w-auto px-8 py-4 rounded-xl text-lg font-bold border border-white/10 hover:bg-white/5 transition-all text-center"
              >
                Documentation
              </Link>
            </motion.div>
          </motion.div>

          {/* Feature Bento Grid */}
          <div id="features" className="mt-40">
            <h2 className="text-3xl md:text-5xl font-bold text-center mb-16 bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 bg-opacity-50">
              Everything you need to scale
            </h2>
            <BentoGrid>
              <BentoGridItem
                title="Git-Push Deploys"
                description="Push to GitHub and your app is live. Automatic deployments on every commit."
                header={<div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-900 to-neutral-800 border border-white/5 items-center justify-center"><Zap className="w-12 h-12 text-yellow-500" /></div>}
                icon={<Rocket className="h-4 w-4 text-neutral-500" />}
                className="md:col-span-2"
              />
              <BentoGridItem
                title="Preview Deployments"
                description="Unique URL for every PR."
                header={<div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-900 to-neutral-800 border border-white/5 items-center justify-center"><Globe className="w-12 h-12 text-blue-500" /></div>}
                icon={<Search className="h-4 w-4 text-neutral-500" />}
              />
              <BentoGridItem
                title="Cloud Armor WAF"
                description="DDoS protection & security."
                header={<div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-900 to-neutral-800 border border-white/5 items-center justify-center"><Shield className="w-12 h-12 text-emerald-500" /></div>}
                icon={<Shield className="h-4 w-4 text-neutral-500" />}
              />
              <BentoGridItem
                title="Full Resource Control"
                description="Choose CPU, Memory and Auto-scaling limits."
                header={<div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-900 to-neutral-800 border border-white/5 items-center justify-center"><Cpu className="w-12 h-12 text-purple-500" /></div>}
                icon={<Cpu className="h-4 w-4 text-neutral-500" />}
                className="md:col-span-2"
              />
            </BentoGrid>
          </div>

          {/* Repo Search Preview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-40 max-w-2xl mx-auto"
          >
            <div className="p-8 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm relative group">
              <h3 className="text-xl font-bold mb-6 text-center">Ready to deploy?</h3>
              <div className="relative">
                <label htmlFor="repo-search" className="sr-only">Search your GitHub repositories</label>
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500 group-focus-within:text-white transition-colors" />
                <input
                  id="repo-search"
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search your GitHub repositories..."
                  className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {searchQuery ? (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="p-1 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-white transition-all"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : (
                    os && (
                      <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-white/20 bg-white/5 px-1.5 font-mono text-[10px] font-medium text-neutral-500 opacity-100">
                        <span className="text-xs">{os === 'mac' ? '⌘' : 'Ctrl'}</span>K
                      </kbd>
                    )
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      <BackgroundBeams />

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-12 mt-40">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Rocket className="w-6 h-6 text-indigo-500" />
            <span className="font-bold text-xl">Deployify</span>
          </div>
          <p className="text-neutral-500 text-sm">
            © 2026 Deployify. Built for the modern developer.
          </p>
        </div>
      </footer>
    </div>
  );
}
