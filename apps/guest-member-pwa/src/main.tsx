import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link, Outlet, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantProvider, useTenant, AuthProvider, useAuth } from '@badminton/ui-shared';
import LoginScreen from './components/LoginScreen';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import BranchSelect from './components/BranchSelect';
import BranchDashboard from './components/BranchDashboard';
import BranchAbout from './components/BranchAbout';
import CourtBooking from './components/CourtBooking';
import BookingPay from './components/BookingPay';
import BookingHistory from './components/BookingHistory';
import BookingConfirmation from './components/BookingConfirmation';
import { Calendar, User, LogOut, ArrowRight, Activity, MapPin, Phone, RefreshCw } from 'lucide-react';
import './index.css';

// Register custom minimal Service Worker for PWA installability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Service Worker registered successfully, scope:', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}

// Initialize TanStack Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

/**
 * Shared Layout wrapper containing navbar, footer, and PwaInstallPrompt.
 */
function Layout() {
  const { tenant } = useTenant();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header / Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3 group">
            {tenant?.logo ? (
              <img src={tenant.logo} alt={tenant.appName} className="h-8 w-auto object-contain rounded" />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 flex items-center justify-center text-[var(--brand-primary)]">
                <span className="font-extrabold text-sm">{tenant?.appName?.[0]?.toUpperCase()}</span>
              </div>
            )}
            <span className="font-bold text-lg tracking-wider uppercase font-outfit group-hover:text-[var(--brand-primary)] transition-colors">
              {tenant?.appName}
            </span>
          </Link>

          <div className="flex items-center space-x-4">
            <Link to="/bookings/my" className="text-xs text-gray-400 hover:text-white transition-colors font-semibold" id="nav-my-bookings-btn">
              My Bookings
            </Link>
            <div className="flex items-center space-x-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/5 text-xs text-gray-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span>{user?.roles?.join(', ') || 'member'}</span>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-full bg-white/5 hover:bg-red-950/30 text-gray-400 hover:text-red-400 border border-white/5 transition-all"
              title="Logout"
              id="logout-btn"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Shared Page Outlet */}
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-white/5 bg-gray-950 text-center text-xs text-gray-500 font-medium">
        &copy; 2026 {tenant?.name}. Powered by Whitelabel Badminton Platform.
      </footer>
      <PwaInstallPrompt />
    </div>
  );
}

/**
 * Main dashboard screen loaded when authenticated.
 */
function MainDashboard() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleBookNow = () => {
    const savedBranch = localStorage.getItem('selected_branch_id');
    if (savedBranch) {
      navigate(`/branches/${savedBranch}`);
    } else {
      navigate('/branches');
    }
  };

  return (
    <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Hero content */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-tr from-gray-900 to-gray-950 p-8 border border-white/5 shadow-2xl">
        <div className="absolute right-0 bottom-0 translate-x-1/4 translate-y-1/4 opacity-10">
          <Activity className="h-96 w-96 text-[var(--brand-primary)]" />
        </div>
        
        <div className="relative max-w-lg space-y-4">
          <div className="inline-flex items-center space-x-1 bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 text-[var(--brand-primary)] px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider font-outfit">
            <MapPin className="h-3.5 w-3.5" />
            <span>{tenant?.name}</span>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight font-outfit md:text-5xl">
            Welcome back to <span className="text-[var(--brand-primary)]">{tenant?.appName}</span>
          </h2>
          <p className="text-gray-400 text-sm md:text-base leading-relaxed font-medium">
            Coimbatore's premium court booking platform. Find slots, book courts, and manage your matches.
          </p>
          <div className="pt-2 flex flex-wrap gap-4">
            <button
              onClick={handleBookNow}
              className="py-3 px-6 rounded-2xl bg-[var(--brand-primary)] hover:opacity-95 text-white font-semibold flex items-center space-x-2 transition-all shadow-lg shadow-[var(--brand-primary)]/20"
              id="book-court-dashboard-btn"
            >
              <span>Book Court Now</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate('/bookings/my')}
              className="py-3 px-6 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 font-semibold transition-all"
              id="view-my-bookings-btn"
            >
              View My Bookings
            </button>
          </div>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-4">
          <div className="h-10 w-10 bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 rounded-xl flex items-center justify-center text-[var(--brand-primary)]">
            <Calendar className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-bold font-outfit text-white">Upcoming Slots</h3>
          <p className="text-xs text-gray-400">
            No pre-scheduled matches today. Click "Book Court Now" to search for court times.
          </p>
        </div>

        <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-4">
          <div className="h-10 w-10 bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 rounded-xl flex items-center justify-center text-[var(--brand-primary)]">
            <User className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-bold font-outfit text-white">Profile Details</h3>
          <div className="text-xs text-gray-400 space-y-2 font-mono">
            <div className="flex justify-between">
              <span>User:</span>
              <span className="text-gray-200">{user?.userId || user?.id}</span>
            </div>
            <div className="flex justify-between">
              <span>Phone:</span>
              <span className="text-gray-200">{user?.phone || 'Not Verified'}</span>
            </div>
            <div className="flex justify-between">
              <span>Role Scope:</span>
              <span className="text-[var(--brand-primary)]">{user?.roles?.[0] || 'member'}</span>
            </div>
          </div>
        </div>

        <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-4">
          <div className="h-10 w-10 bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 rounded-xl flex items-center justify-center text-[var(--brand-primary)]">
            <Phone className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-bold font-outfit text-white">Support & Info</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            If you have any feedback or require front desk support, reach out using the in-app chat or call our Coimbatore venue manager directly.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Route protection wrapper. Redirects unauthenticated users to /login.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

/**
 * App Router structure.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route 
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        } 
      >
        <Route path="/" element={<MainDashboard />} />
        <Route path="/branches" element={<BranchSelect />} />
        <Route path="/branches/:branchId" element={<BranchDashboard />} />
        <Route path="/branches/:branchId/about" element={<BranchAbout />} />
        <Route path="/branches/:branchId/book/:poolId" element={<CourtBooking />} />
        <Route path="/bookings/:bookingId/pay" element={<BookingPay />} />
        <Route path="/bookings/:bookingId/confirmation" element={<BookingConfirmation />} />
        <Route path="/bookings/my" element={<BookingHistory />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// WHY: Entry point wrapping Router, TanStack Query, and Context Providers.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </TenantProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
