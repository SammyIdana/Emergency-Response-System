const { Vehicle, LocationHistory } = require('../models/vehicle.model');
const { publish } = require('../rabbitmq');
const logger = require('../utils/logger');

// Grab io from app (set after server starts)
let ioInstance = null;
function setIo(io) { ioInstance = io; }

// POST /vehicles/register
async function registerVehicle(req, res, next) {
    try {
        const { vehicle_id, unit_type, station_id, driver_name, driver_user_id, latitude, longitude } = req.body;

        if (!vehicle_id || !unit_type || !station_id || !driver_name || !driver_user_id) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const existing = await Vehicle.findOne({ vehicle_id });
        if (existing) {
            return res.status(409).json({ success: false, message: 'Vehicle already registered' });
        }

        const vehicle = await Vehicle.create({
            vehicle_id,
            unit_type,
            station_id,
            driver_name,
            driver_user_id,
            latitude: latitude || 0,
            longitude: longitude || 0,
        });

        res.status(201).json({ success: true, data: vehicle });
    } catch (err) {
        next(err);
    }
}

// GET /vehicles
async function listVehicles(req, res, next) {
    try {
        const { unit_type, status, station_id } = req.query;
        const filter = {};
        if (unit_type) filter.unit_type = unit_type;
        if (status) filter.status = status;
        if (station_id) filter.station_id = station_id;

        const vehicles = await Vehicle.find(filter).sort({ updated_at: -1 });
        res.json({ success: true, data: vehicles });
    } catch (err) {
        next(err);
    }
}

// GET /vehicles/:id
async function getVehicle(req, res, next) {
    try {
        const vehicle = await Vehicle.findOne({ vehicle_id: req.params.id });
        if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
        res.json({ success: true, data: vehicle });
    } catch (err) {
        next(err);
    }
}

// GET /vehicles/:id/location
async function getVehicleLocation(req, res, next) {
    try {
        const vehicle = await Vehicle.findOne({ vehicle_id: req.params.id }, 'vehicle_id latitude longitude status updated_at');
        if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
        res.json({
            success: true,
            data: {
                vehicle_id: vehicle.vehicle_id,
                latitude: vehicle.latitude,
                longitude: vehicle.longitude,
                status: vehicle.status,
                updated_at: vehicle.updated_at,
            }
        });
    } catch (err) {
        next(err);
    }
}

// POST /vehicles/:id/location (driver GPS update)
async function updateVehicleLocation(req, res, next) {
    try {
        const { latitude, longitude, timestamp } = req.body;
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ success: false, message: 'latitude and longitude required' });
        }

        const vehicle = await Vehicle.findOneAndUpdate(
            { vehicle_id: req.params.id },
            { latitude, longitude, updated_at: timestamp ? new Date(timestamp) : new Date() },
            { new: true }
        );

        if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

        // Save to location history
        await LocationHistory.create({
            vehicle_id: vehicle.vehicle_id,
            incident_id: vehicle.incident_id,
            latitude,
            longitude,
            recorded_at: timestamp ? new Date(timestamp) : new Date(),
        });

        // Publish location event
        const locationPayload = {
            vehicle_id: vehicle.vehicle_id,
            incident_id: vehicle.incident_id,
            unit_type: vehicle.unit_type,
            latitude,
            longitude,
            timestamp: new Date().toISOString(),
        };
        publish('dispatch.vehicle.location', locationPayload);

        // Broadcast via WebSocket
        if (ioInstance) {
            ioInstance.emit('vehicle_location_update', locationPayload);
            if (vehicle.incident_id) {
                ioInstance.to(`incident:${vehicle.incident_id}`).emit('vehicle_location_update', locationPayload);
            }
        }

        res.json({ success: true, data: { vehicle_id: vehicle.vehicle_id, latitude, longitude } });
    } catch (err) {
        next(err);
    }
}

// GET /vehicles/:id/history
async function getVehicleHistory(req, res, next) {
    try {
        const { from, to, limit = 100 } = req.query;
        const filter = { vehicle_id: req.params.id };
        if (from || to) {
            filter.recorded_at = {};
            if (from) filter.recorded_at.$gte = new Date(from);
            if (to) filter.recorded_at.$lte = new Date(to);
        }

        const history = await LocationHistory.find(filter)
            .sort({ recorded_at: -1 })
            .limit(parseInt(limit));

        res.json({ success: true, data: history });
    } catch (err) {
        next(err);
    }
}

// PUT /vehicles/:id/status
async function updateVehicleStatus(req, res, next) {
    try {
        const { status } = req.body;
        const validStatuses = ['idle', 'dispatched', 'en_route', 'on_scene', 'returning'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const vehicle = await Vehicle.findOneAndUpdate(
            { vehicle_id: req.params.id },
            { status, updated_at: new Date() },
            { new: true }
        );

        if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

        // If arrived on scene, publish event
        if (status === 'on_scene') {
            publish('dispatch.vehicle.arrived', {
                vehicle_id: vehicle.vehicle_id,
                incident_id: vehicle.incident_id,
                latitude: vehicle.latitude,
                longitude: vehicle.longitude,
                arrived_at: new Date().toISOString(),
            });
        }

        if (ioInstance) {
            ioInstance.emit('vehicle_status_update', { vehicle_id: vehicle.vehicle_id, status });
        }

        res.json({ success: true, data: vehicle });
    } catch (err) {
        next(err);
    }
}

// GET /incidents/:incidentId/vehicle
async function getVehicleForIncident(req, res, next) {
    try {
        const vehicle = await Vehicle.findOne({ incident_id: req.params.incidentId });
        if (!vehicle) return res.status(404).json({ success: false, message: 'No vehicle found for this incident' });
        res.json({ success: true, data: vehicle });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    registerVehicle, listVehicles, getVehicle, getVehicleLocation,
    updateVehicleLocation, getVehicleHistory, updateVehicleStatus, getVehicleForIncident,
    setIo
};
