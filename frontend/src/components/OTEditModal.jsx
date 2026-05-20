import { useState } from 'react';
import { X, Clock } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';

export default function OTEditModal({ record, onClose, onSaved }) {
  const [manualOt, setManualOt] = useState(record.manual_ot ?? record.system_ot ?? 0);
  const [remarks, setRemarks] = useState(record.ot_remarks || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/attendance/ot-update', {
        attendance_id: record.id,
        manual_ot: parseFloat(manualOt),
        ot_remarks: remarks,
      });
      toast.success('OT updated successfully');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update OT');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-primary" />
            <h2 className="font-semibold text-gray-900">Edit Overtime</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-500 text-xs mb-1">Employee</p>
              <p className="font-medium text-gray-800">{record.full_name}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-500 text-xs mb-1">Date</p>
              <p className="font-medium text-gray-800">{record.log_date}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-500 text-xs mb-1">Total Hours</p>
              <p className="font-medium text-gray-800">{record.total_hours ?? '-'} hrs</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-500 text-xs mb-1">System OT</p>
              <p className="font-medium text-indigo-600">{record.system_ot ?? 0} hrs</p>
            </div>
          </div>

          <div>
            <label className="label">Manual OT Override (hours)</label>
            <input
              type="number" min="0" step="0.25"
              value={manualOt}
              onChange={(e) => setManualOt(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="label">Remarks</label>
            <textarea
              rows={3} value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Reason for manual override..."
              className="input resize-none"
            />
          </div>

          <div className="bg-indigo-50 rounded-xl p-3 text-sm text-indigo-700">
            <span className="font-semibold">Final OT: </span>
            {parseFloat(manualOt) || 0} hrs
            {parseFloat(manualOt) !== parseFloat(record.system_ot) && (
              <span className="ml-2 text-xs text-indigo-400">(manually overridden)</span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save OT'}
          </button>
        </div>
      </div>
    </div>
  );
}
