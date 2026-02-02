'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Rocket, Github, Zap, Shield, Globe, ArrowRight, Search, X, Cpu, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spotlight } from '@/components/ui/spotlight';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import { BackgroundBeams } from '@/components/ui/background-beams';

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [os, setOs] = useState<'mac' | 'other' | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

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
              className="text-5xl md:text-8xl font-extrabold text-center bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 bg-opacity-50 leading-tight tracking-tighter mb-6"
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
              <button
                className="w-full sm:w-auto px-8 py-4 rounded-xl text-lg font-bold border border-white/10 hover:bg-white/5 transition-all text-center flex items-center justify-center gap-2"
                aria-label="Watch demo video"
              >
                <Zap className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                Watch Demo
              </button>
            </motion.div>

            {/* Micro-UX: Quick Copy Command */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-12 max-w-md mx-auto p-1 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex items-center gap-3 pr-4 group"
            >
              <div className="bg-indigo-500/10 px-3 py-2 rounded-xl text-xs font-mono text-indigo-400 font-bold">
                $
              </div>
              <code className="text-sm font-mono text-neutral-300 flex-1 text-left">
                pnpm dlx deployify login
              </code>
              <button
                onClick={() => handleCopy('pnpm dlx deployify login', 'login-cmd')}
                className="p-2 hover:bg-white/10 rounded-xl transition-all text-neutral-500 hover:text-white active:scale-95"
                aria-label="Copy login command"
              >
                {copiedId === 'login-cmd' ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4 group-hover:scale-110 transition-transform" />
                )}
              </button>
            </motion.div>
          </motion.div>

          {/* Social Proof */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            viewport={{ once: true }}
            className="mt-24 text-center"
          >
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-neutral-500 mb-8">
              Trusted by innovative teams
            </p>
            <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-8 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
              {['ACME', 'GLOBEX', 'SOYLENT', 'INITECH', 'UMBRELLA'].map((logo) => (
                <span key={logo} className="text-xl md:text-2xl font-black tracking-tighter text-neutral-400 hover:text-white transition-colors cursor-default">
                  {logo}
                </span>
              ))}
            </div>
          </motion.div>

          {/* The Method Section */}
          <div className="mt-40">
            <h2 className="text-3xl md:text-5xl font-bold text-center mb-16 bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 bg-opacity-50">
              The Deployify Method
            </h2>
            <div className="grid md:grid-cols-2 gap-12 items-center bg-white/5 p-8 rounded-[2.5rem] border border-white/10">
              <div className="space-y-4" role="tablist" aria-label="Deployment Method Tabs">
                {[
                  { title: "Connect", desc: "Sync your GitHub repo in one click.", icon: <Github className="w-5 h-5" /> },
                  { title: "Push", desc: "Automatic builds on every commit.", icon: <Rocket className="w-5 h-5" /> },
                  { title: "Preview", desc: "Unique URLs for every PR.", icon: <Globe className="w-5 h-5" /> },
                  { title: "Scale", desc: "Global edge network & WAF.", icon: <Shield className="w-5 h-5" /> }
                ].map((step, i) => (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={activeTab === i}
                    aria-controls={`tab-panel-${i}`}
                    id={`tab-${i}`}
                    onClick={() => setActiveTab(i)}
                    className={cn(
                      "w-full text-left p-6 rounded-2xl transition-all duration-300 flex gap-4 items-start",
                      activeTab === i ? "bg-white/10 shadow-lg ring-1 ring-white/20" : "hover:bg-white/5 opacity-50"
                    )}
                  >
                    <div className={cn("mt-1 p-2 rounded-lg", activeTab === i ? "bg-indigo-500 text-white" : "bg-white/5")}>
                      {step.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-lg">{step.title}</h4>
                      <p className="text-neutral-400 text-sm">{step.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="relative aspect-square md:aspect-auto md:h-full min-h-[400px] bg-neutral-900 rounded-[2rem] border border-white/10 overflow-hidden flex items-center justify-center p-12">
                 <motion.div
                   key={activeTab}
                   role="tabpanel"
                   id={`tab-panel-${activeTab}`}
                   aria-labelledby={`tab-${activeTab}`}
                   initial={{ opacity: 0, scale: 0.95 }}
                   animate={{ opacity: 1, scale: 1 }}
                   className="w-full h-full flex items-center justify-center"
                 >
                    <div className="text-center">
                       <div className="w-20 h-20 rounded-3xl bg-indigo-500/20 flex items-center justify-center mx-auto mb-6">
                         {[<Github key={0} className="w-10 h-10" />, <Rocket key={1} className="w-10 h-10" />, <Globe key={2} className="w-10 h-10" />, <Shield key={3} className="w-10 h-10" />][activeTab]}
                       </div>
                       <h3 className="text-2xl font-bold mb-2">{["GitHub Integration", "Instant Deployment", "Preview Links", "Production Grade"][activeTab]}</h3>
                       <p className="text-neutral-400">Experience the fastest way to ship Next.js apps.</p>
                    </div>
                 </motion.div>
              </div>
            </div>
          </div>

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
