import { useEffect, useState } from 'react';
import { Users, UserCheck, UserX, Clock, AlertTriangle, ShieldOff, Bug, CalendarDays } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import api from '../api/axios';
import { format } from 'date-fns';

const StatCard = ({ icon: Icon, label, value, color, sub, warn }) => (
  <div className={`card flex items-center gap-4 ${warn ? 'border-red-200 bg-red-50' : ''}`}>
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
      <Icon size={20} className="text-white" />
    </div>
    <div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const COLORS = ['#22C55E', '#EF4444', '#F59E0B', '#6366F1'];

export default function Dashboard() {
  const [stats, setStats]       = useState(null);
  const [todayLogs, setTodayLogs] = useState([]);
  const [shiftData, setShiftData] = useState([]);
  const [loading, setLoading]   = useState(true);
  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    const load = async () => {
      try {
        const [sRes, logsRes, shiftRes] = await Promise.all([
          api.get('/attendance/dashboard'),
          api.get(`/attendance?date=${today}`),
          api.get(`/reports/shift-wise?date=${today}`),
        ]);
        setStats(sRes.data);
        setTodayLogs(logsRes.data);
        setShiftData(shiftRes.data.records || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );

  const pieData = stats ? [
    { name: 'Present', value: stats.present_today },
    { name: 'Absent',  value: stats.absent_today  },
    { name: 'Leave',   value: stats.leave_today   },
  ] : [];

  const shiftBarData = shiftData.map(s => ({
    shift: `${s.shift_name} Shift`,
    Present: parseInt(s.present) || 0,
    Absent:  parseInt(s.absent)  || 0,
    Leave:   parseInt(s.leave)   || 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5 flex items-center gap-1">
          <CalendarDays size={14} /> {format(new Date(), 'EEEE, MMMM d yyyy')}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Users}         label="Total Employees"   value={stats?.total_employees ?? 0}   color="bg-indigo-500" />
        <StatCard icon={UserCheck}     label="Present Today"     value={stats?.present_today ?? 0}     color="bg-green-500" />
        <StatCard icon={UserX}         label="Absent Today"      value={stats?.absent_today ?? 0}      color="bg-red-400" />
        <StatCard icon={Clock}         label="Leave Today"       value={stats?.leave_today ?? 0}       color="bg-amber-400" />
        <StatCard icon={Clock}         label="Total OT Today"    value={`${stats?.total_ot_today ?? 0}h`} color="bg-purple-500" />
        <StatCard icon={ShieldOff}     label="Blocked Employees" value={stats?.blocked_employees ?? 0} color="bg-gray-500"
          warn={stats?.blocked_employees > 0} sub={stats?.blocked_employees > 0 ? 'Require HR unblock' : ''} />
        <StatCard icon={Bug}           label="Punch Errors Today" value={stats?.punch_errors_today ?? 0} color="bg-orange-500"
          warn={stats?.punch_errors_today > 0} sub={stats?.punch_errors_today > 0 ? 'Needs HR review' : ''} />
        <StatCard icon={AlertTriangle} label="OT Limit (Monthly)" value="16 hrs" color="bg-teal-500" sub="Max per employee" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Shift-wise bar */}
        <div className="card lg:col-span-2">
          <h2 className="font-semibold text-gray-800 mb-4">Today's Shift-wise Attendance</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={shiftBarData} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="shift" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Present" fill="#22C55E" radius={[4,4,0,0]} />
              <Bar dataKey="Absent"  fill="#EF4444" radius={[4,4,0,0]} />
              <Bar dataKey="Leave"   fill="#F59E0B" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Today's Summary</h2>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({name,value})=>`${name}: ${value}`} labelLine={false}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent check-ins */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-3">Recent Check-ins Today</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-gray-400">
              <tr>
                {['Employee','Department','Shift','Check In','Late?','OT'].map(h=>(
                  <th key={h} className="text-left py-2 pr-6 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {todayLogs.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No attendance recorded yet today</td></tr>
              )}
              {todayLogs.slice(0, 10).map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="py-2 pr-6 font-medium text-gray-900">{log.full_name}</td>
                  <td className="py-2 pr-6 text-gray-500">{log.department || '—'}</td>
                  <td className="py-2 pr-6 text-gray-500">{log.shift_name || '—'}</td>
                  <td className="py-2 pr-6 font-mono text-green-600">
                    {log.check_in ? format(new Date(log.check_in), 'HH:mm') : '—'}
                  </td>
                  <td className="py-2 pr-6">
                    {log.is_late_in ? <span className="badge-yellow">Late</span> : <span className="badge-green">On Time</span>}
                  </td>
                  <td className="py-2 pr-6 text-indigo-600 font-semibold">{log.final_ot ?? 0}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alerts */}
      {(stats?.blocked_employees > 0 || stats?.punch_errors_today > 0) && (
        <div className="space-y-3">
          {stats.blocked_employees > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <ShieldOff size={18} className="text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">
                <span className="font-semibold">{stats.blocked_employees} employee(s)</span> blocked due to 8+ consecutive absences.
                Go to <strong>Attendance Logs → Unblock</strong> after HR approval.
              </p>
            </div>
          )}
          {stats.punch_errors_today > 0 && (
            <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl p-4">
              <Bug size={18} className="text-orange-600 flex-shrink-0" />
              <p className="text-sm text-orange-700">
                <span className="font-semibold">{stats.punch_errors_today} punch error(s)</span> detected today.
                Go to <strong>Attendance Logs → Punch Errors</strong> to resolve.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
