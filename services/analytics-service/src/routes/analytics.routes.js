const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/analytics.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Analytics & monitoring endpoints
 */

/**
 * @swagger
 * /analytics/response-times:
 *   get:
 *     summary: Average response times by incident type and unit type
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *         description: Start date (default 30 days ago)
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: incident_type
 *         schema: { type: string }
 *       - in: query
 *         name: unit_type
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Response time stats
 */
router.get('/response-times', authenticate, ctrl.getResponseTimes);

/**
 * @swagger
 * /analytics/incidents-by-region:
 *   get:
 *     summary: Count of incidents grouped by region and type
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Incidents grouped by region
 */
router.get('/incidents-by-region', authenticate, ctrl.getIncidentsByRegion);

/**
 * @swagger
 * /analytics/resource-utilization:
 *   get:
 *     summary: Deployment frequency and duration per unit
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Resource utilization stats
 */
router.get('/resource-utilization', authenticate, ctrl.getResourceUtilization);

/**
 * @swagger
 * /analytics/hospital-capacity:
 *   get:
 *     summary: Historical hospital bed and ambulance availability
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hospital_id
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Hospital capacity snapshots
 */
router.get('/hospital-capacity', authenticate, authorize('hospital_admin', 'system_admin'), ctrl.getHospitalCapacity);

/**
 * @swagger
 * /analytics/top-responders:
 *   get:
 *     summary: Most frequently deployed responder units
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Top responders by deployment count
 */
router.get('/top-responders', authenticate, ctrl.getTopResponders);

/**
 * @swagger
 * /analytics/incident-trends:
 *   get:
 *     summary: Time-series incident volume data
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *     responses:
 *       200:
 *         description: Incident trend data
 */
router.get('/incident-trends', authenticate, ctrl.getIncidentTrends);

/**
 * @swagger
 * /analytics/dashboard-summary:
 *   get:
 *     summary: High-level summary stats for admin dashboard (last 30 days)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary
 */
router.get('/dashboard-summary', authenticate, ctrl.getDashboardSummary);

module.exports = router;
