const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/vehicle.controller');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * @swagger
 * /incidents/{incidentId}/vehicle:
 *   get:
 *     summary: Get vehicle assigned to a specific incident
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: incidentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vehicle details
 *       404:
 *         description: No vehicle for this incident
 */
router.get('/:incidentId/vehicle', authenticate, ctrl.getVehicleForIncident);

module.exports = router;
