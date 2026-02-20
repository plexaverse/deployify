'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useSpring, AnimatePresence, useMotionValueEvent } from 'framer-motion';
import { Rocket, Github, Zap, Shield, Globe, ArrowRight, Search, X, Cpu, Copy, Check, Play, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Spotlight } from '@/components/ui/spotlight';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { TracingBeam } from '@/components/ui/tracing-beam';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function LandingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [os, setOs] = useState<'mac' | 'other' | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { scrollYProgress } = useScroll();

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    setShowBackToTop(latest > 0.05);
    if (latest > 0.01 && showScrollHint) {
      setShowScrollHint(false);
    }
  });

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

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
    <div className="min-h-screen bg-[var(--background)] antialiased relative overflow-hidden text-[var(--foreground)]">
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--muted)] via-[var(--foreground)] to-[var(--muted)] origin-left z-[100]"
        style={{ scaleX }}
      />
      <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="var(--foreground)" />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <motion.div whileTap={{ scale: 0.95 }}>
              <Link href="/" className="flex items-center gap-2 group" aria-label="Deployify Home">
                <Rocket className="w-6 h-6 text-[var(--foreground)] group-hover:rotate-12 transition-transform" />
                <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-[var(--foreground)] to-[var(--muted-foreground)] bg-opacity-50">Deployify</span>
              </Link>
            </motion.div>
            <div className="flex items-center gap-4">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Link href="/login" className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
                  Sign In
                </Link>
              </motion.div>
              <motion.div whileTap={{ scale: 0.95 }}>
                <Link
                  href="/api/auth/github"
                  prefetch={false}
                  className={cn(
                    buttonVariants({ variant: 'primary', size: 'sm' }),
                    "flex items-center gap-2"
                  )}
                  aria-label="Sign in with GitHub"
                >
                  <Github className="w-4 h-4" />
                  Get Started
                </Link>
              </motion.div>
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
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--card)] border border-[var(--border)] mb-6"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--success)]"></span>
              </span>
              <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-[0.2em]">
                Deployify 1.0 is here
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl md:text-6xl font-extrabold text-center bg-clip-text text-transparent bg-gradient-to-b from-[var(--foreground)] to-[var(--muted-foreground)] leading-[1.1] tracking-tight mb-6"
            >
              Deploy like Vercel, <br /> Pay like raw GCP.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-[var(--muted-foreground)] text-base md:text-lg max-w-2xl mx-auto mb-10"
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
              <motion.div whileTap={{ scale: 0.95 }} className="w-full sm:w-auto">
                <MovingBorderButton
                  as={Link}
                  href="/api/auth/github"
                  containerClassName="w-full h-auto"
                  className="bg-[var(--foreground)] text-[var(--background)] px-8 py-4 text-base font-bold flex items-center justify-center gap-2"
                >
                  <Github className="w-5 h-5" />
                  Connect GitHub
                  <ArrowRight className="w-5 h-5" />
                </MovingBorderButton>
              </motion.div>
              <motion.div whileTap={{ scale: 0.95 }} className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => toast.info('Demo video coming soon!', { description: 'We are currently polishing our walkthrough.' })}
                  className="w-full text-lg font-bold h-auto py-4 rounded-xl flex items-center justify-center gap-2 group"
                  aria-label="Watch 2-minute demo video"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-[var(--foreground)] blur-sm rounded-full opacity-0 group-hover:opacity-50 group-hover:animate-pulse transition-opacity" aria-hidden="true" />
                    <Play className="w-5 h-5 text-[var(--foreground)] fill-[var(--foreground)] relative z-10" aria-hidden="true" />
                  </div>
                  Watch Demo
                  <span className="text-xs font-medium text-[var(--muted-foreground)] ml-1">2 min</span>
                </Button>
              </motion.div>
            </motion.div>

            <AnimatePresence>
              {showScrollHint && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.5 }}
                  className="mt-16 flex flex-col items-center gap-2"
                  aria-hidden="true"
                >
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)] font-bold">Scroll to explore</span>
                  <div className="w-5 h-8 border-2 border-[var(--border)] rounded-full flex justify-center p-1.5">
                    <motion.div
                      animate={{ y: [0, 8, 0] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      className="w-1 h-1 bg-[var(--muted-foreground)] rounded-full"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Micro-UX: Quick Copy Command */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-12 max-w-md mx-auto p-1 rounded-2xl bg-[var(--card)] border border-[var(--border)] backdrop-blur-sm flex items-center gap-3 pr-4 group"
            >
              <div className="bg-[var(--muted)]/20 px-3 py-2 rounded-xl text-xs font-mono text-[var(--foreground)] font-bold">
                $
              </div>
              <code className="text-sm font-mono text-[var(--muted-foreground)] flex-1 text-left">
                pnpm dlx deployify login
              </code>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => handleCopy('pnpm dlx deployify login', 'login-cmd')}
                className="p-2 hover:bg-[var(--muted)]/20 rounded-xl transition-all text-[var(--muted-foreground)] hover:text-[var(--foreground)] active:scale-95"
                aria-label={copiedId === 'login-cmd' ? "Login command copied" : "Copy login command"}
              >
                {copiedId === 'login-cmd' ? (
                  <Check className="w-4 h-4 text-[var(--success)]" />
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
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--muted-foreground)] mb-8">
              Trusted by innovative teams
            </p>
            <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-8" role="list" aria-label="Trusted companies">
              {['ACME', 'GLOBEX', 'SOYLENT', 'INITECH', 'UMBRELLA'].map((logo) => (
                <motion.span
                  key={logo}
                  role="listitem"
                  aria-label={`${logo} logo`}
                  whileHover={{ scale: 1.1, opacity: 1, filter: 'grayscale(0%)' }}
                  className="text-xl md:text-2xl font-black tracking-tighter text-[var(--muted-foreground)] opacity-40 grayscale cursor-default transition-all duration-300"
                >
                  {logo}
                </motion.span>
              ))}
            </div>
          </motion.div>

          {/* The Method Section */}
          <div className="mt-40">
            <h2 className="text-3xl md:text-5xl font-bold text-center mb-24 bg-clip-text text-transparent bg-gradient-to-b from-[var(--foreground)] to-[var(--muted-foreground)]">
              The Deployify Method
            </h2>
            <TracingBeam className="px-6">
              <div className="max-w-2xl mx-auto antialiased pt-4 relative">
                {[
                  {
                    title: "Connect",
                    desc: "Sync your GitHub repository in one click. We'll automatically detect your framework and configuration.",
                    icon: <Github className="w-6 h-6 text-[var(--foreground)]" />,
                    badge: "Instant Integration"
                  },
                  {
                    title: "Push",
                    desc: "Every git push triggers a lightning-fast build on Google Cloud Build. No more manual deployment scripts.",
                    icon: <Rocket className="w-6 h-6 text-[var(--foreground)]" />,
                    badge: "Automated CI/CD"
                  },
                  {
                    title: "Preview",
                    desc: "Get a unique URL for every pull request. Share with your team for feedback before merging to production.",
                    icon: <Globe className="w-6 h-6 text-[var(--foreground)]" />,
                    badge: "Collaborate Faster"
                  },
                  {
                    title: "Scale",
                    desc: "Your app is deployed to Cloud Run, automatically scaling from zero to millions of requests with ease.",
                    icon: <Shield className="w-6 h-6 text-[var(--foreground)]" />,
                    badge: "Production Ready"
                  }
                ].map((step, i) => (
                  <div key={i} className="mb-20 relative group">
                    <motion.div
                      initial={{ opacity: 0.1, x: -20 }}
                      whileInView={{ opacity: 1, scale: 1.1, x: 0 }}
                      viewport={{ margin: "-100px" }}
                      transition={{ duration: 0.8 }}
                      className="absolute -left-12 md:-left-16 top-0 text-4xl font-black text-[var(--muted)]/30 tabular-nums transition-colors group-hover:text-[var(--foreground)]/30 group-hover:opacity-100"
                      aria-hidden="true"
                    >
                      0{i + 1}
                    </motion.div>
                    <div className="flex items-center gap-4 mb-4">
                       <motion.div
                         initial={{ scale: 0.8, opacity: 0.5 }}
                         whileInView={{ scale: 1, opacity: 1 }}
                         viewport={{ margin: "-100px" }}
                         className="p-3 rounded-2xl bg-[var(--card)] border border-[var(--border)] group-hover:border-[var(--muted)] transition-colors shadow-sm group-hover:shadow-md"
                       >
                         {step.icon}
                       </motion.div>
                       <h3 className="text-2xl font-bold group-hover:text-[var(--foreground)] transition-colors">{step.title}</h3>
                    </div>
                    <div className="text-lg text-[var(--muted-foreground)] leading-relaxed mb-4">
                      {step.desc}
                    </div>
                    <div className="p-1 rounded-2xl bg-[var(--card)] w-fit px-4 py-1 text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-widest border border-[var(--border)]">
                      {step.badge}
                    </div>
                  </div>
                ))}
              </div>
            </TracingBeam>
          </div>

          {/* Price Efficiency Section */}
          <div className="mt-40">
            <h2 className="text-3xl md:text-5xl font-bold text-center mb-16 bg-clip-text text-transparent bg-gradient-to-b from-[var(--foreground)] to-[var(--muted-foreground)]">
              Pay for what you use
            </h2>
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="p-6 rounded-[2rem] bg-[var(--card)] border border-[var(--border)] backdrop-blur-sm"
              >
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h3 className="text-lg font-bold mb-1 text-[var(--muted-foreground)]">Vercel / Netlify</h3>
                    <p className="text-xs text-[var(--muted-foreground)]/70 font-medium">Enterprise DX at a Premium</p>
                  </div>
                  <X className="w-5 h-5 text-[var(--error)]" />
                </div>
                <div className="space-y-4">
                  {[
                    { label: "Base Price", value: "$20/mo per user" },
                    { label: "Bandwidth", value: "$0.15 / GB" },
                    { label: "Serverless", value: "$0.60 / 1M GB-s" },
                    { label: "WAF", value: "Enterprise Only ($$$)" }
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between border-b border-[var(--border)] pb-2">
                      <span className="text-[var(--muted-foreground)]">{item.label}</span>
                      <span className="font-mono text-[var(--foreground)]">{item.value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="p-6 rounded-[2rem] bg-[var(--card)] border border-[var(--border)] backdrop-blur-sm relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 p-4">
                   <Badge className="animate-pulse uppercase tracking-tighter font-black">Save 80%</Badge>
                </div>
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h3 className="text-lg font-bold mb-1 text-[var(--foreground)]">Deployify + GCP</h3>
                    <p className="text-xs text-[var(--muted-foreground)] font-medium">Enterprise DX at Raw Cost</p>
                  </div>
                  <Check className="w-5 h-5 text-[var(--foreground)]" />
                </div>
                <div className="space-y-4">
                  {[
                    { label: "Base Price", value: "$0 / mo" },
                    { label: "Bandwidth", value: "$0.08 / GB (GCP Raw)" },
                    { label: "Serverless", value: "$0.01 / 1M reqs" },
                    { label: "WAF", value: "Included (Cloud Armor)" }
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between border-b border-[var(--border)] pb-2">
                      <span className="text-[var(--muted-foreground)]">{item.label}</span>
                      <span className="font-mono text-[var(--foreground)] font-bold">{item.value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>

          {/* Feature Bento Grid */}
          <div id="features" className="mt-40">
            <h2 className="text-3xl md:text-5xl font-bold text-center mb-16 bg-clip-text text-transparent bg-gradient-to-b from-[var(--foreground)] to-[var(--muted-foreground)]">
              Everything you need to scale
            </h2>
            <BentoGrid>
              <BentoGridItem
                title="Git-Push Deploys"
                description="Push to GitHub and your app is live. Automatic deployments on every commit."
                header={<div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-[var(--card-hover)] to-[var(--card)] border border-[var(--border)] items-center justify-center"><Zap className="w-12 h-12 text-[var(--foreground)]" /></div>}
                icon={<Rocket className="h-4 w-4 text-[var(--muted-foreground)]" />}
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
                      className="p-1.5 rounded-lg hover:bg-[var(--muted)]/20 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all active:scale-90"
                      aria-label={copiedId === 'preview-url' ? "Sample preview URL copied" : "Copy sample preview URL"}
                    >
                      {copiedId === 'preview-url' ? (
                        <Check className="w-3 h-3 text-[var(--foreground)]" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </motion.button>
                  </div>
                }
                header={<div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-[var(--card-hover)] to-[var(--card)] border border-[var(--border)] items-center justify-center"><Globe className="w-12 h-12 text-[var(--foreground)]" /></div>}
                icon={<Search className="h-4 w-4 text-[var(--muted-foreground)]" />}
              />
              <BentoGridItem
                title="Cloud Armor WAF"
                description="DDoS protection & security."
                header={<div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-[var(--card-hover)] to-[var(--card)] border border-[var(--border)] items-center justify-center"><Shield className="w-12 h-12 text-[var(--foreground)]" /></div>}
                icon={<Shield className="h-4 w-4 text-[var(--muted-foreground)]" />}
              />
              <BentoGridItem
                title="Full Resource Control"
                description="Choose CPU, Memory and Auto-scaling limits."
                header={<div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-[var(--card-hover)] to-[var(--card)] border border-[var(--border)] items-center justify-center"><Cpu className="w-12 h-12 text-[var(--foreground)]" /></div>}
                icon={<Cpu className="h-4 w-4 text-[var(--muted-foreground)]" />}
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
            <div className="p-8 rounded-3xl border border-[var(--border)] bg-[var(--card)] backdrop-blur-sm relative group">
              <h3 className="text-xl font-bold mb-6 text-center text-[var(--foreground)]">Ready to deploy?</h3>
              <div className="relative">
                <label htmlFor="repo-search" className="sr-only">Search your GitHub repositories</label>
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)] group-focus-within:text-[var(--foreground)] transition-colors" />
                <input
                  id="repo-search"
                  role="combobox"
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search your GitHub repositories..."
                  className="w-full bg-[var(--background)]/40 border border-[var(--border)] rounded-2xl py-4 pl-12 pr-12 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--foreground)]/40 focus:border-[var(--foreground)]/50 transition-all shadow-sm focus:shadow-md"
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
                    } else if (e.key === 'Escape') {
                      setSearchQuery('');
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
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { setSearchQuery(''); setSelectedIndex(-1); }}
                      className="p-1.5 rounded-lg hover:bg-[var(--muted)]/20 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all active:scale-95"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </motion.button>
                  ) : (
                    os && (
                      <div className="hidden sm:flex items-center gap-1 opacity-50 group-focus-within:opacity-100 transition-opacity">
                        <kbd className="h-5 select-none items-center gap-1 rounded border border-[var(--border)] bg-[var(--muted)]/20 px-1.5 font-mono text-[10px] font-bold text-[var(--muted-foreground)]">
                          {os === 'mac' ? '⌘' : 'Ctrl'}
                        </kbd>
                        <kbd className="h-5 select-none items-center gap-1 rounded border border-[var(--border)] bg-[var(--muted)]/20 px-1.5 font-mono text-[10px] font-bold text-[var(--muted-foreground)]">
                          K
                        </kbd>
                      </div>
                    )
                  )}
                </div>
                {searchQuery.trim() && (
                  <motion.div id="repo-results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} role="listbox" className="absolute top-full left-0 right-0 mt-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden z-20 shadow-2xl p-2">
                    {filteredRepos.length > 0 ? filteredRepos.map((repo, i) => (
                      <motion.div
                        key={repo}
                        id={`repo-option-${i}`}
                        role="option"
                        aria-selected={selectedIndex === i}
                        onMouseEnter={() => setSelectedIndex(i)}
                        onClick={() => { setSearchQuery(repo); setSelectedIndex(-1); }}
                        whileTap={{ scale: 0.98 }}
                        className={cn("px-4 py-2 rounded-xl cursor-pointer flex items-center gap-3 text-sm transition-colors", selectedIndex === i ? "bg-[var(--muted)]/20 text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]/10 hover:text-[var(--foreground)]")}
                      >
                        <Github className="w-4 h-4" /> {repo}
                      </motion.div>
                    )) : <div className="px-4 py-4 text-center text-sm text-[var(--muted-foreground)]">No results for &quot;{searchQuery}&quot;</div>}
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
            <h2 className="text-3xl md:text-5xl font-bold mb-8 bg-clip-text text-transparent bg-gradient-to-b from-[var(--foreground)] to-[var(--muted-foreground)]">
              Global Edge Network
            </h2>
            <p className="text-[var(--muted-foreground)] max-w-2xl mx-auto mb-12">
              Deploy your applications to over 100+ locations worldwide with automatic global load balancing and DDoS protection.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {[
                { name: 'Ultra-low Latency', icon: Zap },
                { name: 'Auto-scaling', icon: Rocket },
                { name: 'Anycast IP', icon: Globe },
                { name: 'Cloud Armor', icon: Shield },
              ].map((feat, i) => (
                <div key={feat.name} className="group relative p-8 rounded-[2rem] border border-[var(--border)] bg-[var(--card)] backdrop-blur-sm hover:border-[var(--muted)] transition-all duration-500 text-center overflow-hidden">
                  <div className="absolute top-4 right-6 text-xs font-black text-[var(--muted)]/30 group-hover:text-[var(--foreground)]/30 tabular-nums transition-colors" aria-hidden="true">0{i + 1}</div>
                  <feat.icon className="w-8 h-8 text-[var(--foreground)] mx-auto mb-4 group-hover:scale-110 transition-transform duration-500" aria-hidden="true" />
                  <span className="text-sm font-bold text-[var(--muted-foreground)] block">{feat.name}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </main>

      <BackgroundBeams />

      {/* Footer */}
      <footer className="relative z-10 border-t border-[var(--border)] py-12 mt-40">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <Link href="/" className="flex items-center justify-center gap-2 mb-4 group w-fit mx-auto" aria-label="Deployify Home">
            <Rocket className="w-6 h-6 text-[var(--foreground)] group-hover:rotate-12 transition-transform" />
            <span className="font-bold text-xl">Deployify</span>
          </Link>
          <p className="text-[var(--muted-foreground)] text-sm">
            © 2026 Deployify. Built for the modern developer.
          </p>
        </div>
      </footer>

      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            whileHover={{ y: -4, backgroundColor: 'var(--card-hover)' }}
            whileTap={{ scale: 0.9 }}
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 z-[100] p-4 rounded-full bg-[var(--card)] border border-[var(--border)] backdrop-blur-xl text-[var(--foreground)] shadow-lg transition-colors group"
            aria-label="Back to top"
          >
            <svg className="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true">
              <circle
                cx="50%"
                cy="50%"
                r="48%"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                className="opacity-20"
              />
              <motion.circle
                cx="50%"
                cy="50%"
                r="48%"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                style={{ pathLength: scrollYProgress }}
                className="opacity-100"
              />
            </svg>
            <ChevronUp className="w-6 h-6 relative z-10 group-hover:-translate-y-1 transition-transform" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
