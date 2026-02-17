import { PageTransition } from '@/components/PageTransition';

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <PageTransition>
            {children}
        </PageTransition>
    );
}
