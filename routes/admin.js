const express = require('express');
const { body, validationResult } = require('express-validator');
const { verifyToken, checkRole } = require('../middleware/auth');
const User = require('../models/User');
const Incident = require('../models/Incident');
const bcrypt = require('bcryptjs');
const router = express.Router();

// Create rescue team
router.post('/rescue-teams', verifyToken, checkRole(['admin']), [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('team_area').trim().notEmpty().withMessage('Team area is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, email, password, team_area, type } = req.body;

        // Check if email already exists
        const [existingUser] = await req.db.execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (existingUser && existingUser.length > 0) {
            return res.status(400).json({
                message: 'A user with this email already exists',
                code: 'EMAIL_EXISTS'
            });
        }

        // Start transaction
        const connection = await req.db.getConnection();
        await connection.beginTransaction();

        try {
            // Create user first
            const hashedPassword = await bcrypt.hash(password, 10);
            const [userResult] = await connection.execute(
                'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
                [name, email, hashedPassword, 'rescue_team']
            );

            // Create rescue team with the same ID as the user
            await connection.execute(
                'INSERT INTO rescue_teams (id, name, email, phone, type, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [userResult.insertId, name, email, '0000000000', type || 'medical', 0, 0]
            );

            await connection.commit();
            res.status(201).json({ message: 'Rescue team created successfully' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Create rescue team error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all rescue teams
router.get('/rescue-teams', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const [teams] = await req.db.execute(`
            SELECT rt.*,
                   COUNT(DISTINCT ia.incident_id) as active_incidents
            FROM rescue_teams rt
            LEFT JOIN incident_assignments ia ON rt.id = ia.team_id
            LEFT JOIN incidents i ON ia.incident_id = i.id 
            WHERE i.status IS NULL OR i.status IN ('assigned', 'in_progress')
            GROUP BY rt.id
            ORDER BY rt.created_at DESC
        `);
        res.json(teams);
    } catch (error) {
        console.error('Get rescue teams error:', error);
        res.status(500).json({ message: 'Error fetching rescue teams' });
    }
});

// Update rescue team status
router.put('/rescue-teams/:id/status', verifyToken, checkRole(['admin']), [
    body('status').isIn(['active', 'inactive']).withMessage('Invalid status')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { status } = req.body;
        const rescueId = req.params.id;

        await req.db.execute(
            'UPDATE rescue_teams SET status = ? WHERE id = ?',
            [status, rescueId]
        );

        res.json({ message: 'Status updated successfully' });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get dashboard statistics
router.get('/dashboard', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        // Get incident statistics
        const [incidents] = await req.db.execute(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
            FROM incidents
        `);

        // Get rescue team statistics
        const [teams] = await req.db.execute(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
            FROM rescue_teams
        `);

        // Get recent incidents
        const [recentIncidents] = await req.db.execute(`
            SELECT 
                i.*, 
                u.name as user_name,
                GROUP_CONCAT(DISTINCT ii.filename) as images,
                rt.name as rescue_team_name
            FROM incidents i
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN incident_images ii ON i.id = ii.incident_id
            LEFT JOIN incident_assignments ia ON i.id = ia.incident_id
            LEFT JOIN rescue_teams rt ON ia.team_id = rt.id
            GROUP BY 
                i.id,
                i.user_id,
                i.type,
                i.description,
                i.status,
                i.latitude,
                i.longitude,
                i.created_at,
                i.updated_at,
                u.name,
                rt.name
            ORDER BY i.created_at DESC
            LIMIT 10
        `);

        // Process images for each incident
        const processedIncidents = recentIncidents.map(incident => ({
            ...incident,
            images: incident.images ? incident.images.split(',').map(filename => `/uploads/incidents/${filename}`) : []
        }));

        res.json({
            statistics: {
                incidents: incidents[0],
                teams: teams[0]
            },
            recentIncidents: processedIncidents
        });
    } catch (error) {
        console.error('Get dashboard error:', error);
        res.status(500).json({ message: 'Error fetching dashboard data' });
    }
});

// Reset user password
router.post('/reset-password', verifyToken, checkRole(['admin']), [
    body('email').isEmail().withMessage('Valid email is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, newPassword } = req.body;

        // Find user
        const [user] = await req.db.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (user.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await req.db.execute(
            'UPDATE users SET password = ? WHERE email = ?',
            [hashedPassword, email]
        );

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get filtered reports
router.get('/reports', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const { status, startDate, endDate } = req.query;

        const reports = await Incident.findAll(req.db, {
            status,
            startDate,
            endDate
        });

        res.json(reports);
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all incidents
router.get('/incidents', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const { status } = req.query;
        let query = `
            SELECT 
                i.*, 
                u.name as user_name,
                GROUP_CONCAT(DISTINCT ii.filename) as images,
                rt.name as rescue_team_name
            FROM incidents i
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN incident_images ii ON i.id = ii.incident_id
            LEFT JOIN incident_assignments ia ON i.id = ia.incident_id
            LEFT JOIN rescue_teams rt ON ia.team_id = rt.id
        `;

        const params = [];
        if (status) {
            query += ' WHERE i.status = ?';
            params.push(status);
        }

        query += ` GROUP BY 
                i.id,
                i.user_id,
                i.type,
                i.description,
                i.status,
                i.latitude,
                i.longitude,
                i.created_at,
                i.updated_at,
                u.name,
                rt.name
            ORDER BY i.created_at DESC`;

        const [incidents] = await req.db.execute(query, params);

        // Process images for each incident
        const processedIncidents = incidents.map(incident => ({
            ...incident,
            images: incident.images ? incident.images.split(',').map(filename => `/uploads/incidents/${filename}`) : []
        }));

        res.json(processedIncidents);
    } catch (error) {
        console.error('Get incidents error:', error);
        res.status(500).json({ message: 'Error fetching incidents' });
    }
});

// Get incident details
router.get('/incidents/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const [incidents] = await req.db.execute(`
            SELECT 
                i.id,
                i.user_id,
                i.type,
                i.description,
                i.status,
                i.latitude,
                i.longitude,
                i.created_at,
                i.updated_at,
                u.name as user_name,
                GROUP_CONCAT(DISTINCT ii.filename) as images,
                GROUP_CONCAT(DISTINCT rt.name) as rescue_team_name
            FROM incidents i
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN incident_images ii ON i.id = ii.incident_id
            LEFT JOIN incident_assignments ia ON i.id = ia.incident_id
            LEFT JOIN rescue_teams rt ON ia.team_id = rt.id
            WHERE i.id = ?
            GROUP BY 
                i.id, 
                i.user_id,
                i.type,
                i.description,
                i.status,
                i.latitude,
                i.longitude,
                i.created_at,
                i.updated_at,
                u.name
        `, [req.params.id]);

        console.log('Found incident:', incidents[0]); // Debug log

        if (!incidents || incidents.length === 0) {
            return res.status(404).json({ message: 'Incident not found' });
        }

        const incident = incidents[0];

        // Process images and team names
        const processedIncident = {
            id: incident.id,
            type: incident.type,
            description: incident.description,
            status: incident.status,
            latitude: parseFloat(incident.latitude) || null,
            longitude: parseFloat(incident.longitude) || null,
            created_at: incident.created_at,
            updated_at: incident.updated_at,
            user_name: incident.user_name,
            images: incident.images ? incident.images.split(',').map(filename => `/uploads/incidents/${filename}`) : [],
            rescue_team_name: incident.rescue_team_name ? incident.rescue_team_name.split(',')[0] : null
        };

        console.log('Processed incident:', processedIncident); // Debug log
        res.json(processedIncident);
    } catch (error) {
        console.error('Get incident details error:', error);
        res.status(500).json({ message: 'Error fetching incident details' });
    }
});

// Assign team to incident
router.post('/incidents/:id/assign', verifyToken, checkRole(['admin']), async (req, res) => {
    const connection = await req.db.getConnection();
    try {
        await connection.beginTransaction();

        const { team_id } = req.body;
        const incidentId = req.params.id;

        // Verify incident exists
        const [incident] = await connection.execute(
            'SELECT * FROM incidents WHERE id = ?',
            [incidentId]
        );

        if (!incident[0]) {
            await connection.rollback();
            return res.status(404).json({ message: 'Incident not found' });
        }

        // Verify team exists and is active
        const [team] = await connection.execute(
            'SELECT * FROM rescue_teams WHERE id = ? AND status = "active"',
            [team_id]
        );

        if (!team[0]) {
            await connection.rollback();
            return res.status(404).json({ message: 'Rescue team not found or inactive' });
        }

        // Check if assignment already exists
        const [existing] = await connection.execute(
            'SELECT * FROM incident_assignments WHERE incident_id = ? AND team_id = ?',
            [incidentId, team_id]
        );

        if (existing[0]) {
            await connection.rollback();
            return res.status(400).json({ message: 'Team already assigned to this incident' });
        }

        // Create assignment
        await connection.execute(
            'INSERT INTO incident_assignments (incident_id, team_id) VALUES (?, ?)',
            [incidentId, team_id]
        );

        // Update incident status
        await connection.execute(
            'UPDATE incidents SET status = "assigned" WHERE id = ?',
            [incidentId]
        );

        // Create notification for rescue team
        await connection.execute(
            'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [
                team_id,
                'New Assignment',
                `You have been assigned to incident #${incidentId}`,
                'assignment'
            ]
        );

        await connection.commit();
        res.json({ message: 'Team assigned successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Assign team error:', error);
        res.status(500).json({ message: 'Error assigning team' });
    } finally {
        connection.release();
    }
});

// Delete rescue team
router.delete('/rescue-teams/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    const connection = await req.db.getConnection();
    try {
        await connection.beginTransaction();

        const teamId = req.params.id;

        // Check if team has active assignments
        const [activeAssignments] = await connection.execute(`
            SELECT COUNT(*) as count 
            FROM incident_assignments ia
            JOIN incidents i ON ia.incident_id = i.id
            WHERE ia.team_id = ? AND i.status IN ('assigned', 'in_progress')
        `, [teamId]);

        if (activeAssignments[0].count > 0) {
            await connection.rollback();
            return res.status(400).json({
                message: 'Cannot delete team with active assignments. Please reassign or complete their incidents first.'
            });
        }

        // Delete team's notifications
        await connection.execute(
            'DELETE FROM notifications WHERE user_id = ?',
            [teamId]
        );

        // Delete team's assignments
        await connection.execute(
            'DELETE FROM incident_assignments WHERE team_id = ?',
            [teamId]
        );

        // Delete team
        await connection.execute(
            'DELETE FROM rescue_teams WHERE id = ?',
            [teamId]
        );

        await connection.commit();
        res.json({ message: 'Rescue team deleted successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Delete team error:', error);
        res.status(500).json({ message: 'Error deleting rescue team' });
    } finally {
        connection.release();
    }
});

// Get team details
router.get('/rescue-teams/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const [teams] = await req.db.execute(`
            SELECT 
                rt.id,
                rt.name,
                rt.email,
                rt.type,
                rt.status,
                rt.latitude,
                rt.longitude,
                rt.created_at,
                COUNT(DISTINCT CASE WHEN i.status IN ('assigned', 'in_progress') THEN i.id END) as active_incidents,
                COUNT(DISTINCT i.id) as total_incidents,
                GROUP_CONCAT(DISTINCT 
                    CASE 
                        WHEN i.status IN ('assigned', 'in_progress') 
                        THEN JSON_OBJECT('id', i.id, 'type', i.type, 'status', i.status)
                    END
                ) as active_cases
            FROM rescue_teams rt
            LEFT JOIN incident_assignments ia ON rt.id = ia.team_id
            LEFT JOIN incidents i ON ia.incident_id = i.id
            WHERE rt.id = ?
            GROUP BY 
                rt.id,
                rt.name,
                rt.email,
                rt.type,
                rt.status,
                rt.latitude,
                rt.longitude,
                rt.created_at
        `, [req.params.id]);

        console.log('Found team:', teams[0]); // Debug log

        if (!teams || teams.length === 0) {
            return res.status(404).json({ message: 'Rescue team not found' });
        }

        const team = teams[0];

        // Process the team data
        const processedTeam = {
            id: team.id,
            name: team.name,
            email: team.email,
            type: team.type,
            status: team.status,
            latitude: parseFloat(team.latitude) || null,
            longitude: parseFloat(team.longitude) || null,
            created_at: team.created_at,
            active_incidents: parseInt(team.active_incidents) || 0,
            total_incidents: parseInt(team.total_incidents) || 0,
            active_cases: team.active_cases
                ? team.active_cases.split(',')
                    .filter(Boolean)
                    .map(caseStr => {
                        try {
                            return JSON.parse(caseStr);
                        } catch (e) {
                            return null;
                        }
                    })
                    .filter(Boolean)
                : []
        };

        console.log('Processed team:', processedTeam); // Debug log
        res.json(processedTeam);
    } catch (error) {
        console.error('Get team details error:', error);
        res.status(500).json({ message: 'Error fetching team details' });
    }
});

module.exports = router; 