const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const logger = require('../utils/logger');

function generateAccessToken(user) {
    return jwt.sign(
        { user_id: user.user_id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );
}

function generateRefreshToken() {
    return crypto.randomBytes(64).toString('hex');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

const { validationResult } = require('express-validator');

// POST /auth/register
async function register(req, res, next) {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        const { name, email, password, role } = req.body;

        const validRoles = ['system_admin', 'hospital_admin', 'police_admin', 'fire_admin', 'ambulance_driver', 'police_driver', 'fire_driver'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, message: 'Invalid role' });
        }

        // Check existing
        const exists = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
        if (exists.rows.length) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }

        const password_hash = await bcrypt.hash(password, 12);
        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4::user_role)
       RETURNING user_id, name, email, role, is_active, created_at`,
            [name, email, password_hash, role]
        );

        const user = result.rows[0];
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken();

        await pool.query(
            `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
            [user.user_id, hashToken(refreshToken)]
        );

        logger.info(`AUDIT: User registered: user_id=${user.user_id}, email=${user.email}, role=${user.role}`);
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: { user_id: user.user_id, name: user.name, email: user.email, role: user.role },
                access_token: accessToken,
                refresh_token: refreshToken,
            }
        });
    } catch (err) {
        next(err);
    }
}

// POST /auth/login
async function login(req, res, next) {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        const { email, password } = req.body;

        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (!result.rows.length) {
            logger.warn(`AUDIT: Failed login attempt (email not found): email=${email}`);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            logger.warn(`AUDIT: Login attempt for deactivated account: email=${email}`);
            return res.status(401).json({ success: false, message: 'Account deactivated' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            logger.warn(`AUDIT: Failed login attempt (wrong password): email=${email}`);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken();

        await pool.query(
            `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
            [user.user_id, hashToken(refreshToken)]
        );

        logger.info(`AUDIT: User login: user_id=${user.user_id}, email=${user.email}`);
        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: { user_id: user.user_id, name: user.name, email: user.email, role: user.role },
                access_token: accessToken,
                refresh_token: refreshToken,
            }
        });
    } catch (err) {
        next(err);
    }
}

// POST /auth/refresh-token
async function refreshToken(req, res, next) {
    try {
        const { refresh_token } = req.body;
        if (!refresh_token) {
            return res.status(400).json({ success: false, message: 'Refresh token required' });
        }

        const tokenHash = hashToken(refresh_token);
        const result = await pool.query(
            `SELECT rt.*, u.user_id, u.name, u.email, u.role, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.user_id
       WHERE rt.token_hash = $1 AND rt.revoked = FALSE AND rt.expires_at > NOW()`,
            [tokenHash]
        );

        if (!result.rows.length) {
            return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
        }

        const row = result.rows[0];
        if (!row.is_active) {
            return res.status(401).json({ success: false, message: 'Account deactivated' });
        }

        // Revoke old token
        await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [tokenHash]);

        const newAccessToken = generateAccessToken(row);
        const newRefreshToken = generateRefreshToken();

        await pool.query(
            `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
            [row.user_id, hashToken(newRefreshToken)]
        );

        res.json({
            success: true,
            data: { access_token: newAccessToken, refresh_token: newRefreshToken }
        });
    } catch (err) {
        next(err);
    }
}

// POST /auth/logout
async function logout(req, res, next) {
    try {
        const { refresh_token } = req.body;
        if (refresh_token) {
            const tokenHash = hashToken(refresh_token);
            await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [tokenHash]);
        }
        logger.info(`AUDIT: User logout: user_id=${req.user ? req.user.user_id : 'unknown'}`);
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        next(err);
    }
}

// GET /auth/profile
async function getProfile(req, res) {
    res.json({
        success: true,
        data: {
            user_id: req.user.user_id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            is_active: req.user.is_active,
        }
    });
}

// PUT /auth/profile
async function updateProfile(req, res, next) {
    try {
        const { name, password } = req.body;
        const updates = [];
        const values = [];
        let idx = 1;

        if (name) { updates.push(`name = $${idx++}`); values.push(name); }
        if (password) {
            const hash = await bcrypt.hash(password, 12);
            updates.push(`password_hash = $${idx++}`);
            values.push(hash);
        }

        if (!updates.length) {
            return res.status(400).json({ success: false, message: 'Nothing to update' });
        }

        updates.push(`updated_at = NOW()`);
        values.push(req.user.user_id);

        const result = await pool.query(
            `UPDATE users SET ${updates.join(', ')} WHERE user_id = $${idx}
       RETURNING user_id, name, email, role, updated_at`,
            values
        );

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        next(err);
    }
}

// GET /auth/users (system_admin only)
async function listUsers(req, res, next) {
    try {
        const { role, is_active } = req.query;
        let query = 'SELECT user_id, name, email, role, is_active, created_at FROM users WHERE 1=1';
        const values = [];
        let idx = 1;

        if (role) { query += ` AND role = $${idx++}::user_role`; values.push(role); }
        if (is_active !== undefined) { query += ` AND is_active = $${idx++}`; values.push(is_active === 'true'); }

        query += ' ORDER BY created_at DESC';

        const result = await pool.query(query, values);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        next(err);
    }
}

// PUT /auth/users/:id/deactivate (system_admin only)
async function deactivateUser(req, res, next) {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `UPDATE users SET is_active = FALSE, updated_at = NOW()
       WHERE user_id = $1
       RETURNING user_id, name, email, role, is_active`,
            [id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        logger.info(`AUDIT: User deactivated: user_id=${result.rows[0].user_id}, by=${req.user ? req.user.user_id : 'unknown'}`);
        res.json({ success: true, message: 'User deactivated', data: result.rows[0] });
    } catch (err) {
        next(err);
    }
}

// GET /auth/validate (internal endpoint for other services)
async function validateToken(req, res) {
    res.json({ success: true, data: req.user });
}

module.exports = {
    register, login, refreshToken, logout,
    getProfile, updateProfile, listUsers, deactivateUser, validateToken
};
