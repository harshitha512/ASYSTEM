import { useEffect, useState, useRef } from 'react';
import { RefreshCw, Play, CheckCircle, XCircle, Plus, Trash2, AlertTriangle, X, Download, Upload, FileSpreadsheet, ChevronRight } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { format, nextSaturday } from 'date-fns';

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const ROTATION_RULE = [
  { from: 'A', to: 'C', color: 'bg-blue-100 text-blue-700' },
  { from: 'B', to: 'A', color: 'bg-green-100 text-green-700' },
  { from: 'C', to: 'B', color: 'bg-purple-100 text-purple-700' },
  { from: 'G', to: 'Permanent', color: 'bg-gray-100 text-gray-600' },
];

export default function ShiftRotation() {
  const [tab, setTab]           = useState('schedule');
  const [rotations, setRotations] = useState([]);
  const [restrictions, setRestrictions] = useState([]);
  const [shifts, setShifts]     = useState([]);
  const [generating, setGenerating] = useState(false);
  const [rotDate, setRotDate]   = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [deptForm, setDeptForm] = useState({ department:'', excluded_shift:'C' });

  // Download → Edit → Re-upload workflow
  const [downloading, setDownloading]     = useState(false);
  const [uploadedFile, setUploadedFile]   = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploading, setUploading]         = useState(false);
  const [applying, setApplying]           = useState(false);
  const [workflowStep, setWorkflowStep]   = useState(null); // null | 'downloaded' | 'preview'
  const [rejectModal, setRejectModal]     = useState(null);
  const [rejectReason, setRejectReason]   = useState('');
  const [approveModal, setApproveModal]   = useState(null);
  const uploadRef = useRef();

  const load = () => {
    const p = new URLSearchParams();
    if (statusFilter) p.set('status', statusFilter);
    api.get(`/shift-rotation/rotation?${p}`).then(r => setRotations(r.data));
    api.get('/shift-rotation/dept-restrictions').then(r => setRestrictions(r.data));
    api.get('/shifts').then(r => setShifts(r.data));
  };

  useEffect(() => { load(); }, [statusFilter]);

  const generate = async () => {
    if (!confirm(`Generate weekly rotation schedule for ${rotDate || 'next Saturday'}? This creates pending approvals for all eligible employees.`)) return;
    setGenerating(true);
    try {
      const { data } = await api.post('/shift-rotation/rotation/generate', {
        rotation_date: rotDate || format(nextSaturday(new Date()), 'yyyy-MM-dd')
      });
      toast.success(`Generated ${data.total} rotation records`);
      load();
    } catch(e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setGenerating(false); }
  };



  const addRestriction = async () => {
    if (!deptForm.department) return toast.error('Enter department name');
    try {
      await api.post('/shift-rotation/dept-restrictions', deptForm);
      toast.success('Restriction added'); load();
      setDeptForm({ department:'', excluded_shift:'C' });
    } catch(e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const removeRestriction = async (id) => {
    await api.delete(`/shift-rotation/dept-restrictions/${id}`);
    toast.success('Removed'); load();
  };

  // ── Download current rotation as Excel for HR editing
  const downloadExcel = async () => {
    setDownloading(true);
    try {
      const params = rotDate ? `?rotation_date=${rotDate}` : '';
      const res = await api.get(`/shift-rotation/export-excel${params}`, { responseType: 'blob' });
      const href = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = href;
      a.download = `shift_rotation_${rotDate || format(nextSaturday(new Date()), 'yyyy-MM-dd')}.xlsx`;
      a.click();
      URL.revokeObjectURL(href);
      toast.success('Excel downloaded — make edits then re-upload below');
      setWorkflowStep('downloaded');
    } catch(e) { toast.error('Download failed'); }
    finally { setDownloading(false); }
  };

  // ── HR picks the edited Excel — get a preview before applying
  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadedFile(file);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/shift-rotation/preview-excel', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadPreview(data);
      setWorkflowStep('preview');
    } catch(e) {
      toast.error(e.response?.data?.error || 'Preview failed');
      setUploadedFile(null);
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  // ── Apply the edited Excel then generate rotation
  const applyAndGenerate = async () => {
    if (!uploadedFile) return;
    setApplying(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadedFile);
      if (rotDate) fd.append('rotation_date', rotDate);
      const { data } = await api.post('/shift-rotation/apply-excel', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`Applied HR edits & generated ${data.total} rotation records`);
      setWorkflowStep(null);
      setUploadedFile(null);
      setUploadPreview(null);
      load();
    } catch(e) { toast.error(e.response?.data?.error || 'Apply failed'); }
    finally { setApplying(false); }
  };

  const cancelUpload = () => {
    setUploadedFile(null);
    setUploadPreview(null);
    setWorkflowStep(null);
    if (uploadRef.current) uploadRef.current.value = '';
  };

  // ── Per-row approve with modal
  const approve = async () => {
    if (!approveModal) return;
    try {
      await api.put(`/shift-rotation/rotation/${approveModal.id}/approve`);
      toast.success('Approved & applied');
      setApproveModal(null);
      load();
    } catch(e) { toast.error('Approval failed'); }
  };

  // ── Per-row reject with modal
  const rejectConfirm = async () => {
    if (!rejectModal) return;
    try {
      await api.put(`/shift-rotation/rotation/${rejectModal.id}/reject`, { rejection_reason: rejectReason });
      toast.success('Rejected');
      setRejectModal(null); setRejectReason('');
      load();
    } catch(e) { toast.error('Rejection failed'); }
  };

  const pendingCount = rotations.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shift Rotation</h1>
          <p className="text-sm text-gray-500 mt-0.5">Weekly rotation runs every Saturday. HR must approve before applying.</p>
        </div>
      </div>

      {/* Rotation rules info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ROTATION_RULE.map(r => (
          <div key={r.from} className="card py-3 text-center">
            <p className="text-xs text-gray-400 mb-1">Shift {r.from}</p>
            <div className="flex items-center justify-center gap-2">
              <span className={`badge ${r.color} text-sm px-3 py-1`}>{r.from}</span>
              {r.to !== 'Permanent' && <span className="text-gray-400">→</span>}
              <span className={`badge ${r.color} text-sm px-3 py-1`}>{r.to}</span>
            </div>
            {r.from === 'G' && <p className="text-xs text-gray-400 mt-1">No rotation</p>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { key:'schedule',     label:`Rotation Schedule${pendingCount>0?` (${pendingCount} pending)`:''}` },
          { key:'restrictions', label:'Dept Restrictions' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab===t.key?'border-primary text-primary':'border-transparent text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ROTATION SCHEDULE ── */}
      {tab === 'schedule' && <>
        {/* ── Step 1: Date + Action toolbar ── */}
        <div className="card py-3 px-4 space-y-3">
          {/* Row 1: date + buttons + filter */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label text-xs">Rotation Date (Saturday)</label>
              <input type="date" className="input w-auto text-sm" value={rotDate} onChange={e=>setRotDate(e.target.value)} />
            </div>

            {/* Workflow steps pill */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 text-xs font-medium text-gray-500">
              <span className={`px-3 py-1.5 rounded-lg transition ${!workflowStep ? 'bg-white text-gray-800 shadow-sm' : ''}`}>① Set Date</span>
              <ChevronRight size={12} className="text-gray-300"/>
              <span className={`px-3 py-1.5 rounded-lg transition ${workflowStep === 'downloaded' ? 'bg-white text-gray-800 shadow-sm' : ''}`}>② Download & Edit</span>
              <ChevronRight size={12} className="text-gray-300"/>
              <span className={`px-3 py-1.5 rounded-lg transition ${workflowStep === 'preview' ? 'bg-white text-amber-700 shadow-sm' : ''}`}>③ Re-upload</span>
              <ChevronRight size={12} className="text-gray-300"/>
              <span className="px-3 py-1.5 rounded-lg">④ Generate</span>
            </div>

            <select className="input w-auto text-sm ml-auto" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="applied">Applied</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Row 2: action buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
            {/* Download Excel */}
            <button onClick={downloadExcel} disabled={downloading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 disabled:opacity-50 transition">
              <FileSpreadsheet size={15}/>{downloading ? 'Downloading...' : 'Download Excel to Edit'}
            </button>

            {/* Re-upload edited Excel */}
            <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer transition
              ${workflowStep === 'downloaded'
                ? 'border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}>
              <Upload size={15}/>{uploading ? 'Reading...' : uploadedFile ? uploadedFile.name : 'Re-upload Edited Excel'}
              <input ref={uploadRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} disabled={uploading}/>
            </label>

            {uploadedFile && workflowStep !== 'preview' && (
              <button onClick={cancelUpload} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"><X size={14}/></button>
            )}

            <span className="text-gray-300 text-lg">|</span>

            {/* Generate (direct, no Excel) */}
            <button onClick={generate} disabled={generating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition">
              <Play size={15}/>{generating ? 'Generating...' : 'Generate Without Changes'}
            </button>
          </div>
        </div>

        {/* ── Step 3: Preview panel after re-upload ── */}
        {workflowStep === 'preview' && uploadPreview && (
          <div className="border border-amber-300 bg-amber-50 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-amber-200">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={16} className="text-amber-600"/>
                <span className="font-semibold text-amber-800">Preview HR Edits — {uploadedFile?.name}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-amber-700">
                <span className="bg-amber-200 rounded px-2 py-0.5">{uploadPreview.changed_count ?? 0} changes</span>
                <span className="text-amber-400">of {uploadPreview.total ?? 0} rows</span>
              </div>
            </div>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-amber-100 text-amber-700 uppercase">
                  <tr>{['Employee','Dept','Current Shift','New Shift (HR Edit)','Effective Date','Changed?'].map(h=>(
                    <th key={h} className="px-4 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {(uploadPreview.rows || []).map((row, i) => (
                    <tr key={i} className={row.changed ? 'bg-yellow-50' : 'bg-white'}>
                      <td className="px-4 py-2 font-medium">{row.full_name}<br/><span className="text-gray-400">{row.employee_code}</span></td>
                      <td className="px-4 py-2 text-gray-500">{row.department}</td>
                      <td className="px-4 py-2"><span className="badge bg-indigo-100 text-indigo-700">{row.current_shift}</span></td>
                      <td className="px-4 py-2">
                        <span className={`badge ${row.changed ? 'bg-amber-200 text-amber-800 font-bold' : 'bg-gray-100 text-gray-600'}`}>
                          {row.next_shift}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{row.rotation_date}</td>
                      <td className="px-4 py-2">
                        {row.changed
                          ? <span className="text-amber-700 font-semibold">✏ Modified</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-amber-200 bg-amber-50">
              <button onClick={cancelUpload} className="btn-secondary text-sm"><X size={13}/>Discard & Re-upload</button>
              <button onClick={applyAndGenerate} disabled={applying}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition">
                <Play size={15}/>{applying ? 'Applying & Generating...' : 'Apply Edits & Generate Rotation'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-3">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0"/>
          <div>
            <p className="font-semibold">Saturday HR Approval Required</p>
            <p className="text-xs mt-0.5">Every Saturday, generate the rotation and approve/reject each employee's shift change. Approved changes apply immediately.</p>
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{['Employee','Dept','Current Shift','Next Shift','Rotation Date','Type','Status','HR Action'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {rotations.length===0 && <tr><td colSpan={8} className="text-center py-10 text-gray-400">No rotation records — click Generate to create this week's schedule</td></tr>}
                {rotations.map(r=>(
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.full_name}<br/><span className="text-xs text-gray-400">{r.employee_code}</span></td>
                    <td className="px-4 py-3 text-gray-500">{r.department}</td>
                    <td className="px-4 py-3"><span className="badge bg-indigo-100 text-indigo-700">{r.current_shift}</span></td>
                    <td className="px-4 py-3"><span className="badge bg-amber-100 text-amber-700">{r.next_shift||'—'}</span></td>
                    <td className="px-4 py-3 text-gray-600">{r.rotation_date}</td>
                    <td className="px-4 py-3"><span className={r.is_auto?'badge bg-blue-100 text-blue-700':'badge bg-purple-100 text-purple-700'}>{r.is_auto?'Auto':'Manual'}</span></td>
                    <td className="px-4 py-3">
                      {r.status==='pending'  && <span className="badge-yellow">Pending</span>}
                      {r.status==='approved' && <span className="badge-green">Approved</span>}
                      {r.status==='applied'  && <span className="badge-green">Applied ✓</span>}
                      {r.status==='rejected' && <span className="badge-red">Rejected</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.status==='pending' && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={()=>setApproveModal({ id:r.id, full_name:r.full_name, next_shift:r.next_shift, rotation_date:r.rotation_date })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition">
                            <CheckCircle size={12}/> Approve
                          </button>
                          <button
                            onClick={()=>{ setRejectModal({ id:r.id, full_name:r.full_name, current_shift:r.current_shift, next_shift:r.next_shift }); setRejectReason(''); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition">
                            <XCircle size={12}/> Reject
                          </button>
                        </div>
                      )}
                      {r.rejection_reason && <p className="text-xs text-red-500 mt-1 max-w-xs">{r.rejection_reason}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>}

      {/* ── DEPT RESTRICTIONS ── */}
      {tab === 'restrictions' && (
        <div className="max-w-xl space-y-5">
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-800">Add Department Restriction</h2>
            <p className="text-sm text-gray-500">Departments listed here will NOT be rotated into the specified shift.</p>
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-40">
                <label className="label">Department Name</label>
                <input className="input" placeholder="e.g. HR, Finance" value={deptForm.department}
                  onChange={e=>setDeptForm({...deptForm,department:e.target.value})} />
              </div>
              <div>
                <label className="label">Excluded Shift</label>
                <select className="input" value={deptForm.excluded_shift}
                  onChange={e=>setDeptForm({...deptForm,excluded_shift:e.target.value})}>
                  {shifts.map(s=><option key={s.id} value={s.shift_name}>{s.shift_name} Shift</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={addRestriction} className="btn-primary"><Plus size={15}/>Add</button>
              </div>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b font-semibold text-gray-800">Current Restrictions</div>
            {restrictions.length===0
              ? <p className="text-center py-8 text-gray-400">No restrictions set</p>
              : <ul className="divide-y">
                  {restrictions.map(r=>(
                    <li key={r.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{r.department}</p>
                        <p className="text-xs text-gray-500">Cannot be assigned to <span className="font-semibold text-red-600">{r.excluded_shift} Shift</span></p>
                      </div>
                      <button onClick={()=>removeRestriction(r.id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={14}/></button>
                    </li>
                  ))}
                </ul>
            }
          </div>
        </div>
      )}
      {/* Approve Confirmation Modal */}
      {approveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircle size={18} className="text-green-600"/> Approve Rotation
              </h2>
              <button onClick={()=>setApproveModal(null)}><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">Approve shift rotation for <span className="font-semibold text-gray-900">{approveModal.full_name}</span>?</p>
              <div className="bg-green-50 rounded-xl p-3 text-sm space-y-1">
                <p><span className="text-gray-500">New Shift:</span> <span className="font-medium text-green-700">{approveModal.next_shift}</span></p>
                <p><span className="text-gray-500">Effective:</span> <span className="font-medium text-gray-800">{approveModal.rotation_date}</span></p>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t">
              <button onClick={()=>setApproveModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={approve}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition">
                <CheckCircle size={15}/> Confirm Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject with Reason Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <XCircle size={18} className="text-red-500"/> Reject Rotation
              </h2>
              <button onClick={()=>setRejectModal(null)}><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">Rejecting rotation for <span className="font-semibold text-gray-900">{rejectModal.full_name}</span>.</p>
              <div className="bg-red-50 rounded-xl p-3 text-sm">
                <span className="badge bg-indigo-100 text-indigo-700">{rejectModal.current_shift}</span>
                <span className="text-gray-400 mx-2">→</span>
                <span className="badge bg-amber-100 text-amber-700">{rejectModal.next_shift}</span>
              </div>
              <div>
                <label className="label">Rejection Reason <span className="text-red-500">*</span></label>
                <textarea rows={3} className="input resize-none" value={rejectReason}
                  onChange={e=>setRejectReason(e.target.value)}
                  placeholder="Provide a reason..." autoFocus/>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t">
              <button onClick={()=>setRejectModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={rejectConfirm} disabled={!rejectReason.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                <XCircle size={15}/> Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
