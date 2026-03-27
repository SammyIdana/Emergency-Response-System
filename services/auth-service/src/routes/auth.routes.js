const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auth.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { body } = require('express-validator');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Identity & Authentication endpoints
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               role:
 *                 type: string
 *                 enum: [system_admin, hospital_admin, police_admin, fire_admin, ambulance_driver]
 *     responses:
 *       201:
 *         description: User registered
 *       409:
 *         description: Email already registered
 */
router.post(
	'/register',
	[
		body('name').isString().trim().notEmpty().withMessage('Name is required'),
		body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
		body('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
		body('role').isIn(['system_admin', 'hospital_admin', 'police_admin', 'fire_admin', 'ambulance_driver']).withMessage('Invalid role'),
	],
	ctrl.register
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Authenticate user and receive tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful with tokens
 *       401:
 *         description: Invalid credentials
 */
router.post(
	'/login',
	[
		body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
		body('password').isString().notEmpty().withMessage('Password is required'),
	],
	ctrl.login
);

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Issue new access token using refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token]
 *             properties:
 *               refresh_token: { type: string }
 *     responses:
 *       200:
 *         description: New tokens issued
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh-token', ctrl.refreshToken);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout and revoke refresh token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post('/logout', authenticate, ctrl.logout);

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     summary: Get authenticated user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 */
router.get('/profile', authenticate, ctrl.getProfile);

/**
 * @swagger
 * /auth/profile:
 *   put:
 *     summary: Update authenticated user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put('/profile', authenticate, ctrl.updateProfile);

/**
 * @swagger
 * /auth/users:
 *   get:
 *     summary: List all users (System Admin only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/users', authenticate, authorize('system_admin'), ctrl.listUsers);

/**
 * @swagger
 * /auth/users/{id}/deactivate:
 *   put:
 *     summary: Deactivate a user account (System Admin only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User deactivated
 *       404:
 *         description: User not found
 */
router.put('/users/:id/deactivate', authenticate, authorize('system_admin'), ctrl.deactivateUser);

// Internal endpoint used by other microservices to validate tokens
router.get('/validate', authenticate, ctrl.validateToken);

module.exports = router;
