sed -i 's/text-base md:text-lg/text-sm md:text-base/g' src/components/LandingPage.tsx
sed -i 's/text-lg text-\[var(--muted-foreground)\]/text-base text-\[var(--muted-foreground)\]/g' src/components/LandingPage.tsx src/app/billing/page.tsx
sed -i 's/text-\[var(--muted-foreground)\] text-lg/text-\[var(--muted-foreground)\] text-base/g' src/components/OnboardingGuide.tsx src/app/\(marketing\)/login/page.tsx src/app/error.tsx src/app/not-found.tsx
