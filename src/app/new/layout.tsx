import { PageTransition } from '@/components/PageTransition';

export default function NewProjectLayout({
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
