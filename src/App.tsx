import { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { SnowfallCanvas } from './components/SnowfallCanvas.tsx';
import { testConnection } from './lib/firebase.ts';
import { AdminDashboard } from './pages/AdminDashboard.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { VerifyPage } from './pages/VerifyPage.tsx';

export default function App() {
  const [pathname, setPathname] = useState<string>(() => window.location.pathname);

  useEffect(() => {
    void testConnection();
    const onPopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (nextPath: string) => {
    if (nextPath !== window.location.pathname + window.location.search) {
      window.history.pushState({}, '', nextPath);
      setPathname(new URL(nextPath, window.location.origin).pathname);
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  return (
    <ErrorBoundary>
      {pathname.startsWith('/admin') ? (
        <AdminDashboard onNavigate={navigate} />
      ) : pathname.startsWith('/verify') ? (
        <VerifyPage onNavigate={navigate} />
      ) : (
        <>
          <SnowfallCanvas />
          <LandingPage onNavigate={navigate} />
        </>
      )}
    </ErrorBoundary>
  );
}
