import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute() {
  const { admin } = useAuth();
  return admin ? <Outlet /> : <Navigate to="/login" replace />;
}
