import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/context.js';
import { Loading } from '../components/States.jsx';

/** Restricts a route to cashiers and admins. */
export function StaffGuard({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading />;
  if (!user)
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (user.role !== 'cashier' && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}
