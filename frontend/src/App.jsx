import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import ShiftRotation from './pages/ShiftRotation';
import Permissions from './pages/Permissions';
import FaceRegister from './pages/FaceRegister';
import LiveAttendance from './pages/LiveAttendance';
import AttendanceTable from './pages/AttendanceTable';
import LeaveManagement from './pages/LeaveManagement';
import OTManagement from './pages/OTManagement';
import Holidays from './pages/Holidays';
import Reports from './pages/Reports';


export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard"        element={<Dashboard />} />
              <Route path="/employees"        element={<Employees />} />
              <Route path="/shift-rotation"   element={<ShiftRotation />} />
              <Route path="/permissions"      element={<Permissions />} />
              <Route path="/face-register"    element={<FaceRegister />} />
              <Route path="/attendance/live"  element={<LiveAttendance />} />
              <Route path="/attendance"       element={<AttendanceTable />} />
              <Route path="/leave"            element={<LeaveManagement />} />
              <Route path="/ot"               element={<OTManagement />} />
              <Route path="/holidays"         element={<Holidays />} />
              <Route path="/reports"          element={<Reports />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
