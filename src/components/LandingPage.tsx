'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Rocket, Github, Zap, Shield, Globe, ArrowRight, Search, X, Cpu, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Spotlight } from '@/components/ui/spotlight';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { TracingBeam } from '@/components/ui/tracing-beam';

export default function LandingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [os, setOs] = useState<'mac' | 'other' | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const MOCK_REPOS = ['nextjs-dashboard', 'deployify-cli', 'awesome-gcp-templates', 'react-portfolio'];
  const filteredRepos = searchQuery.trim() ? MOCK_REPOS.filter(r => r.toLowerCase().includes(searchQuery.toLowerCase())) : [];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied to clipboard');
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
            <Link href="/" className="flex items-center gap-2 group" aria-label="Deployify Home">
              <Rocket className="w-6 h-6 text-white group-hover:rotate-12 transition-transform" />
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 bg-opacity-50">Deployify</span>
            </Link>
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
      <main id="main-content" className="relative z-10 pt-24 pb-16 px-4">
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
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-6"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-[0.2em]">
                Deployify 1.0 is here
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl md:text-6xl font-extrabold text-center bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 bg-opacity-50 leading-[1.1] tracking-tight mb-6"
            >
              Deploy like Vercel, <br /> Pay like raw GCP.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-neutral-400 text-base md:text-lg max-w-2xl mx-auto mb-10"
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
              <MovingBorderButton
                as={Link}
                href="/api/auth/github"
                containerClassName="w-full sm:w-auto h-auto"
                className="bg-white text-black px-8 py-4 text-base font-bold flex items-center justify-center gap-2"
              >
                <Github className="w-5 h-5" />
                Connect GitHub
                <ArrowRight className="w-5 h-5" />
              </MovingBorderButton>
              <button
                onClick={() => toast.info('Demo video coming soon!', { description: 'We are currently polishing our walkthrough.' })}
                className="w-full sm:w-auto px-8 py-4 rounded-xl text-lg font-bold border border-white/10 hover:bg-white/5 transition-all text-center flex items-center justify-center gap-2 group"
                aria-label="Watch 2-minute demo video"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-yellow-500 blur-sm rounded-full opacity-0 group-hover:opacity-50 group-hover:animate-pulse transition-opacity" aria-hidden="true" />
                  <Zap className="w-5 h-5 text-yellow-500 fill-yellow-500 relative z-10" aria-hidden="true" />
                </div>
                Watch Demo
                <span className="text-xs font-medium text-neutral-500 ml-1">2 min</span>
              </button>
            </motion.div>

            {/* Micro-UX: Quick Copy Command */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-12 max-w-md mx-auto p-1 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex items-center gap-3 pr-4 group"
            >
              <div className="bg-white/10 px-3 py-2 rounded-xl text-xs font-mono text-white font-bold">
                $
              </div>
              <code className="text-sm font-mono text-neutral-300 flex-1 text-left">
                pnpm dlx deployify login
              </code>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => handleCopy('pnpm dlx deployify login', 'login-cmd')}
                className="p-2 hover:bg-white/10 rounded-xl transition-all text-neutral-500 hover:text-white active:scale-95"
                aria-label={copiedId === 'login-cmd' ? "Login command copied" : "Copy login command"}
              >
                {copiedId === 'login-cmd' ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4 group-hover:scale-110 transition-transform" />
                )}
              </motion.button>
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
            <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-8 opacity-40 grayscale hover:grayscale-0 transition-all duration-500" role="list" aria-label="Trusted companies">
              {['ACME', 'GLOBEX', 'SOYLENT', 'INITECH', 'UMBRELLA'].map((logo) => (
                <span
                  key={logo}
                  role="listitem"
                  aria-label={`${logo} logo`}
                  className="text-xl md:text-2xl font-black tracking-tighter text-neutral-400 hover:text-white transition-colors cursor-default"
                >
                  {logo}
                </span>
              ))}
            </div>
          </motion.div>

          {/* The Method Section */}
          <div className="mt-40">
            <h2 className="text-3xl md:text-5xl font-bold text-center mb-24 bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 bg-opacity-50">
              The Deployify Method
            </h2>
            <TracingBeam className="px-6">
              <div className="max-w-2xl mx-auto antialiased pt-4 relative">
                {[
                  {
                    title: "Connect",
                    desc: "Sync your GitHub repository in one click. We'll automatically detect your framework and configuration.",
                    icon: <Github className="w-6 h-6 text-white" />,
                    badge: "Instant Integration"
                  },
                  {
                    title: "Push",
                    desc: "Every git push triggers a lightning-fast build on Google Cloud Build. No more manual deployment scripts.",
                    icon: <Rocket className="w-6 h-6 text-white" />,
                    badge: "Automated CI/CD"
                  },
                  {
                    title: "Preview",
                    desc: "Get a unique URL for every pull request. Share with your team for feedback before merging to production.",
                    icon: <Globe className="w-6 h-6 text-white" />,
                    badge: "Collaborate Faster"
                  },
                  {
                    title: "Scale",
                    desc: "Your app is deployed to Cloud Run, automatically scaling from zero to millions of requests with ease.",
                    icon: <Shield className="w-6 h-6 text-white" />,
                    badge: "Production Ready"
                  }
                ].map((step, i) => (
                  <div key={i} className="mb-20 relative group">
                    <motion.div
                      initial={{ opacity: 0.1, x: -20 }}
                      whileInView={{ opacity: 0.3, x: 0 }}
                      viewport={{ margin: "-100px" }}
                      transition={{ duration: 0.8 }}
                      className="absolute -left-12 md:-left-16 top-0 text-4xl font-black text-neutral-800/30 tabular-nums transition-colors group-hover:text-white/30 group-hover:opacity-100"
                      aria-hidden="true"
                    >
                      0{i + 1}
                    </motion.div>
                    <div className="flex items-center gap-4 mb-4">
                       <motion.div
                         initial={{ scale: 0.8, opacity: 0.5 }}
                         whileInView={{ scale: 1, opacity: 1 }}
                         viewport={{ margin: "-100px" }}
                         className="p-3 rounded-2xl bg-white/5 border border-white/10 group-hover:border-white/20 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.05)] group-hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                       >
                         {step.icon}
                       </motion.div>
                       <h3 className="text-2xl font-bold group-hover:text-white transition-colors">{step.title}</h3>
                    </div>
                    <div className="text-lg text-neutral-400 leading-relaxed mb-4">
                      {step.desc}
                    </div>
                    <div className="p-1 rounded-2xl bg-white/5 w-fit px-4 py-1 text-[10px] font-bold text-neutral-400 uppercase tracking-widest border border-white/10">
                      {step.badge}
                    </div>
                  </div>
                ))}
              </div>
            </TracingBeam>
          </div>

          {/* Price Efficiency Section */}
          <div className="mt-40">
            <h2 className="text-3xl md:text-5xl font-bold text-center mb-16 bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 bg-opacity-50">
              Pay for what you use
            </h2>
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="p-6 rounded-[2rem] bg-white/5 border border-neutral-800 backdrop-blur-sm"
              >
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h3 className="text-lg font-bold mb-1 text-neutral-400">Vercel / Netlify</h3>
                    <p className="text-xs text-neutral-500 font-medium">Enterprise DX at a Premium</p>
                  </div>
                  <X className="w-5 h-5 text-red-500" />
                </div>
                <div className="space-y-4">
                  {[
                    { label: "Base Price", value: "$20/mo per user" },
                    { label: "Bandwidth", value: "$0.15 / GB" },
                    { label: "Serverless", value: "$0.60 / 1M GB-s" },
                    { label: "WAF", value: "Enterprise Only ($$$)" }
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-neutral-500">{item.label}</span>
                      <span className="font-mono text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="p-6 rounded-[2rem] bg-white/5 border border-neutral-800 backdrop-blur-sm relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 p-4">
                   <div className="bg-white text-[10px] text-black font-black px-2 py-1 rounded-md uppercase tracking-tighter animate-pulse">Save 80%</div>
                </div>
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h3 className="text-lg font-bold mb-1 text-white">Deployify + GCP</h3>
                    <p className="text-xs text-neutral-400 font-medium">Enterprise DX at Raw Cost</p>
                  </div>
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div className="space-y-4">
                  {[
                    { label: "Base Price", value: "$0 / mo" },
                    { label: "Bandwidth", value: "$0.08 / GB (GCP Raw)" },
                    { label: "Serverless", value: "$0.01 / 1M reqs" },
                    { label: "WAF", value: "Included (Cloud Armor)" }
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between border-b border-white/10 pb-2">
                      <span className="text-neutral-400">{item.label}</span>
                      <span className="font-mono text-white font-bold">{item.value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
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
                description={
                  <div className="flex items-center justify-between gap-2">
                    <span>Unique URL for every PR.</span>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy('https://my-app-pr-123.deployify.run', 'preview-url');
                      }}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-white transition-all active:scale-90"
                      aria-label={copiedId === 'preview-url' ? "Sample preview URL copied" : "Copy sample preview URL"}
                    >
                      {copiedId === 'preview-url' ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </motion.button>
                  </div>
                }
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
                  role="combobox"
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search your GitHub repositories..."
                  className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSelectedIndex(-1); }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSelectedIndex(prev => (prev < filteredRepos.length - 1 ? prev + 1 : prev));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1));
                    } else if (e.key === 'Enter' && selectedIndex >= 0) {
                      setSearchQuery(filteredRepos[selectedIndex]);
                      setSelectedIndex(-1);
                    }
                  }}
                  aria-expanded={searchQuery.trim().length > 0}
                  aria-haspopup="listbox"
                  aria-controls="repo-results"
                  aria-autocomplete="list"
                  aria-activedescendant={selectedIndex >= 0 ? `repo-option-${selectedIndex}` : undefined}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {searchQuery ? (
                    <button
                      onClick={() => { setSearchQuery(''); setSelectedIndex(-1); }}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-white transition-all active:scale-95"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : (
                    os && (
                      <div className="hidden sm:flex items-center gap-1 opacity-50 group-focus-within:opacity-100 transition-opacity">
                        <kbd className="h-5 select-none items-center gap-1 rounded border border-white/20 bg-white/10 px-1.5 font-mono text-[10px] font-bold text-neutral-400">
                          {os === 'mac' ? '⌘' : 'Ctrl'}
                        </kbd>
                        <kbd className="h-5 select-none items-center gap-1 rounded border border-white/20 bg-white/10 px-1.5 font-mono text-[10px] font-bold text-neutral-400">
                          K
                        </kbd>
                      </div>
                    )
                  )}
                </div>
                {searchQuery.trim() && (
                  <motion.div id="repo-results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} role="listbox" className="absolute top-full left-0 right-0 mt-2 bg-neutral-900 border border-white/10 rounded-2xl overflow-hidden z-20 shadow-2xl p-2">
                    {filteredRepos.length > 0 ? filteredRepos.map((repo, i) => (
                      <div
                        key={repo}
                        id={`repo-option-${i}`}
                        role="option"
                        aria-selected={selectedIndex === i}
                        onClick={() => { setSearchQuery(repo); setSelectedIndex(-1); }}
                        className={cn("px-4 py-2 rounded-xl cursor-pointer flex items-center gap-3 text-sm transition-colors", selectedIndex === i ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white")}
                      >
                        <Github className="w-4 h-4" /> {repo}
                      </div>
                    )) : <div className="px-4 py-4 text-center text-sm text-neutral-500">No results for &quot;{searchQuery}&quot;</div>}
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Edge Network Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-40 text-center px-4"
          >
            <h2 className="text-3xl md:text-5xl font-bold mb-8 bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 bg-opacity-50">
              Global Edge Network
            </h2>
            <p className="text-neutral-400 max-w-2xl mx-auto mb-12">
              Deploy your applications to over 100+ locations worldwide with automatic global load balancing and DDoS protection.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {[
                { name: 'Ultra-low Latency', icon: Zap },
                { name: 'Auto-scaling', icon: Rocket },
                { name: 'Anycast IP', icon: Globe },
                { name: 'Cloud Armor', icon: Shield },
              ].map((feat, i) => (
                <div key={feat.name} className="group relative p-8 rounded-[2rem] border border-white/5 bg-white/5 backdrop-blur-sm hover:border-white/50 transition-all duration-500 text-center overflow-hidden">
                  <div className="absolute top-4 right-6 text-xs font-black text-white/10 group-hover:text-white/20 tabular-nums transition-colors" aria-hidden="true">0{i + 1}</div>
                  <feat.icon className="w-8 h-8 text-white mx-auto mb-4 group-hover:scale-110 transition-transform duration-500" aria-hidden="true" />
                  <span className="text-sm font-bold text-neutral-300 block">{feat.name}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </main>

      <BackgroundBeams />

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-12 mt-40">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Rocket className="w-6 h-6 text-white" />
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
