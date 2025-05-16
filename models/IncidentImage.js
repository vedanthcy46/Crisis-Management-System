const mongoose = require('mongoose');

const incidentImageSchema = new mongoose.Schema({
    report_id: {
        type: String,
        required: true,
        index: true
    },
    image_url: {
        type: String,
        required: true
    },
    binary_data: {
        type: Buffer,
        required: true
    },
    contentType: {
        type: String,
        required: true
    },
    created_at: {
        type: Date,
        default: Date.now
    }
});

// Create indexes for better performance
incidentImageSchema.index({ report_id: 1 });
incidentImageSchema.index({ created_at: -1 });

module.exports = mongoose.model('IncidentImage', incidentImageSchema); 