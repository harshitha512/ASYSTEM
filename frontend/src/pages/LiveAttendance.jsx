import { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { ScanFace, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const STATUS_IDLE     = 'idle';
const STATUS_SCANNING = 'scanning';
const STATUS_SUCCESS  = 'success';
const STATUS_ERROR    = 'error';

export default function LiveAttendance() {
  const webcamRef   = useRef(null);
  const intervalRef = useRef(null);
  const [status,   setStatus]   = useState(STATUS_IDLE);
  const [result,   setResult]   = useState(null);
  const [autoMode, setAutoMode] = useState(false);
  // Live clock — updates every second
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer); // cleanup on unmount
  }, []);

  // Cleanup auto-scan interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const scan = useCallback(async () => {
    const screenshot = webcamRef.current?.getScreenshot();
    if (!screenshot) return;
    setStatus(STATUS_SCANNING);
    try {
      const blob = await (await fetch(screenshot)).blob();
      const fd = new FormData();
      fd.append('image', blob, 'scan.jpg');
      const { data } = await api.post('/attendance/mark', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      setStatus(STATUS_SUCCESS);
      toast.success(
        `${data.action === 'CHECK_IN' ? '✅ Checked In' : '🚪 Checked Out'}: ${data.employee?.name}`
      );
    } catch (err) {
      const msg = err.response?.data?.error || 'Recognition failed';
      setResult({ error: msg });
      setStatus(STATUS_ERROR);
    }
    setTimeout(() => setStatus(STATUS_IDLE), 4000);
  }, []);

  const toggleAuto = () => {
    if (autoMode) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setAutoMode(false);
    } else {
      intervalRef.current = setInterval(scan, 5000);
      setAutoMode(true);
    }
  };

  const ResultBanner = () => {
    if (status === STATUS_SCANNING) return (
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 animate-pulse">
        <Loader size={20} className="text-blue-600 animate-spin" />
        <p className="text-blue-700 font-medium">Scanning face…</p>
      </div>
    );
    if (status === STATUS_SUCCESS && result) return (
      <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
        <CheckCircle size={22} className="text-green-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold text-green-800 text-lg">{result.employee?.name}</p>
          <p className="text-green-600 text-sm">{result.employee?.department}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className={`badge text-sm px-3 py-1 ${
              result.action === 'CHECK_IN' ? 'bg-green-200 text-green-800' : 'bg-purple-100 text-purple-800'}`}>
              {result.action === 'CHECK_IN' ? '✅ Checked IN' : '🚪 Checked OUT'}
            </span>
            <span className="text-xs text-gray-500">{format(new Date(), 'HH:mm:ss')}</span>
          </div>
        </div>
      </div>
    );
    if (status === STATUS_ERROR) return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
        <AlertCircle size={20} className="text-red-600" />
        <p className="text-red-700 font-medium">{result?.error || 'Face not recognized'}</p>
      </div>
    );
    return null;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Live Attendance</h1>
        <p className="text-gray-500 text-sm mt-0.5">Face the camera and press Scan or enable Auto mode</p>
      </div>

      <div className="card space-y-5">
        {/* Camera */}
        <div className="relative rounded-xl overflow-hidden bg-gray-900 aspect-video">
          <Webcam
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: 'user', width: 1280, height: 720 }}
            className="w-full h-full object-cover"
          />

          {/* Scanning overlay */}
          {status === STATUS_SCANNING && (
            <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center">
              <div className="w-64 h-72 border-4 border-blue-400 rounded-2xl animate-pulse" />
            </div>
          )}

          {/* Auto badge */}
          {autoMode && (
            <div className="absolute top-3 right-3 bg-green-500 text-white text-xs px-3 py-1 rounded-full animate-pulse font-medium">
              AUTO SCANNING
            </div>
          )}

          {/* Live Date/Time HUD — updates every second */}
          <div className="absolute bottom-3 left-3 bg-black/50 text-white text-xs px-3 py-1.5 rounded-lg font-mono">
            {format(clock, 'dd MMM yyyy · HH:mm:ss')}
          </div>
        </div>

        {/* Result */}
        <ResultBanner />

        {/* Controls */}
        <div className="flex gap-3">
          <button onClick={scan} disabled={status === STATUS_SCANNING}
            className="btn-primary flex-1 justify-center py-3 text-base">
            <ScanFace size={20} />
            {status === STATUS_SCANNING ? 'Scanning…' : 'Scan Face'}
          </button>
          <button onClick={toggleAuto}
            className={`btn flex-1 justify-center py-3 text-base ${
              autoMode ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'btn-secondary'}`}>
            {autoMode ? '⏹ Stop Auto' : '▶ Auto Mode'}
          </button>
        </div>

        <p className="text-xs text-center text-gray-400">
          Auto mode scans every 5 seconds. For liveness detection, integrate a depth/blink check in the face-service.
        </p>
      </div>
    </div>
  );
}
