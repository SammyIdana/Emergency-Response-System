const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/incident.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

/**
 * @swagger
 * tags:
 *   - name: Incidents
 *     description: Emergency incident management
 *   - name: Responders
 *     description: Emergency responder unit management
 */

// ─── Incidents ───────────────────────────────────────────────────

/**
 * @swagger
 * /incidents:
 *   post:
 *     summary: Create a new emergency incident
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [citizen_name, incident_type, latitude, longitude]
 *             properties:
 *               citizen_name: { type: string }
 *               citizen_phone: { type: string }
 *               incident_type:
 *                 type: string
 *                 enum: [medical, fire, crime, accident, other]
 *               latitude: { type: number }
 *               longitude: { type: number }
 *               location_address: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Incident created
 */
router.post('/', authenticate, authorize('system_admin'), ctrl.createIncident);

/**
 * @swagger
 * /incidents:
 *   get:
 *     summary: List all incidents
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [created, dispatched, in_progress, resolved] }
 *       - in: query
 *         name: incident_type
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of incidents
 */
router.get('/', authenticate, ctrl.listIncidents);

/**
 * @swagger
 * /incidents/open:
 *   get:
 *     summary: List open incidents (created or dispatched)
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Open incidents
 */
router.get('/open', authenticate, ctrl.listOpenIncidents);

/**
 * @swagger
 * /incidents/{id}:
 *   get:
 *     summary: Get incident by ID
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Incident details
 *       404:
 *         description: Incident not found
 */
router.get('/:id', authenticate, ctrl.getIncident);

/**
 * @swagger
 * /incidents/{id}/status:
 *   put:
 *     summary: Update incident status
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [created, dispatched, in_progress, resolved]
 *     responses:
 *       200:
 *         description: Status updated
 */
router.put('/:id/status', authenticate, ctrl.updateIncidentStatus);

/**
 * @swagger
 * /incidents/{id}/assign:
 *   put:
 *     summary: Manually assign a responder to an incident
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [unit_id]
 *             properties:
 *               unit_id: { type: string }
 *     responses:
 *       200:
 *         description: Responder assigned
 */
router.put('/:id/assign', authenticate, authorize('system_admin'), ctrl.assignResponder);

/**
 * @swagger
 * /incidents/{id}/dispatch:
 *   post:
 *     summary: Auto-dispatch nearest available responder
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Dispatch triggered
 *       503:
 *         description: No available responders
 */
router.post('/:id/dispatch', authenticate, authorize('system_admin'), ctrl.autoDispatch);

// ─── Responders ───────────────────────────────────────────────────

/**
 * @swagger
 * /responders:
 *   get:
 *     summary: List all responder units
 *     tags: [Responders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unit_type
 *         schema: { type: string, enum: [police, ambulance, fire] }
 *       - in: query
 *         name: is_available
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: List of responders
 */

/**
 * @swagger
 * /responders/nearest:
 *   get:
 *     summary: Find nearest available responders for given location and type
 *     tags: [Responders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: lng
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: type
 *         required: true
 *         schema: { type: string, enum: [police, ambulance, fire] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Nearest responders sorted by distance
 */

module.exports = router;
