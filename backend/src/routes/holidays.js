const r = require('express').Router();
const c = require('../controllers/holidayController');
const { authenticate } = require('../middleware/auth');
r.use(authenticate);
r.get('/', c.getAll);
r.post('/', c.create);
r.delete('/:id', c.remove);
module.exports = r;
