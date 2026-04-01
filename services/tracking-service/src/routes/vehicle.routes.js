const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/vehicle.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

/**
 * @swagger
 * tags:
 *   name: Vehicles
 *   description: Vehicle tracking endpoints
 */

/**
 * @swagger
 * /vehicles/register:
 *   post:
 *     summary: Register a new vehicle
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehicle_id, unit_type, station_id, driver_name, driver_user_id]
 *             properties:
 *               vehicle_id: { type: string }
 *               unit_type:
 *                 type: string
 *                 enum: [ambulance, police, fire]
 *               station_id: { type: string }
 *               driver_name: { type: string }
 *               driver_user_id: { type: string }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *     responses:
 *       201:
 *         description: Vehicle registered
 */
router.post('/register', authenticate, authorize('system_admin', 'hospital_admin', 'police_admin', 'fire_admin'), ctrl.registerVehicle);

/**
 * @swagger
 * /vehicles:
 *   get:
 *     summary: List all vehicles
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unit_type
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of vehicles
 */
router.get('/', authenticate, ctrl.listVehicles);

/**
 * @swagger
 * /vehicles/{id}:
 *   get:
 *     summary: Get vehicle details
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vehicle details
 *       404:
 *         description: Not found
 */
router.get('/:id', authenticate, ctrl.getVehicle);

/**
 * @swagger
 * /vehicles/{id}/location:
 *   get:
 *     summary: Get current GPS location of a vehicle
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vehicle location
 */
router.get('/:id/location', authenticate, ctrl.getVehicleLocation);

/**
 * @swagger
 * /vehicles/{id}/location:
 *   post:
 *     summary: Post a GPS location update (driver/device)
 *     tags: [Vehicles]
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
 *             required: [latitude, longitude]
 *             properties:
 *               latitude: { type: number }
 *               longitude: { type: number }
 *               timestamp: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Location updated
 */
router.post('/:id/location', authenticate, ctrl.updateVehicleLocation);

/**
 * @swagger
 * /vehicles/{id}/history:
 *   get:
 *     summary: Get location history for a vehicle
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Location history
 */
router.get('/:id/history', authenticate, ctrl.getVehicleHistory);

/**
 * @swagger
 * /vehicles/{id}/status:
 *   put:
 *     summary: Update vehicle operational status
 *     tags: [Vehicles]
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
 *                 enum: [idle, dispatched, en_route, on_scene, returning]
 *     responses:
 *       200:
 *         description: Status updated
 */
router.put('/:id/status', authenticate, ctrl.updateVehicleStatus);

/**
 * @swagger
 * /vehicles/{id}:
 *   delete:
 *     summary: Delete a vehicle
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vehicle deleted
 */
router.delete('/:id', authenticate, authorize('system_admin', 'hospital_admin', 'police_admin', 'fire_admin'), ctrl.deleteVehicle);

module.exports = router;
