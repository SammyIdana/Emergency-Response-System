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

        const result = await pool.query(
            `INSERT INTO incidents
         (citizen_name, citizen_phone, incident_type, latitude, longitude,
          location_address, notes, created_by)
       VALUES ($1,$2,$3::incident_type_enum,$4,$5,$6,$7,$8)
       RETURNING *`,
            [citizen_name, citizen_phone || null, incident_type,
                latitude, longitude, location_address || null, notes || null, req.user.user_id]
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
            created_at: incident.created_at,
        });

        res.status(201).json({ success: true, data: incident });
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
        const result = await pool.query(
            `SELECT * FROM incidents WHERE status IN ('created','dispatched','in_progress')
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
async function updateStatus(req, res, next) {
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

        // If resolved, free up the assigned unit
        if (status === 'resolved' && incident.assigned_unit_id) {
            await pool.query(
                'UPDATE responder_units SET is_available = TRUE WHERE unit_id = $1',
                [incident.assigned_unit_id]
            );
        }

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

        const dispatched = [];

        for (const type of responderTypes) {
            const unitsResult = await pool.query(
                'SELECT * FROM responder_units WHERE unit_type = $1::responder_type_enum AND is_available = TRUE',
                [type]
            );

            const nearest = selectNearestResponder(
                unitsResult.rows,
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
            return res.status(503).json({
                success: false,
                message: 'No available responders found for this incident'
            });
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

// GET /responders/nearest
async function getNearestResponders(req, res, next) {
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

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        next(err);
    }
}

// PUT /responders/:id (update responder availability/capacity)
async function updateResponder(req, res, next) {
    try {
        const { is_available, available_beds, total_beds } = req.body;
        const updates = [];
        const values = [];
        let idx = 1;

        if (is_available !== undefined) { updates.push(`is_available = $${idx++}`); values.push(is_available); }
        if (available_beds !== undefined) { updates.push(`available_beds = $${idx++}`); values.push(available_beds); }
        if (total_beds !== undefined) { updates.push(`total_beds = $${idx++}`); values.push(total_beds); }

        if (!updates.length) return res.status(400).json({ success: false, message: 'Nothing to update' });

        updates.push(`last_synced_at = NOW()`);
        values.push(req.params.id);

        const result = await pool.query(
            `UPDATE responder_units SET ${updates.join(', ')} WHERE unit_id = $${idx} RETURNING *`,
            values
        );

        if (!result.rows.length) return res.status(404).json({ success: false, message: 'Responder unit not found' });

        const unit = result.rows[0];

        // Publish hospital capacity update if applicable
        if (unit.unit_type === 'ambulance' && unit.hospital_id) {
            publish('hospital.capacity.updated', {
                hospital_id: unit.hospital_id,
                hospital_name: unit.hospital_name,
                available_beds: unit.available_beds,
                total_beds: unit.total_beds,
                updated_at: new Date().toISOString(),
            });
        }

        res.json({ success: true, data: unit });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createIncident, listIncidents, listOpenIncidents, getIncident,
    updateStatus, assignResponder, autoDispatch,
    listResponders, getNearestResponders, registerResponder, updateResponder
};
