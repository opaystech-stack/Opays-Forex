import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import LandingPage from './pages/LandingPage';
import Auth from './pages/Auth';
import AppShell from './pages/AppShell';
import Dashboard from './pages/Dashboard';
import AgencyAdmin from './pages/AgencyAdmin';
import SuperAdmin from './pages/SuperAdmin';
import Employees from './pages/Employees';
import Transfers from './pages/Transfers';
import Subscriptions from './pages/Subscriptions';
import Tickets from './pages/Tickets';
import RemoteOrders from './pages/RemoteOrders';

function Loading() {
  return (
    <div className="ofx-loading-center">
      <div className="ofx-spinner" />
      <span>Chargement...</span>
    </div>
  );
}

function RootRedirect() {
  const { user, authChecked } = useApp();
  const location = useLocation();
  if (!authChecked) return <Loading />;
  if (user) return <Navigate to="/app" replace state={{ from: location }} />;
  return <LandingPage />;
}

function ProtectedRoute({ children }) {
  const { user, authChecked } = useApp();
  if (!authChecked) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AuthRoute({ children }) {
  const { user, authChecked } = useApp();
  if (!authChecked) return <Loading />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<AuthRoute><Auth /></AuthRoute>} />
      <Route path="/register" element={<AuthRoute><Auth /></AuthRoute>} />
      <Route path="/app/*" element={<ProtectedRoute><AppShell /></ProtectedRoute>} />
      <Route path="/app/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/app/admin" element={<ProtectedRoute><AgencyAdmin /></ProtectedRoute>} />
      <Route path="/admin-plateforme" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />
      <Route path="/app/employees" element={<ProtectedRoute><Employees /></ProtectedRoute>} />
      <Route path="/app/transfers" element={<ProtectedRoute><Transfers /></ProtectedRoute>} />
      <Route path="/app/subscriptions" element={<ProtectedRoute><Subscriptions /></ProtectedRoute>} />
      <Route path="/app/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
      <Route path="/app/remote-orders" element={<ProtectedRoute><RemoteOrders /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}
