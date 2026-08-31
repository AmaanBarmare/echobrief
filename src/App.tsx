import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { CalendarProvider } from "@/contexts/CalendarContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PreMeetingNotification } from "@/components/dashboard/PreMeetingNotification";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Recordings from "./pages/Recordings";
import MeetingDetail from "./pages/MeetingDetail";
import Settings from "./pages/Settings";
import Calendar from "./pages/Calendar";
import ActionItems from "./pages/ActionItems";
import Contacts from "./pages/Contacts";
import Coaching from "./pages/Coaching";
import Chat from "./pages/Chat";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import Docs from "./pages/Docs";
import OAuthConsent from "./pages/OAuthConsent";
import NotFound from "./pages/NotFound";

// Cache server reads so revisiting a page renders instantly from cache and
// revalidates in the background, instead of refetching from scratch every mount.
// refetchOnWindowFocus is disabled to avoid a refetch storm on every tab focus.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 min — treat data as fresh; no refetch on remount within this window
      gcTime: 5 * 60_000, // keep unused cache 5 min before garbage-collecting
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppRoutes() {
  const { user, loading, isPasswordRecovery } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // If recovery flow, always show Auth page regardless of user state
  if (isPasswordRecovery) {
    return (
      <Routes>
        <Route path="*" element={<Auth />} />
      </Routes>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/oauth/consent" element={<OAuthConsent />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/recordings"
          element={
            <ProtectedRoute>
              <Recordings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/meeting/:id"
          element={
            <ProtectedRoute>
              <MeetingDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <Calendar />
            </ProtectedRoute>
          }
        />
        <Route
          path="/action-items"
          element={
            <ProtectedRoute>
              <ActionItems />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contacts"
          element={
            <ProtectedRoute>
              <Contacts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/coaching"
          element={
            <ProtectedRoute>
              <Coaching />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {/* Pre-meeting notifications */}
      {user && <PreMeetingNotification />}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ErrorBoundary>
          <BrowserRouter>
            <AuthProvider>
              <CalendarProvider>
                <AppRoutes />
              </CalendarProvider>
            </AuthProvider>
          </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
