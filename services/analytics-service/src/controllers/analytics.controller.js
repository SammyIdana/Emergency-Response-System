const { pool } = require('../db');
const logger = require('../utils/logger');

function getDateRange(req) {
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    return { from, to };
}

// GET /analytics/response-times
async function getResponseTimes(req, res, next) {
    try {
        const { from, to } = getDateRange(req);
        const { incident_type, unit_type } = req.query;
        const { role } = req.user || {};
        let incidentFilter = '';
        let unitFilter = '';
        if (role === 'hospital_admin') {
            incidentFilter = "AND incident_type = 'medical'";
            unitFilter = "AND unit_type = 'ambulance'";
        } else if (role === 'police_admin') {
            incidentFilter = "AND incident_type IN ('crime', 'accident')";
            unitFilter = "AND unit_type = 'police'";
        } else if (role === 'fire_admin') {
            incidentFilter = "AND incident_type = 'fire'";
            unitFilter = "AND unit_type = 'fire'";
        }

        let query = `
      SELECT
        incident_type,
        unit_type,
        COUNT(*) AS total_incidents,
        ROUND(AVG(dispatch_time_seconds)) AS avg_dispatch_time_seconds,
        ROUND(AVG(response_time_seconds)) AS avg_response_time_seconds,
        ROUND(AVG(resolution_time_seconds)) AS avg_resolution_time_seconds,
        MIN(dispatch_time_seconds) AS min_dispatch_time,
        MAX(dispatch_time_seconds) AS max_dispatch_time
      FROM incident_analytics
      WHERE created_at BETWEEN $1 AND $2
      ${incidentFilter}
      ${unitFilter}
    `;
        const values = [from, to];
        let idx = 3;

        if (incident_type) { query += ` AND incident_type = $${idx++}`; values.push(incident_type); }
        if (unit_type) { query += ` AND unit_type = $${idx++}`; values.push(unit_type); }

        query += ' GROUP BY incident_type, unit_type ORDER BY total_incidents DESC';

        const result = await pool.query(query, values);
        logger.info(`AUDIT: Analytics accessed: endpoint=/analytics/response-times, user_id=${req.user ? req.user.user_id : 'unknown'}`);
        res.json({ success: true, data: result.rows, period: { from, to } });
    } catch (err) {
        next(err);
    }
}

// GET /analytics/incidents-by-region
async function getIncidentsByRegion(req, res, next) {
    try {
        const { from, to } = getDateRange(req);

        const { role } = req.user || {};
        let incidentFilter = '';
        if (role === 'hospital_admin') incidentFilter = "AND incident_type = 'medical'";
        else if (role === 'police_admin') incidentFilter = "AND incident_type IN ('crime', 'accident')";
        else if (role === 'fire_admin') incidentFilter = "AND incident_type = 'fire'";

        const result = await pool.query(
            `SELECT
        COALESCE(region, 'Unknown') AS region,
        incident_type,
        COUNT(*) AS count,
        AVG(dispatch_time_seconds) AS avg_dispatch_seconds
      FROM incident_analytics
      WHERE created_at BETWEEN $1 AND $2
      ${incidentFilter}
      GROUP BY region, incident_type
      ORDER BY count DESC`,
            [from, to]
        );
        logger.info(`AUDIT: Analytics accessed: endpoint=/analytics/incidents-by-region, user_id=${req.user ? req.user.user_id : 'unknown'}`);
        res.json({ success: true, data: result.rows, period: { from, to } });
    } catch (err) {
        next(err);
    }
}

// GET /analytics/resource-utilization
async function getResourceUtilization(req, res, next) {
    try {
        const { from, to } = getDateRange(req);

        const { role } = req.user || {};
        let unitFilter = '';
        if (role === 'hospital_admin') unitFilter = "AND unit_type = 'ambulance'";
        else if (role === 'police_admin') unitFilter = "AND unit_type = 'police'";
        else if (role === 'fire_admin') unitFilter = "AND unit_type = 'fire'";

        const result = await pool.query(
            `SELECT
        unit_id,
        unit_type,
        station_name,
        COUNT(*) AS total_deployments,
        ROUND(AVG(deployment_duration_seconds)) AS avg_deployment_duration_seconds,
        SUM(deployment_duration_seconds) AS total_deployed_seconds,
        COUNT(CASE WHEN returned_at IS NULL THEN 1 END) AS currently_deployed
      FROM resource_utilization
      WHERE deployed_at BETWEEN $1 AND $2
      ${unitFilter}
      GROUP BY unit_id, unit_type, station_name
      ORDER BY total_deployments DESC`,
            [from, to]
        );
        logger.info(`AUDIT: Analytics accessed: endpoint=/analytics/resource-utilization, user_id=${req.user ? req.user.user_id : 'unknown'}`);
        res.json({ success: true, data: result.rows, period: { from, to } });
    } catch (err) {
        next(err);
    }
}

// GET /analytics/hospital-capacity
async function getHospitalCapacity(req, res, next) {
    try {
        const { hospital_id } = req.query;

        let query = `
      SELECT hospital_id, hospital_name, total_beds, available_beds,
             ambulances_total, ambulances_available, snapshotted_at
      FROM hospital_capacity_snapshots
      WHERE 1=1
    `;
        const values = [];
        let idx = 1;

        if (hospital_id) { query += ` AND hospital_id = $${idx++}`; values.push(hospital_id); }
        query += ' ORDER BY snapshotted_at DESC LIMIT 100';

        const result = await pool.query(query, values);
        logger.info(`AUDIT: Analytics accessed: endpoint=/analytics/hospital-capacity, user_id=${req.user ? req.user.user_id : 'unknown'}`);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        next(err);
    }
}

// GET /analytics/top-responders
async function getTopResponders(req, res, next) {
    try {
        const { from, to } = getDateRange(req);

        const { role } = req.user || {};
        let unitFilter = '';
        if (role === 'hospital_admin') unitFilter = "AND unit_type = 'ambulance'";
        else if (role === 'police_admin') unitFilter = "AND unit_type = 'police'";
        else if (role === 'fire_admin') unitFilter = "AND unit_type = 'fire'";

        const result = await pool.query(
            `SELECT
        unit_id,
        unit_type,
        station_name,
        COUNT(*) AS deployment_count,
        ROUND(AVG(deployment_duration_seconds)) AS avg_duration_seconds
      FROM resource_utilization
      WHERE deployed_at BETWEEN $1 AND $2
      ${unitFilter}
      GROUP BY unit_id, unit_type, station_name
      ORDER BY deployment_count DESC
      LIMIT 10`,
            [from, to]
        );
        logger.info(`AUDIT: Analytics accessed: endpoint=/analytics/top-responders, user_id=${req.user ? req.user.user_id : 'unknown'}`);
        res.json({ success: true, data: result.rows, period: { from, to } });
    } catch (err) {
        next(err);
    }
}

// GET /analytics/incident-trends
async function getIncidentTrends(req, res, next) {
    try {
        const { from, to } = getDateRange(req);
        const { granularity = 'day' } = req.query; // day | week | month

        const trunc = ['day', 'week', 'month'].includes(granularity) ? granularity : 'day';

        const { role } = req.user || {};
        let incidentFilter = '';
        if (role === 'hospital_admin') incidentFilter = "AND incident_type = 'medical'";
        else if (role === 'police_admin') incidentFilter = "AND incident_type IN ('crime', 'accident')";
        else if (role === 'fire_admin') incidentFilter = "AND incident_type = 'fire'";

        const result = await pool.query(
            `SELECT
        DATE_TRUNC($1, created_at) AS period,
        incident_type,
        COUNT(*) AS count,
        ROUND(AVG(dispatch_time_seconds)) AS avg_dispatch_seconds
      FROM incident_analytics
      WHERE created_at BETWEEN $2 AND $3
      ${incidentFilter}
      GROUP BY period, incident_type
      ORDER BY period ASC, count DESC`,
            [trunc, from, to]
        );
        logger.info(`AUDIT: Analytics accessed: endpoint=/analytics/incident-trends, user_id=${req.user ? req.user.user_id : 'unknown'}`);
        res.json({ success: true, data: result.rows, period: { from, to }, granularity: trunc });
    } catch (err) {
        next(err);
    }
}

// GET /analytics/dashboard-summary
async function getDashboardSummary(req, res, next) {
    try {
        const { role } = req.user || {};
        let incidentFilter = '';
        let unitFilter = '';
        const params = [];

        if (role === 'hospital_admin') {
            incidentFilter = " AND incident_type = 'medical'";
            unitFilter = " AND unit_type = 'ambulance'";
        } else if (role === 'police_admin') {
            incidentFilter = " AND incident_type IN ('crime', 'accident')";
            unitFilter = " AND unit_type = 'police'";
        } else if (role === 'fire_admin') {
            incidentFilter = " AND incident_type = 'fire'";
            unitFilter = " AND unit_type = 'fire'";
        }

        const [incidentStats, responseStats, resourceStats] = await Promise.all([
            pool.query(`
        SELECT
          COUNT(*) AS total_incidents,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) AS resolved,
          COUNT(CASE WHEN status IN ('created','dispatched','in_progress') THEN 1 END) AS active,
          COUNT(CASE WHEN status = 'dispatched' THEN 1 END) AS dispatched_count
        FROM incident_analytics
        WHERE created_at >= NOW() - INTERVAL '30 days' ${incidentFilter}
      `, params),
            pool.query(`
        SELECT
          ROUND(AVG(dispatch_time_seconds)) AS avg_dispatch_time,
          ROUND(AVG(response_time_seconds)) AS avg_response_time,
          ROUND(AVG(resolution_time_seconds)) AS avg_resolution_time
        FROM incident_analytics
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND status = 'resolved' ${incidentFilter}
      `, params),
            pool.query(`
        SELECT
          unit_type,
          COUNT(*) AS total_deployments,
          COUNT(CASE WHEN returned_at IS NULL THEN 1 END) AS currently_active
        FROM resource_utilization
        WHERE deployed_at >= NOW() - INTERVAL '30 days' ${unitFilter}
        GROUP BY unit_type
      `, params),
        ]);

        res.json({
            success: true,
            data: {
                period: '30 days',
                incidents: incidentStats.rows[0],
                response_times: responseStats.rows[0],
                resource_by_type: resourceStats.rows,
            }
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getResponseTimes, getIncidentsByRegion, getResourceUtilization,
    getHospitalCapacity, getTopResponders, getIncidentTrends, getDashboardSummary
};
