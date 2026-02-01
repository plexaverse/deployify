'use client';

import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Rocket, Github, Zap, Shield, Globe, ArrowRight, Search, X } from 'lucide-react';

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="min-h-screen grid-bg">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border)] bg-[var(--glass-bg)] backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Rocket className="w-6 h-6 text-[var(--primary)]" />
              <span className="text-xl font-bold gradient-text">Deployify</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login" className="btn btn-ghost">
                Sign In
              </Link>
              <Link
                href="/api/auth/github"
                prefetch={false}
                className="btn btn-primary"
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
      <main className="pt-32 pb-20 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-5xl mx-auto text-center"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--card)] border border-[var(--border)] mb-8"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--success)]"></span>
            </span>
            <span className="text-sm text-[var(--muted-foreground)]">
              Deploy Next.js apps on your own GCP infrastructure
            </span>
          </motion.div>

          {/* Main Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
          >
            <span className="gradient-text">Deploy</span> like Vercel,
            <br />
            <span className="text-[var(--foreground)]">Pay like GCP</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-xl text-[var(--muted-foreground)] max-w-2xl mx-auto mb-10"
          >
            A self-hosted deployment platform that gives you Vercel&apos;s developer experience
            with the cost efficiency of Google Cloud Platform.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <Link
              href="/api/auth/github"
              prefetch={false}
              className="btn btn-primary text-lg px-8 py-4"
              aria-label="Connect your GitHub account to get started"
            >
              <Github className="w-5 h-5" />
              Connect GitHub
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="#features"
              className="btn btn-secondary text-lg px-8 py-4"
              aria-label="Learn more about Deployify features"
            >
              Learn More
            </Link>
          </motion.div>

          {/* Search Demo - Showcasing the Palette pattern */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-12 max-w-md mx-auto"
          >
            <label htmlFor="repo-search" className="block text-sm font-medium text-[var(--muted-foreground)] mb-2 text-left">
              Quick Repo Search
            </label>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] group-focus-within:text-[var(--primary)] transition-colors" />
              <input
                id="repo-search"
                type="text"
                placeholder="my-awesome-app..."
                className="input pl-10 pr-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-[var(--card-hover)] text-[var(--muted)] hover:text-[var(--foreground)] transition-all"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)] text-left">
              Example of the clearable search pattern for better micro-UX.
            </p>
          </motion.div>

          {/* Feature Cards */}
          <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
            <motion.div
              whileHover={{ y: -5, borderColor: 'var(--primary)' }}
              className="card"
            >
              <div className="w-12 h-12 rounded-lg bg-[var(--gradient-subtle)] flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-[var(--primary)]" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Git-Push Deploys</h3>
              <p className="text-[var(--muted-foreground)]">
                Push to GitHub and your app is live. Automatic deployments on every commit.
              </p>
            </motion.div>

            <motion.div
              whileHover={{ y: -5, borderColor: 'var(--primary)' }}
              className="card"
            >
              <div className="w-12 h-12 rounded-lg bg-[var(--gradient-subtle)] flex items-center justify-center mb-4">
                <Globe className="w-6 h-6 text-[var(--primary)]" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Preview Deployments</h3>
              <p className="text-[var(--muted-foreground)]">
                Every pull request gets its own unique URL for testing before merging.
              </p>
            </motion.div>

            <motion.div
              whileHover={{ y: -5, borderColor: 'var(--primary)' }}
              className="card"
            >
              <div className="w-12 h-12 rounded-lg bg-[var(--gradient-subtle)] flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-[var(--primary)]" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Cloud Armor WAF</h3>
              <p className="text-[var(--muted-foreground)]">
                Built-in DDoS protection and security with Google Cloud Armor.
              </p>
            </motion.div>
          </div>

          {/* Pricing Comparison */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-32 card max-w-3xl mx-auto relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--primary)] opacity-[0.03] blur-[80px] -mr-32 -mt-32"></div>

            <h2 className="text-2xl font-bold mb-10 text-center">Transparent Pricing</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-12 relative z-10">
              <div className="text-center sm:text-left p-6 rounded-xl bg-[var(--background)] border border-[var(--border)]">
                <h4 className="text-[var(--muted)] text-xs uppercase tracking-[0.2em] font-semibold mb-4">Vercel Pro</h4>
                <p className="text-4xl font-bold text-[var(--foreground)] mb-2">$20<span className="text-base text-[var(--muted)] font-normal ml-1">/mo</span></p>
                <p className="text-sm text-[var(--muted-foreground)]">+ Expensive bandwidth</p>
                <p className="text-sm text-[var(--muted-foreground)]">+ Seat-based pricing</p>
              </div>

              <div className="text-center sm:text-left p-6 rounded-xl bg-[var(--card-hover)] border border-[var(--primary)] shadow-[0_0_20px_rgba(99,102,241,0.1)] relative group">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[var(--primary)] text-[var(--primary-foreground)] text-[10px] font-bold rounded-full uppercase tracking-wider">
                  Recommended
                </div>
                <h4 className="text-[var(--primary)] text-xs uppercase tracking-[0.2em] font-semibold mb-4">Deployify + GCP</h4>
                <p className="text-4xl font-bold gradient-text mb-2">₹0-500<span className="text-base text-[var(--muted)] font-normal ml-1">/mo</span></p>
                <p className="text-sm text-[var(--muted-foreground)]">Pay only for raw egress</p>
                <p className="text-sm text-[var(--muted-foreground)]">Unlimited developers</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-[var(--primary)]" />
              <span className="font-semibold">Deployify</span>
            </div>
            <p className="text-sm text-[var(--muted-foreground)]">
              Built with ❤️ for developers who want control over their infrastructure.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
