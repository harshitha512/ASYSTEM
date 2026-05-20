import { useEffect, useState } from 'react';
import { Plus, Pencil, X, Clock } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const EMPTY = {
  shift_name:'', start_time:'', end_time:'',
  in_early:'', in_late:'', out_early:'', out_late:'',
  ot_window_start:'', ot_window_end:'', is_night_shift: false, is_active: true
};

const PRESETS = [
  { shift_name:'A', start_time:'06:00', end_time:'14:00', in_early:'05:45', in_late:'06:05', out_early:'14:05', out_late:'14:25', ot_window_start:'14:00', ot_window_end:'16:00', is_night_shift:false },
  { shift_name:'B', start_time:'14:00', end_time:'22:00', in_early:'13:45', in_late:'14:05', out_early:'22:05', out_late:'22:25', ot_window_start:'12:00', ot_window_end:'14:00', is_night_shift:false },
  { shift_name:'C', start_time:'22:00', end_time:'06:00', in_early:'21:45', in_late:'22:05', out_early:'06:05', out_late:'06:25', ot_window_start:'20:00', ot_window_end:'22:00', is_night_shift:true  },
  { shift_name:'G', start_time:'09:00', end_time:'17:30', in_early:'08:45', in_late:'09:05', out_early:'17:35', out_late:'17:55', ot_window_start:'17:30', ot_window_end:'19:30', is_night_shift:false },
];

export default function ShiftManagement() {
  const [shifts, setShifts] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/shifts').then(r => setShifts(r.data)).catch(() => toast.error('Load failed'));
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(EMPTY); setModal('create'); };
  const openEdit = (s) => { setForm({ ...s }); setModal(s); };
  const setPreset = (p) => setForm(f => ({ ...f, ...p, is_active: true }));

  const f = (key, label, type='time') => (
    <div key={key}>
      <label className="label">{label}</label>
      <input type={type} className="input text-sm" value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})} />
    </div>
  );

  const save = async () => {
    setSaving(true);
    try {
      if (modal === 'create') { await api.post('/shifts', form); toast.success('Shift created'); }
      else { await api.put(`/shifts/${modal.id}`, form); toast.success('Shift updated'); }
      setModal(null); load();
    } catch(e) { toast.error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Shift Management</h1>
        <button onClick={openCreate} className="btn-primary"><Plus size={16}/>Add Shift</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {shifts.map(s => (
          <div key={s.id} className="card border-l-4 border-primary space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Clock size={18} className="text-primary"/>
                </div>
                <div>
                  <p className="font-bold text-gray-900">{s.shift_name} Shift</p>
                  {s.is_night_shift ? <span className="badge-yellow text-[10px]">Night</span> : null}
                </div>
              </div>
              <button onClick={()=>openEdit(s)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <Pencil size={14}/>
              </button>
            </div>
            <div className="text-sm space-y-1 text-gray-600">
              <p><span className="font-medium">Duty:</span> {s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)}</p>
              <p><span className="font-medium">In window:</span> {s.in_early?.slice(0,5)} – {s.in_late?.slice(0,5)}</p>
              <p><span className="font-medium">Out window:</span> {s.out_early?.slice(0,5)} – {s.out_late?.slice(0,5)}</p>
              <p><span className="font-medium text-indigo-600">OT window:</span> {s.ot_window_start?.slice(0,5)} – {s.ot_window_end?.slice(0,5)}</p>
            </div>
            <span className={s.is_active ? 'badge-green' : 'badge-gray'}>{s.is_active ? 'Active' : 'Inactive'}</span>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
              <h2 className="font-semibold">{modal==='create'?'Add Shift':'Edit Shift'}</h2>
              <button onClick={()=>setModal(null)}><X size={16}/></button>
            </div>
            <div className="p-5 space-y-5">
              {modal==='create' && (
                <div>
                  <p className="label">Quick Preset</p>
                  <div className="flex gap-2 flex-wrap">
                    {PRESETS.map(p=>(
                      <button key={p.shift_name} onClick={()=>setPreset(p)} className="btn-secondary text-sm">{p.shift_name} Shift</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Shift Name</label>
                  <input className="input" value={form.shift_name} onChange={e=>setForm({...form,shift_name:e.target.value})} placeholder="A / B / C / G" />
                </div>
                {f('start_time','Duty Start')}
                {f('end_time','Duty End')}
                {f('in_early','Allowed In-Time (Early)')}
                {f('in_late','Allowed In-Time (Late)')}
                {f('out_early','Allowed Out-Time (Early)')}
                {f('out_late','Allowed Out-Time (Late)')}
                {f('ot_window_start','OT Window Start')}
                {f('ot_window_end','OT Window End')}
                <div className="flex items-center gap-2 mt-6">
                  <input type="checkbox" id="night" checked={!!form.is_night_shift} onChange={e=>setForm({...form,is_night_shift:e.target.checked})} className="w-4 h-4"/>
                  <label htmlFor="night" className="text-sm text-gray-700">Night Shift (crosses midnight)</label>
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <input type="checkbox" id="active" checked={!!form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})} className="w-4 h-4"/>
                  <label htmlFor="active" className="text-sm text-gray-700">Active</label>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t sticky bottom-0 bg-white">
              <button onClick={()=>setModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">{saving?'Saving...':'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
