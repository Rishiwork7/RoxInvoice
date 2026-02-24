'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading && !user && pathname.startsWith('/dashboard')) {
            router.push('/');
        }
        // Also redirect authenticated users away from login page
        if (!loading && user && pathname === '/') {
            router.push('/dashboard');
        }
    }, [user, loading, router, pathname]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    // Only render children if authenticated (for dashboard) or unauthenticated (for root)
    if ((!user && pathname.startsWith('/dashboard')) || (user && pathname === '/')) {
        return null;
    }

    return <>{children}</>;
}
