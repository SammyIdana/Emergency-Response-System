const { detectGhanaRegion } = require('../utils/ghanaRegions');
const { pool } = require('../db');
const { publish } = require('../rabbitmq');
const { getResponderTypeForIncident, selectNearestResponder } = require('../utils/dispatch');
const logger = require('../utils/logger');

// POST /incidents
async function createIncident(req, res, next) {
    try {
        const {
            citizen_name, citizen_phone, incident_type, latitude, longitude,
            location_address, notes
        } = req.body;

        if (!citizen_name || !incident_type || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const validTypes = ['medical', 'fire', 'crime', 'accident', 'other'];
        if (!validTypes.includes(incident_type)) {
            return res.status(400).json({ success: false, message: 'Invalid incident type' });
        }

        // Role-based validation
        const { role } = req.user || {};
        if (role === 'hospital_admin' && incident_type !== 'medical') {
            return res.status(403).json({ success: false, message: 'Hospital admins can only create medical incidents' });
        }
        if (role === 'police_admin' && !['crime', 'accident'].includes(incident_type)) {
            return res.status(403).json({ success: false, message: 'Police admins can only create crime or accident incidents' });
        }
        if (role === 'fire_admin' && incident_type !== 'fire') {
            return res.status(403).json({ success: false, message: 'Fire admins can only create fire incidents' });
        }

        // Auto-detect Ghana region from coordinates
        const { detectGhanaRegion } = require('../utils/ghanaRegions');
        const region = detectGhanaRegion(latitude, longitude);

        const result = await pool.query(
            `INSERT INTO incidents
          (citizen_name, citizen_phone, incident_type, latitude, longitude,
           location_address, notes, created_by, region)
        VALUES ($1,$2,$3::incident_type_enum,$4,$5,$6,$7,$8,$9)
        RETURNING *`,
            [citizen_name, citizen_phone || null, incident_type,
                latitude, longitude, location_address || null,
                notes || null, req.user.user_id, region]
        );

        const incident = result.rows[0];

        // Publish incident.created event
        publish('incident.created', {
            incident_id: incident.incident_id,
            incident_type: incident.incident_type,
            latitude: parseFloat(incident.latitude),
            longitude: parseFloat(incident.longitude),
            citizen_name: incident.citizen_name,
            created_by: incident.created_by,
            status: incident.status,
            region: incident.region,
            created_at: incident.created_at,
        });

        logger.info(`AUDIT: Incident created: incident_id=${incident.incident_id}, type=${incident.incident_type}, region=${region}, created_by=${incident.created_by}`);

        // AUTOMATION: Trigger auto-dispatch immediately
        req.params.id = incident.incident_id;
        return autoDispatch(req, res, next).catch(err => {
            logger.error(`AUTO-DISPATCH ERROR: ${err.message}`);
            if (!res.headersSent) res.status(500).json({ success: false, message: "Incident created but auto-dispatch failed" });
        });
    } catch (err) {
        next(err);
    }
}


// GET /incidents
async function listIncidents(req, res, next) {
    try {
        const { status, incident_type, created_by, page = 1, limit = 20 } = req.query;
        let query = 'SELECT * FROM incidents WHERE 1=1';
        const values = [];
        let idx = 1;

        if (status) { query += ` AND status = $${idx++}::incident_status_enum`; values.push(status); }
        if (incident_type) { query += ` AND incident_type = $${idx++}::incident_type_enum`; values.push(incident_type); }
        if (created_by) { query += ` AND created_by = $${idx++}`; values.push(created_by); }

        // Role-based visibility
        const { role } = req.user || {};
        if (role === 'hospital_admin') {
            query += " AND incident_type = 'medical'";
        } else if (role === 'police_admin') {
            query += " AND incident_type IN ('crime', 'accident')";
        } else if (role === 'fire_admin') {
            query += " AND incident_type = 'fire'";
        }

        query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
        values.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        const result = await pool.query(query, values);
        res.json({ success: true, data: result.rows, count: result.rows.length });
    } catch (err) {
        next(err);
    }
}

// GET /incidents/open
async function listOpenIncidents(req, res, next) {
    try {
        const { role } = req.user || {};
        let roleFilter = '';
        if (role === 'hospital_admin') roleFilter = " AND incident_type = 'medical'";
        else if (role === 'police_admin') roleFilter = " AND incident_type IN ('crime', 'accident')";
        else if (role === 'fire_admin') roleFilter = " AND incident_type = 'fire'";

        const result = await pool.query(
            `SELECT * FROM incidents WHERE status IN ('created','dispatched','in_progress')
             ${roleFilter}
             ORDER BY created_at ASC`
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        next(err);
    }
}

// GET /incidents/:id
async function getIncident(req, res, next) {
    try {
        const result = await pool.query('SELECT * FROM incidents WHERE incident_id = $1', [req.params.id]);
        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        next(err);
    }
}

// PUT /incidents/:id/status
async function updateIncidentStatus(req, res, next) {
    try {
        const { status } = req.body;
        const validStatuses = ['created', 'dispatched', 'in_progress', 'resolved'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const extra = status === 'resolved' ? ', resolved_at = NOW()' : '';
        const result = await pool.query(
            `UPDATE incidents SET status = $1::incident_status_enum${extra}
       WHERE incident_id = $2 RETURNING *`,
            [status, req.params.id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        const incident = result.rows[0];

        // Publish status update event
        const routingKey = status === 'resolved' ? 'incident.resolved' : 'incident.status.updated';
        publish(routingKey, {
            incident_id: incident.incident_id,
            incident_type: incident.incident_type,
            status: incident.status,
            assigned_unit_id: incident.assigned_unit_id,
            assigned_unit_type: incident.assigned_unit_type,
            latitude: parseFloat(incident.latitude),
            longitude: parseFloat(incident.longitude),
            created_at: incident.created_at,
            dispatched_at: incident.dispatched_at,
            resolved_at: incident.resolved_at,
        });

        // If resolved, free up the assigned unit and snap back to base
        if (status === 'resolved' && incident.assigned_unit_id) {
            const unitResult = await pool.query(
                'UPDATE responder_units SET is_available = TRUE WHERE unit_id = $1 RETURNING *',
                [incident.assigned_unit_id]
            );

            if (unitResult.rows.length) {
                const unit = unitResult.rows[0];
                // SNAPPING: Notify tracking-service to reset location to base
                try {
                    const axios = require('axios');
                    const trackingUrl = process.env.TRACKING_SERVICE_URL || 'http://tracking-service:3003';
                    // We can use a special internal endpoint or just update location
                    await axios.post(`${trackingUrl}/vehicles/${unit.unit_id}/location`, {
                        latitude: parseFloat(unit.latitude),
                        longitude: parseFloat(unit.longitude),
                        status: 'idle'
                    }, {
                        headers: { Authorization: req.headers.authorization }
                    });
                    logger.info(`SNAP: Vehicle ${unit.unit_id} returned to base: ${unit.latitude}, ${unit.longitude}`);
                } catch (err) {
                    logger.error(`SNAP ERROR: ${err.message}`);
                }
            }
        }

        logger.info(`AUDIT: Incident status updated: incident_id=${incident.incident_id}, new_status=${incident.status}, updated_by=${req.user ? req.user.user_id : 'unknown'}`);
        res.json({ success: true, data: incident });
    } catch (err) {
        next(err);
    }
}

// PUT /incidents/:id/assign (manual assignment)
async function assignResponder(req, res, next) {
    try {
        const { unit_id } = req.body;
        if (!unit_id) {
            return res.status(400).json({ success: false, message: 'unit_id required' });
        }

        const unitResult = await pool.query(
            'SELECT * FROM responder_units WHERE unit_id = $1',
            [unit_id]
        );
        if (!unitResult.rows.length) {
            return res.status(404).json({ success: false, message: 'Responder unit not found' });
        }

        const unit = unitResult.rows[0];

        const result = await pool.query(
            `UPDATE incidents
       SET assigned_unit_id = $1, assigned_unit_type = $2::responder_type_enum,
           status = 'dispatched'::incident_status_enum, dispatched_at = NOW()
       WHERE incident_id = $3 RETURNING *`,
            [unit.unit_id, unit.unit_type, req.params.id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        await pool.query('UPDATE responder_units SET is_available = FALSE WHERE unit_id = $1', [unit.unit_id]);

        const incident = result.rows[0];
        publish('incident.dispatched', {
            incident_id: incident.incident_id,
            incident_type: incident.incident_type,
            assigned_unit_id: unit.unit_id,
            assigned_unit_type: unit.unit_type,
            unit_name: unit.name,
            latitude: parseFloat(incident.latitude),
            longitude: parseFloat(incident.longitude),
            dispatched_at: incident.dispatched_at,
        });

        publish('dispatch.created', {
            incident_id: incident.incident_id,
            vehicle_id: unit.unit_id,
            unit_type: unit.unit_type,
            station_id: unit.hospital_id || unit.unit_id,
            incident_lat: parseFloat(incident.latitude),
            incident_lng: parseFloat(incident.longitude),
            dispatched_at: incident.dispatched_at,
        });

        logger.info(`AUDIT: Responder assigned: incident_id=${incident.incident_id}, unit_id=${unit.unit_id}, assigned_by=${req.user ? req.user.user_id : 'unknown'}`);
        res.json({ success: true, data: incident });
    } catch (err) {
        next(err);
    }
}

// POST /incidents/:id/dispatch (auto nearest-responder)
async function autoDispatch(req, res, next) {
    try {
        const incidentResult = await pool.query(
            'SELECT * FROM incidents WHERE incident_id = $1',
            [req.params.id]
        );

        if (!incidentResult.rows.length) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        const incident = incidentResult.rows[0];

        if (incident.status !== 'created') {
            return res.status(400).json({
                success: false,
                message: `Cannot dispatch incident with status: ${incident.status}`
            });
        }

        const responderTypes = getResponderTypeForIncident(incident.incident_type);
        if (!responderTypes) {
            return res.status(400).json({
                success: false,
                message: 'Manual assignment required for this incident type'
            });
        }

        const unitsResult = await pool.query('SELECT * FROM responder_units WHERE is_available = TRUE');
        const dispatched = [];

        for (const type of responderTypes) {
            let units = unitsResult.rows.filter(u => u.unit_type === type);

            // Logical Fix: Filter by capacity for medical incidents
            if (incident.incident_type === 'medical') {
                units = units.filter(u => u.unit_type !== 'ambulance' || u.available_beds > 0);
            }

            const nearest = selectNearestResponder(
                units,
                parseFloat(incident.latitude),
                parseFloat(incident.longitude),
                incident.incident_type
            );

            if (!nearest) {
                logger.warn(`No available ${type} unit found for incident ${incident.incident_id}`);
                continue;
            }

            // Mark unit unavailable
            await pool.query('UPDATE responder_units SET is_available = FALSE WHERE unit_id = $1', [nearest.unit_id]);
            dispatched.push({ type, unit: nearest });
        }

        if (!dispatched.length) {
            const resp = { success: false, message: 'No available responders found for this incident' };
            if (!res.headersSent) return res.status(503).json(resp);
            return;
        }

        // Use first dispatched unit as primary assignment
        const primary = dispatched[0].unit;

        const updatedResult = await pool.query(
            `UPDATE incidents
       SET assigned_unit_id = $1, assigned_unit_type = $2::responder_type_enum,
           status = 'dispatched'::incident_status_enum, dispatched_at = NOW()
       WHERE incident_id = $3 RETURNING *`,
            [primary.unit_id, primary.unit_type, incident.incident_id]
        );

        const updatedIncident = updatedResult.rows[0];

        // Publish events
        publish('incident.dispatched', {
            incident_id: updatedIncident.incident_id,
            incident_type: updatedIncident.incident_type,
            assigned_unit_id: primary.unit_id,
            assigned_unit_type: primary.unit_type,
            unit_name: primary.name,
            distance_km: primary.distance_km,
            latitude: parseFloat(updatedIncident.latitude),
            longitude: parseFloat(updatedIncident.longitude),
            dispatched_at: updatedIncident.dispatched_at,
        });

        publish('dispatch.created', {
            incident_id: updatedIncident.incident_id,
            vehicle_id: primary.unit_id,
            unit_type: primary.unit_type,
            station_id: primary.hospital_id || primary.unit_id,
            incident_lat: parseFloat(updatedIncident.latitude),
            incident_lng: parseFloat(updatedIncident.longitude),
            dispatched_at: updatedIncident.dispatched_at,
        });

        logger.info(`AUDIT: Auto-dispatch: incident_id=${updatedIncident.incident_id}, primary_unit_id=${primary.unit_id}, dispatched_by=${req.user ? req.user.user_id : 'system'}`);

        if (!res.headersSent) {
            res.json({
                success: true,
                data: {
                    incident: updatedIncident,
                    dispatched_units: dispatched.map((d) => ({
                        type: d.type,
                        unit_id: d.unit.unit_id,
                        name: d.unit.name,
                        distance_km: d.unit.distance_km?.toFixed(2),
                    })),
                }
            });
        }
    } catch (err) {
        next(err);
    }
}

// GET /responders
async function listResponders(req, res, next) {
    try {
        const { unit_type, is_available } = req.query;
        let query = 'SELECT * FROM responder_units WHERE 1=1';
        const values = [];
        let idx = 1;

        if (unit_type) { query += ` AND unit_type = $${idx++}::responder_type_enum`; values.push(unit_type); }
        if (is_available !== undefined) { query += ` AND is_available = $${idx++}`; values.push(is_available === 'true'); }

        query += ' ORDER BY name ASC';
        const result = await pool.query(query, values);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        next(err);
    }
}

// GET /responders/nearby
async function listNearbyResponders(req, res, next) {
    try {
        const { lat, lng, type, limit = 5 } = req.query;
        if (!lat || !lng || !type) {
            return res.status(400).json({ success: false, message: 'lat, lng, and type are required' });
        }

        const result = await pool.query(
            'SELECT * FROM responder_units WHERE unit_type = $1::responder_type_enum AND is_available = TRUE',
            [type]
        );

        const { haversine } = require('../utils/dispatch');
        const ranked = result.rows
            .map((u) => ({
                ...u,
                distance_km: haversine(parseFloat(lat), parseFloat(lng), parseFloat(u.latitude), parseFloat(u.longitude)),
            }))
            .sort((a, b) => a.distance_km - b.distance_km)
            .slice(0, parseInt(limit));

        res.json({ success: true, data: ranked });
    } catch (err) {
        next(err);
    }
}

// POST /responders (create/register a responder unit)
async function registerResponder(req, res, next) {
    try {
        const { unit_type, name, latitude, longitude, hospital_id, hospital_name, available_beds, total_beds } = req.body;

        const result = await pool.query(
            `INSERT INTO responder_units
          (unit_type, name, latitude, longitude, hospital_id, hospital_name, available_beds, total_beds)
        VALUES ($1::responder_type_enum, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
            [unit_type, name, latitude, longitude, hospital_id || null, hospital_name || null,
                available_beds || 0, total_beds || 0]
        );

        const responder = result.rows[0];

        // LOGICAL FIX: Automatically register as a vehicle in tracking-service
        try {
            const axios = require('axios');
            const trackingUrl = process.env.TRACKING_SERVICE_URL || 'http://tracking-service:3003';
            await axios.post(`${trackingUrl}/vehicles/register`, {
                vehicle_id: responder.unit_id,
                unit_type: (responder.unit_type === 'ambulance' ? 'ambulance' : (responder.unit_type === 'police' ? 'police' : 'fire')),
                station_id: responder.hospital_id || responder.unit_id,
                driver_name: responder.name + ' Driver',
                driver_user_id: 'auto-driver-' + Date.now(),
                latitude: parseFloat(responder.latitude),
                longitude: parseFloat(responder.longitude)
            }, {
                headers: { Authorization: req.headers.authorization }
            });
            logger.info(`SYNC: Vehicle registered in tracking-service for unit: ${responder.unit_id}`);
        } catch (err) {
            logger.error(`SYNC ERROR: Failed to register vehicle in tracking-service: ${err.message}`);
        }

        res.status(201).json({ success: true, data: responder });
    } catch (err) {
        next(err);
    }
}

// PUT /responders/:id (update responder)
async function updateResponder(req, res, next) {
    try {
        const { name, is_available, available_beds, total_beds, latitude, longitude, station_name } = req.body;
        const updates = [];
        const values = [];
        let idx = 1;

        if (name) { updates.push(`name = $${idx++}`); values.push(name); }
        if (is_available !== undefined) { updates.push(`is_available = $${idx++}`); values.push(is_available); }
        if (available_beds !== undefined) { updates.push(`available_beds = $${idx++}`); values.push(available_beds); }
        if (total_beds !== undefined) { updates.push(`total_beds = $${idx++}`); values.push(total_beds); }
        if (latitude !== undefined) { updates.push(`latitude = $${idx++}`); values.push(latitude); }
        if (longitude !== undefined) { updates.push(`longitude = $${idx++}`); values.push(longitude); }
        if (station_name) { updates.push(`hospital_name = $${idx++}`); values.push(station_name); }

        if (!updates.length) return res.status(400).json({ success: false, message: 'Nothing to update' });

        updates.push(`last_synced_at = NOW()`);
        values.push(req.params.id);

        const result = await pool.query(
            `UPDATE responder_units SET ${updates.join(', ')} WHERE unit_id = $${idx} RETURNING *`,
            values
        );

        if (!result.rows.length) return res.status(404).json({ success: false, message: 'Responder not found' });

        // If location changed and is NOT en route, tracking service would usually be updated by drivers,
        // but for "Base location" we can optionally sync here if needed.

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        next(err);
    }
}

// DELETE /responders/:id
async function deleteResponder(req, res, next) {
    try {
        const result = await pool.query('DELETE FROM responder_units WHERE unit_id = $1 RETURNING *', [req.params.id]);
        if (!result.rows.length) return res.status(404).json({ success: false, message: 'Responder not found' });

        // Notify tracking-service to remove vehicle
        try {
            const axios = require('axios');
            const trackingUrl = process.env.TRACKING_SERVICE_URL || 'http://tracking-service:3003';
            await axios.delete(`${trackingUrl}/vehicles/${req.params.id}`, {
                headers: { Authorization: req.headers.authorization }
            });
            logger.info(`SYNC: Vehicle deleted in tracking-service for unit: ${req.params.id}`);
        } catch (err) {
            logger.error(`SYNC ERROR during delete: ${err.message}`);
        }

        res.json({ success: true, message: 'Responder deleted successfully' });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createIncident,
    listIncidents,
    listOpenIncidents,
    getIncident,
    updateIncidentStatus,
    assignResponder,
    autoDispatch,
    listResponders,
    listNearbyResponders,
    registerResponder,
    updateResponder,
    deleteResponder
};
