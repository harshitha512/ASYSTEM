const r = require('express').Router();
const c = require('../controllers/permissionController');
const { authenticate } = require('../middleware/auth');
r.use(authenticate);
r.get('/', c.getAll);
r.post('/', c.create);
r.put('/:id/approve', c.approve);
r.put('/:id/reject', c.reject);
module.exports = r;
