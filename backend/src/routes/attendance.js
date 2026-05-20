const r = require('express').Router();
const c = require('../controllers/attendanceController');
const ot = require('../controllers/otController');
const { authenticate } = require('../middleware/auth');

r.post('/mark', c.markAttendance);
r.get('/dashboard', authenticate, c.getDashboardStats);
r.get('/', authenticate, c.getAttendance);
r.post('/hr-mark', authenticate, c.hrManualMark);
r.post('/unblock', authenticate, c.unblockEmployee);
r.get('/punch-errors', authenticate, c.getPunchErrors);
r.put('/punch-errors/:id/resolve', authenticate, c.resolvePunchError);
r.put('/ot-update', authenticate, ot.updateOT);
r.post('/ot-finalize', authenticate, ot.finalizeMonthOT);
r.get('/ot-carryforward', authenticate, ot.getCarryForward);
r.get('/ot-summary', authenticate, ot.getMonthlyOTSummary);

module.exports = r;
