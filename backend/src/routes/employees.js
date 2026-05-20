const r = require('express').Router();
const c = require('../controllers/employeeController');
const { authenticate } = require('../middleware/auth');

r.use(authenticate);

// Static routes MUST come before /:id
r.get('/template', c.downloadTemplate);
r.get('/export',   c.exportCSV);
r.post('/bulk-import', c.bulkImport);

// Dynamic routes
r.get('/',      c.getAll);
r.get('/:id',   c.getOne);
r.post('/',     c.create);
r.put('/:id',   c.update);
r.delete('/:id',c.remove);
r.post('/:id/register-face', c.registerFace);

module.exports = r;

