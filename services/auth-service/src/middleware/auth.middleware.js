const jwt = require('jsonwebtoken');
const { pool } = require('../db');

async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Fetch fresh user from DB
        const result = await pool.query(
            'SELECT user_id, name, email, role, is_active FROM users WHERE user_id = $1',
            [decoded.user_id]
        );

        if (!result.rows.length || !result.rows[0].is_active) {
            return res.status(401).json({ success: false, message: 'User not found or deactivated' });
        }

        req.user = result.rows[0];
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired' });
        }
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
}

function authorize(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role(s): ${roles.join(', ')}`
            });
        }
        next();
    };
}

module.exports = { authenticate, authorize };
