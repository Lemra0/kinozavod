import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/context.js';
import { Loading } from '../components/States.jsx';

export function AdminGuard({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user)
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}
