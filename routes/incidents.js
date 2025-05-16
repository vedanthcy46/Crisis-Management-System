const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const fs = require('fs');

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'public/uploads/incidents';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Report new incident
router.post('/', verifyToken, upload.array('images', 5), async (req, res) => {
    const connection = await req.db.getConnection();
    try {
        await connection.beginTransaction();
        console.log('Creating new incident for user:', req.user.id);
        console.log('Request body:', req.body);
        console.log('Uploaded files:', req.files);

        const { type, description, latitude, longitude } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!type || !description || !latitude || !longitude) {
            throw new Error('Missing required fields');
        }

        // Insert incident
        const [result] = await connection.execute(
            'INSERT INTO incidents (user_id, type, description, latitude, longitude, status) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, type, description, latitude, longitude, 'pending']
        );

        const incidentId = result.insertId;
        console.log('Created incident with ID:', incidentId);

        // Handle image uploads
        if (req.files && req.files.length > 0) {
            const imageValues = req.files.map(file => [incidentId, file.filename]);
            await connection.query(
                'INSERT INTO incident_images (incident_id, filename) VALUES ?',
                [imageValues]
            );
            console.log('Saved images:', imageValues);
        }

        // Find nearest rescue teams
        const [teams] = await connection.execute(`
            SELECT *, 
            (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) + sin(radians(?)) * sin(radians(latitude)))) AS distance
            FROM rescue_teams
            WHERE status = 'active'
            AND type = ?
            HAVING distance < 10
            ORDER BY distance
            LIMIT 3
        `, [latitude, longitude, latitude, type]);

        console.log('Found nearby teams:', teams);

        // Assign rescue teams
        if (teams.length > 0) {
            const assignmentValues = teams.map(team => [incidentId, team.id]);
            await connection.query(
                'INSERT INTO incident_assignments (incident_id, team_id) VALUES ?',
                [assignmentValues]
            );

            // Create notifications for rescue teams
            const notificationValues = teams.map(team => [
                team.id,
                'New Emergency Incident',
                `New ${type} incident reported near your location. Please respond immediately.`,
                'incident'
            ]);
            await connection.query(
                'INSERT INTO notifications (user_id, title, message, type) VALUES ?',
                [notificationValues]
            );
        }

        await connection.commit();

        // Fetch the created incident with all details
        const [incident] = await req.db.execute(`
            SELECT i.*, 
                   GROUP_CONCAT(DISTINCT ii.filename) as images,
                   GROUP_CONCAT(DISTINCT rt.name) as assigned_teams
            FROM incidents i
            LEFT JOIN incident_images ii ON i.id = ii.incident_id
            LEFT JOIN incident_assignments ia ON i.id = ia.incident_id
            LEFT JOIN rescue_teams rt ON ia.team_id = rt.id
            WHERE i.id = ?
            GROUP BY i.id
        `, [incidentId]);

        const processedIncident = {
            ...incident,
            images: incident.images ? incident.images.split(',') : [],
            assigned_teams: incident.assigned_teams ? incident.assigned_teams.split(',') : []
        };

        res.status(201).json({
            message: 'Incident reported successfully',
            incident: processedIncident
        });
    } catch (error) {
        await connection.rollback();
        console.error('Create incident error:', error);
        console.error('Error stack:', error.stack);

        // Clean up uploaded files if there was an error
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                } catch (unlinkError) {
                    console.error('Error deleting file:', unlinkError);
                }
            });
        }

        res.status(500).json({
            message: 'Error creating incident report',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
});

// Get user's reports
router.get('/my-reports', verifyToken, async (req, res) => {
    try {
        console.log('Fetching reports for user:', req.user.id);
        console.log('User object:', req.user);

        // Set headers to prevent caching
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
        });

        // First, check if user has any incidents
        const [userIncidents] = await req.db.execute(
            'SELECT COUNT(*) as count FROM incidents WHERE user_id = ?',
            [req.user.id]
        );
        console.log('User incidents count:', userIncidents[0].count);

        if (userIncidents[0].count === 0) {
            console.log('No incidents found for user');
            return res.json({ incidents: [] });
        }

        // Get all incidents in a single query with proper GROUP BY
        const [incidents] = await req.db.execute(`
            SELECT 
                i.*,
                GROUP_CONCAT(DISTINCT ii.filename) as image_files,
                GROUP_CONCAT(DISTINCT rt.name) as assigned_teams,
                u.name as reporter_name
            FROM incidents i
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN incident_images ii ON i.id = ii.incident_id
            LEFT JOIN incident_assignments ia ON i.id = ia.incident_id
            LEFT JOIN rescue_teams rt ON ia.team_id = rt.id
            WHERE i.user_id = ?
            GROUP BY 
                i.id, 
                i.user_id, 
                i.type, 
                i.description, 
                i.latitude, 
                i.longitude, 
                i.status, 
                i.created_at, 
                i.updated_at,
                u.name
            ORDER BY i.created_at DESC
        `, [req.user.id]);

        console.log('Found incidents:', incidents.length);

        // Process the incidents
        const processedIncidents = incidents.map(incident => ({
            ...incident,
            images: incident.image_files ? incident.image_files.split(',') : [],
            assigned_teams: incident.assigned_teams ? incident.assigned_teams.split(',') : []
        }));

        console.log('Total processed incidents:', processedIncidents.length);
        console.log('Final response:', { incidents: processedIncidents });

        res.json({ incidents: processedIncidents });
    } catch (error) {
        console.error('Get user reports error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            message: 'Error fetching reports',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get user's incidents
router.get('/user', verifyToken, async (req, res) => {
    try {
        console.log('Fetching incidents for user:', req.user.id);
        const [incidents] = await req.db.execute(`
            SELECT i.*, 
            GROUP_CONCAT(DISTINCT ii.filename) as images,
            GROUP_CONCAT(DISTINCT rt.name) as assigned_teams,
            COUNT(DISTINCT ia.id) as assignment_count
            FROM incidents i
            LEFT JOIN incident_images ii ON i.id = ii.incident_id
            LEFT JOIN incident_assignments ia ON i.id = ia.incident_id
            LEFT JOIN rescue_teams rt ON ia.team_id = rt.id
            WHERE i.user_id = ?
            GROUP BY i.id
            ORDER BY i.created_at DESC
        `, [req.user.id]);

        // Format the response
        const formattedIncidents = incidents.map(incident => ({
            ...incident,
            images: incident.images ? incident.images.split(',') : [],
            assigned_teams: incident.assigned_teams ? incident.assigned_teams.split(',') : []
        }));

        res.json({
            incidents: formattedIncidents,
            total: formattedIncidents.length
        });
    } catch (error) {
        console.error('Get user incidents error:', error);
        res.status(500).json({
            message: 'Error fetching user incidents',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get incident details
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const [incident] = await req.db.execute(`
            SELECT i.*, u.name as reporter_name, 
            GROUP_CONCAT(DISTINCT ii.filename) as images,
            GROUP_CONCAT(DISTINCT rt.name) as assigned_teams
            FROM incidents i
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN incident_images ii ON i.id = ii.incident_id
            LEFT JOIN incident_assignments ia ON i.id = ia.incident_id
            LEFT JOIN rescue_teams rt ON ia.team_id = rt.id
            WHERE i.id = ?
            GROUP BY i.id
        `, [req.params.id]);

        if (!incident) {
            return res.status(404).json({ message: 'Incident not found' });
        }

        // Format response
        incident.images = incident.images ? incident.images.split(',') : [];
        incident.assigned_teams = incident.assigned_teams ? incident.assigned_teams.split(',') : [];

        res.json({ incident });
    } catch (error) {
        console.error('Get incident error:', error);
        res.status(500).json({ message: 'Error fetching incident details' });
    }
});

// Update incident status
router.put('/:id/status', verifyToken, async (req, res) => {
    try {
        const { status } = req.body;
        const incidentId = req.params.id;

        // Verify user has permission
        const [incident] = await req.db.execute(
            'SELECT user_id FROM incidents WHERE id = ?',
            [incidentId]
        );

        if (!incident) {
            return res.status(404).json({ message: 'Incident not found' });
        }

        if (req.user.role !== 'admin' && req.user.role !== 'rescue_team' && incident.user_id !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to update this incident' });
        }

        // Update status
        await req.db.execute(
            'UPDATE incidents SET status = ? WHERE id = ?',
            [status, incidentId]
        );

        // Notify user
        if (incident.user_id) {
            await req.db.execute(
                'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                [
                    incident.user_id,
                    'Incident Status Update',
                    `Your reported incident has been updated to: ${status}`,
                    'status'
                ]
            );
        }

        res.json({ message: 'Incident status updated successfully' });
    } catch (error) {
        console.error('Update incident status error:', error);
        res.status(500).json({ message: 'Error updating incident status' });
    }
});

// List incidents
router.get('/', verifyToken, async (req, res) => {
    try {
        console.log('Fetching incidents with query params:', req.query);
        const { status, type, limit = 10, offset = 0 } = req.query;
        let query = `
            SELECT i.*, u.name as reporter_name,
            COUNT(DISTINCT ii.id) as image_count,
            COUNT(DISTINCT ia.id) as assignment_count
            FROM incidents i
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN incident_images ii ON i.id = ii.incident_id
            LEFT JOIN incident_assignments ia ON i.id = ia.incident_id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ' AND i.status = ?';
            params.push(status);
        }
        if (type) {
            query += ' AND i.type = ?';
            params.push(type);
        }

        // Add role-based filtering
        if (req.user.role === 'user') {
            query += ' AND i.user_id = ?';
            params.push(req.user.id);
        } else if (req.user.role === 'rescue_team') {
            query += ' AND ia.team_id = ?';
            params.push(req.user.id);
        }

        query += ' GROUP BY i.id ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        console.log('Executing query:', query);
        console.log('With parameters:', params);

        const [incidents] = await req.db.execute(query, params);
        console.log(`Found ${incidents.length} incidents`);

        res.json({
            incidents,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: incidents.length
            }
        });
    } catch (error) {
        console.error('List incidents error:', error);
        res.status(500).json({
            message: 'Error fetching incidents',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Debug endpoint to check database state
router.get('/debug/check-db', verifyToken, async (req, res) => {
    try {
        console.log('Checking database state for user:', req.user.id);

        // Check incidents table
        const [incidents] = await req.db.execute(`
            SELECT i.*, u.name as reporter_name
            FROM incidents i
            LEFT JOIN users u ON i.user_id = u.id
            WHERE i.user_id = ?
        `, [req.user.id]);

        // Check incident_images table
        const [images] = await req.db.execute(`
            SELECT ii.*
            FROM incident_images ii
            JOIN incidents i ON ii.incident_id = i.id
            WHERE i.user_id = ?
        `, [req.user.id]);

        // Check incident_assignments table
        const [assignments] = await req.db.execute(`
            SELECT ia.*, rt.name as team_name
            FROM incident_assignments ia
            JOIN incidents i ON ia.incident_id = i.id
            JOIN rescue_teams rt ON ia.team_id = rt.id
            WHERE i.user_id = ?
        `, [req.user.id]);

        res.json({
            user_id: req.user.id,
            incidents: incidents,
            images: images,
            assignments: assignments,
            tables: {
                incidents: incidents.length,
                images: images.length,
                assignments: assignments.length
            }
        });
    } catch (error) {
        console.error('Database check error:', error);
        res.status(500).json({
            message: 'Error checking database',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;