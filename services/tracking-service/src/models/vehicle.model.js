const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
    vehicle_id: { type: String, required: true, unique: true },
    unit_type: { type: String, enum: ['ambulance', 'police', 'fire'], required: true },
    station_id: { type: String, required: true },
    incident_id: { type: String, default: null },
    driver_name: { type: String, required: true },
    driver_user_id: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    status: {
        type: String,
        enum: ['idle', 'dispatched', 'en_route', 'on_scene', 'returning'],
        default: 'idle',
    },
    updated_at: { type: Date, default: Date.now },
});

const locationHistorySchema = new mongoose.Schema({
    vehicle_id: { type: String, required: true, index: true },
    incident_id: { type: String, default: null, index: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    recorded_at: { type: Date, default: Date.now },
});

// TTL index: auto-delete location history older than 30 days
locationHistorySchema.index({ recorded_at: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Vehicle = mongoose.model('Vehicle', vehicleSchema);
const LocationHistory = mongoose.model('LocationHistory', locationHistorySchema);

module.exports = { Vehicle, LocationHistory };
