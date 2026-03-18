const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/incident.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.get('/', authenticate, ctrl.listResponders);
router.get('/nearest', authenticate, ctrl.getNearestResponders);
router.post('/', authenticate, authorize('system_admin', 'hospital_admin', 'police_admin', 'fire_admin'), ctrl.registerResponder);
router.put('/:id', authenticate, authorize('system_admin', 'hospital_admin', 'police_admin', 'fire_admin'), ctrl.updateResponder);

module.exports = router;
