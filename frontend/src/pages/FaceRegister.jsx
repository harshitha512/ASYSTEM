import { useEffect, useState, useRef } from 'react';
import Webcam from 'react-webcam';
import { ScanFace, Search, CheckCircle, XCircle, Camera, RefreshCw, User, X, ArrowLeft } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const STATUS_FILTER_OPTIONS = [
  { value: '',           label: 'All Employees' },
  { value: 'registered', label: 'Face Registered' },
  { value: 'missing',    label: 'Face Missing' },
];

export default function FaceRegister() {
  const [employees,  setEmployees]  = useState([]);
  const [filtered,   setFiltered]   = useState([]);
  const [search,     setSearch]     = useState('');
  const [faceFilter, setFaceFilter] = useState('');
  // Inline registration modal
  const [regModal,   setRegModal]   = useState(null); // employee obj
  const [preview,    setPreview]    = useState(null);
  const [camReady,   setCamReady]   = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);
  const webcamRef = useRef(null);

  const load = () =>
    api.get('/employees?status=active').then(r => {
      setEmployees(r.data);
      setFiltered(r.data);
    });

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      employees.filter(e => {
        const matchSearch =
          e.full_name.toLowerCase().includes(q) ||
          e.employee_code?.toLowerCase().includes(q) ||
          e.department?.toLowerCase().includes(q);
        const matchFace =
          faceFilter === ''           ? true :
          faceFilter === 'registered' ? e.has_face > 0 :
          e.has_face === 0;
        return matchSearch && matchFace;
      })
    );
  }, [search, faceFilter, employees]);

  const registered = employees.filter(e => e.has_face > 0).length;
  const missing    = employees.filter(e => e.has_face === 0).length;
  const pct        = employees.length ? Math.round((registered / employees.length) * 100) : 0;

  // Open registration modal
  const openReg = (emp) => {
    setRegModal(emp);
    setPreview(null);
    setCamReady(false);
    setUploading(false);
    setRegSuccess(false);
  };

  const closeReg = () => {
    setRegModal(null);
    setPreview(null);
    setRegSuccess(false);
  };

  const capture = () => {
    const img = webcamRef.current?.getScreenshot();
    if (img) setPreview(img);
  };

  const register = async () => {
    if (!preview || !regModal) return;
    setUploading(true);
    try {
      const res  = await fetch(preview);
      const blob = await res.blob();
      const fd   = new FormData();
      fd.append('image', blob, 'face.jpg');
      await api.post(`/employees/${regModal.id}/register-face`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setRegSuccess(true);
      toast.success(`Face registered for ${regModal.full_name}`);
      load(); // refresh has_face status
    } catch(e) {
      toast.error(e.response?.data?.error || 'Registration failed');
    } finally { setUploading(false); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Face Register</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage biometric face registrations for all employees.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card flex items-center gap-4 py-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <User size={18} className="text-indigo-600"/>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{employees.length}</p>
            <p className="text-xs text-gray-500">Total Employees</p>
          </div>
        </div>
        <div className="card flex items-center gap-4 py-4">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle size={18} className="text-green-600"/>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-700">{registered}</p>
            <p className="text-xs text-gray-500">Face Registered</p>
          </div>
        </div>
        <div className="card flex items-center gap-4 py-4">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <XCircle size={18} className="text-red-500"/>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600">{missing}</p>
            <p className="text-xs text-gray-500">Face Missing</p>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="card py-3 px-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Overall Registration Progress</span>
          <span className="text-sm font-bold text-indigo-700">{pct}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-1">{registered} of {employees.length} employees registered</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input className="input pl-9 w-64 text-sm" placeholder="Search name, code, dept…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {STATUS_FILTER_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setFaceFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                faceFilter === opt.value ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} employees</span>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                {['Emp Code','Employee Name','Department','Designation','Shift','Face Status','Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">
                  <ScanFace size={32} className="mx-auto mb-2 text-gray-300"/>
                  No employees found
                </td></tr>
              )}
              {filtered.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-600">{emp.employee_code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{emp.full_name}</td>
                  <td className="px-4 py-3 text-gray-500">{emp.department || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{emp.designation || '—'}</td>
                  <td className="px-4 py-3">
                    {emp.shift_name
                      ? <span className="badge bg-indigo-100 text-indigo-700">{emp.shift_name}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {emp.has_face > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-lg">
                        <CheckCircle size={12}/> Registered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
                        <XCircle size={12}/> Not Registered
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openReg(emp)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        emp.has_face > 0
                          ? 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                      {emp.has_face > 0
                        ? <><RefreshCw size={12}/> Re-register</>
                        : <><Camera size={12}/> Register Face</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Inline Face Registration Modal ── */}
      {regModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="font-semibold text-gray-900">Register Face</h2>
                <p className="text-xs text-gray-500 mt-0.5">{regModal.full_name} · {regModal.employee_code}</p>
              </div>
              <button onClick={closeReg} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16}/></button>
            </div>

            <div className="p-5 space-y-4">
              {/* Tips */}
              <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-0.5">
                <p className="font-medium mb-1">📷 Tips for best results:</p>
                <p>• Face the light source — good lighting is essential</p>
                <p>• Keep only ONE face in frame</p>
                <p>• Look directly at camera, no glasses/hat if possible</p>
              </div>

              {/* Camera / Preview */}
              <div className="rounded-xl overflow-hidden bg-gray-900 aspect-video relative flex items-center justify-center">
                {!preview ? (
                  <>
                    <Webcam ref={webcamRef} screenshotFormat="image/jpeg"
                      videoConstraints={{ facingMode:'user', width:640, height:480 }}
                      onUserMedia={() => setCamReady(true)}
                      className="w-full h-full object-cover" />
                    {/* Face guide */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-44 h-56 border-2 border-white/40 rounded-full border-dashed" />
                    </div>
                    {!camReady && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                        <p className="text-white text-sm">Initializing camera…</p>
                      </div>
                    )}
                  </>
                ) : (
                  <img src={preview} alt="Captured" className="w-full h-full object-cover" />
                )}

                {/* Success overlay */}
                {regSuccess && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-900/70">
                    <CheckCircle size={48} className="text-green-300 mb-2"/>
                    <p className="text-white font-semibold">Registered!</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                {!preview ? (
                  <button onClick={capture} disabled={!camReady} className="btn-primary flex-1 justify-center py-2.5">
                    <Camera size={16}/> Capture Photo
                  </button>
                ) : (
                  <>
                    <button onClick={() => { setPreview(null); setRegSuccess(false); }} className="btn-secondary flex-1 justify-center">
                      <ArrowLeft size={15}/> Retake
                    </button>
                    {!regSuccess ? (
                      <button onClick={register} disabled={uploading} className="btn-primary flex-1 justify-center">
                        {uploading ? 'Registering…' : '✓ Register Face'}
                      </button>
                    ) : (
                      <button onClick={closeReg} className="btn-primary flex-1 justify-center bg-green-600 hover:bg-green-700">
                        Done ✓
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
