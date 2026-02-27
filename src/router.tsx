import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NavBar } from '@/components/NavBar';

// Lazy load pages for code splitting
const HomePage = lazy(() => import('@/pages/HomePage'));
const TooldropPage = lazy(() => import('@/pages/TooldropPage'));
const SchedulerPage = lazy(() => import('@/pages/SchedulerPage'));
const KaraokePage = lazy(() => import('@/pages/KaraokePage'));
const OriginalSongAnalyzerPage = lazy(() => import('@/App'));

// Loading fallback
function PageLoader() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-purple-300 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-purple-200">Loading...</p>
      </div>
    </div>
  );
}

// Root layout
function RootLayout() {
  return (
    <ErrorBoundary>
      <NavBar />
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  );
}

// Router configuration
const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <TooldropPage />,
      },
      {
        path: 'studio',
        element: <HomePage />,
      },
      {
        path: 'scheduler',
        element: <SchedulerPage />,
      },
      {
        path: 'scheduler/:dayNumber',
        element: <SchedulerPage />,
      },
      {
        path: 'karaoke',
        element: <KaraokePage />,
      },
      ...((import.meta as any).env.DEV
        ? [
          {
            path: 'original',
            element: <OriginalSongAnalyzerPage />,
          },
        ]
        : []),
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}

export default AppRouter;
