const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middleware/auth');

// Get all rescue teams
router.get('/', verifyToken, async (req, res) => {
    try {
        const [teams] = await req.db.execute(`
            SELECT id, name, type, status, latitude, longitude,
            (SELECT COUNT(*) FROM incident_assignments WHERE team_id = rescue_teams.id) as active_incidents
            FROM rescue_teams
            WHERE status != 'inactive'
            ORDER BY name
        `);

        res.json({ teams });
    } catch (error) {
        console.error('Get teams error:', error);
        res.status(500).json({ message: 'Error fetching rescue teams' });
    }
});

// Get rescue team details
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const [team] = await req.db.execute(`
            SELECT rt.*, 
            (
                SELECT COUNT(*) 
                FROM incident_assignments ia 
                JOIN incidents i ON ia.incident_id = i.id 
                WHERE ia.team_id = rt.id AND i.status = 'in_progress'
            ) as active_incidents,
            (
                SELECT COUNT(*) 
                FROM incident_assignments ia 
                JOIN incidents i ON ia.incident_id = i.id 
                WHERE ia.team_id = rt.id AND i.status = 'resolved'
            ) as completed_incidents
            FROM rescue_teams rt
            WHERE rt.id = ?
        `, [req.params.id]);

        if (!team) {
            return res.status(404).json({ message: 'Rescue team not found' });
        }

        // Get current assignments
        const [assignments] = await req.db.execute(`
            SELECT i.id, i.type, i.description, i.status, i.latitude, i.longitude,
            i.created_at, u.name as reporter_name
            FROM incidents i
            JOIN incident_assignments ia ON i.id = ia.incident_id
            JOIN users u ON i.user_id = u.id
            WHERE ia.team_id = ? AND i.status IN ('assigned', 'in_progress')
            ORDER BY i.created_at DESC
        `, [req.params.id]);

        team.current_assignments = assignments;

        res.json({ team });
    } catch (error) {
        console.error('Get team details error:', error);
        res.status(500).json({ message: 'Error fetching team details' });
    }
});

// Update rescue team status
router.put('/:id/status', verifyToken, checkRole(['admin', 'rescue_team']), async (req, res) => {
    try {
        const { status } = req.body;
        const teamId = req.params.id;

        // Verify team exists and user has permission
        const [team] = await req.db.execute(
            'SELECT id FROM rescue_teams WHERE id = ?',
            [teamId]
        );

        if (!team) {
            return res.status(404).json({ message: 'Rescue team not found' });
        }

        if (req.user.role !== 'admin' && req.user.id !== teamId) {
            return res.status(403).json({ message: 'Not authorized to update this team' });
        }

        // Update status
        await req.db.execute(
            'UPDATE rescue_teams SET status = ? WHERE id = ?',
            [status, teamId]
        );

        res.json({ message: 'Team status updated successfully' });
    } catch (error) {
        console.error('Update team status error:', error);
        res.status(500).json({ message: 'Error updating team status' });
    }
});

// Update rescue team location
router.put('/:id/location', verifyToken, checkRole(['rescue_team']), async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        const teamId = req.params.id;

        if (req.user.id !== parseInt(teamId)) {
            return res.status(403).json({ message: 'Not authorized to update this team location' });
        }

        await req.db.execute(
            'UPDATE rescue_teams SET latitude = ?, longitude = ? WHERE id = ?',
            [latitude, longitude, teamId]
        );

        res.json({ message: 'Location updated successfully' });
    } catch (error) {
        console.error('Update location error:', error);
        res.status(500).json({ message: 'Error updating location' });
    }
});

// Get team's incident history
router.get('/:id/history', verifyToken, checkRole(['admin', 'rescue_team']), async (req, res) => {
    try {
        const { limit = 10, offset = 0, status = 'resolved' } = req.query;
        const teamId = req.params.id;

        // First verify the team exists with either ID
        const [teams] = await req.db.execute(`
            SELECT DISTINCT rt.* 
            FROM rescue_teams rt
            LEFT JOIN users u ON u.email = rt.email
            WHERE rt.id = ? OR rt.email = (
                SELECT email FROM users WHERE id = ?
            )
        `, [teamId, teamId]);

        if (!teams || teams.length === 0) {
            console.log('Team not found for ID:', teamId);
            return res.status(404).json({ message: 'Rescue team not found' });
        }

        const team = teams[0];
        console.log('Found team:', team);

        // If we found the team but IDs don't match, sync them
        if (team.id !== parseInt(teamId)) {
            const connection = await req.db.getConnection();
            await connection.beginTransaction();

            try {
                console.log('Syncing team ID from', team.id, 'to', teamId);
                // Update rescue team ID
                await connection.execute(
                    'UPDATE rescue_teams SET id = ? WHERE id = ?',
                    [teamId, team.id]
                );

                // Update related records
                await connection.execute(
                    'UPDATE incident_assignments SET team_id = ? WHERE team_id = ?',
                    [teamId, team.id]
                );

                await connection.execute(
                    'UPDATE notifications SET user_id = ? WHERE user_id = ? AND user_role = "rescue_team"',
                    [teamId, team.id]
                );

                await connection.commit();
                team.id = parseInt(teamId);
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        }

        // Get incidents
        let query = `
            SELECT 
                i.*,
                u.name as reporter_name,
                COUNT(DISTINCT ii.id) as image_count,
                GROUP_CONCAT(DISTINCT ii.filename) as images
            FROM incidents i
            INNER JOIN incident_assignments ia ON i.id = ia.incident_id
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN incident_images ii ON i.id = ii.incident_id
            WHERE ia.team_id = ?
        `;
        const params = [teamId];

        if (status && status !== 'all') {
            query += ' AND i.status = ?';
            params.push(status);
        }

        query += `
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
            ORDER BY i.updated_at DESC
            LIMIT ? OFFSET ?
        `;
        params.push(parseInt(limit), parseInt(offset));

        console.log('Executing query with params:', params);
        const [incidents] = await req.db.execute(query, params);
        console.log('Found incidents:', incidents.length);

        // Process images for each incident
        const processedIncidents = incidents.map(incident => ({
            ...incident,
            images: incident.images ? incident.images.split(',').map(filename => `/uploads/incidents/${filename}`) : []
        }));

        // Get total count for pagination
        const [totalCount] = await req.db.execute(
            'SELECT COUNT(*) as total FROM incident_assignments WHERE team_id = ?',
            [teamId]
        );

        const response = {
            team: {
                id: team.id,
                name: team.name,
                email: team.email,
                type: team.type,
                status: team.status
            },
            incidents: processedIncidents || [],
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: totalCount[0].total
            }
        };

        console.log('Sending response:', response);
        res.json(response);
    } catch (error) {
        console.error('Get team history error:', error);
        res.status(500).json({ message: 'Error fetching team history', error: error.message });
    }
});

// Respond to incident assignment
router.post('/assignments/:id/respond', verifyToken, checkRole(['rescue_team']), async (req, res) => {
    try {
        const { status } = req.body;
        const assignmentId = req.params.id;

        // Verify assignment and permissions
        const [assignment] = await req.db.execute(`
            SELECT ia.*, i.user_id, i.type
            FROM incident_assignments ia
            JOIN incidents i ON ia.incident_id = i.id
            WHERE ia.id = ? AND ia.team_id = ?
        `, [assignmentId, req.user.id]);

        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        // Update assignment status
        await req.db.execute(
            'UPDATE incident_assignments SET status = ? WHERE id = ?',
            [status, assignmentId]
        );

        // Update incident status if accepted
        if (status === 'accepted') {
            await req.db.execute(
                'UPDATE incidents SET status = ? WHERE id = ?',
                ['in_progress', assignment.incident_id]
            );
        }

        // Create notification for incident reporter
        await req.db.execute(
            'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [
                assignment.user_id,
                'Rescue Team Response',
                `A rescue team has ${status} your ${assignment.type} incident report.`,
                'assignment'
            ]
        );

        res.json({ message: 'Response recorded successfully' });
    } catch (error) {
        console.error('Assignment response error:', error);
        res.status(500).json({ message: 'Error processing response' });
    }
});

// Get assigned incidents
router.get('/incidents', verifyToken, checkRole(['rescue_team']), async (req, res) => {
    try {
        // First verify the team exists
        const [team] = await req.db.execute(
            'SELECT id FROM rescue_teams WHERE id = ?',
            [req.user.id]
        );

        if (!team || team.length === 0) {
            return res.status(404).json({ message: 'Rescue team not found' });
        }

        const [incidents] = await req.db.execute(`
            SELECT 
                i.*, 
                ia.status as assignment_status,
                GROUP_CONCAT(DISTINCT ii.filename) as images,
                u.name as reporter_name
            FROM incidents i
            INNER JOIN incident_assignments ia ON i.id = ia.incident_id
            LEFT JOIN incident_images ii ON i.id = ii.incident_id
            LEFT JOIN users u ON i.user_id = u.id
            WHERE ia.team_id = ? AND i.status IN ('assigned', 'in_progress')
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
                ia.status,
                u.name
            ORDER BY i.created_at DESC
        `, [req.user.id]);

        // Process images for each incident
        const processedIncidents = incidents.map(incident => ({
            ...incident,
            images: incident.images ? incident.images.split(',').map(filename => `/uploads/incidents/${filename}`) : []
        }));

        res.json(processedIncidents);
    } catch (error) {
        console.error('Get assigned incidents error:', error);
        res.status(500).json({ message: 'Error fetching assigned incidents' });
    }
});

// Get rescue team profile
router.get('/profile', verifyToken, checkRole(['rescue_team']), async (req, res) => {
    try {
        // First verify the team exists with either ID
        const [teams] = await req.db.execute(`
            SELECT rt.*, 
                (SELECT COUNT(*) FROM incident_assignments WHERE team_id = rt.id) as total_cases,
                (SELECT COUNT(*) FROM incident_assignments ia 
                 INNER JOIN incidents i ON ia.incident_id = i.id 
                 WHERE ia.team_id = rt.id AND i.status = 'resolved') as resolved_cases,
                (SELECT COUNT(*) FROM incident_assignments ia 
                 INNER JOIN incidents i ON ia.incident_id = i.id 
                 WHERE ia.team_id = rt.id AND i.status IN ('assigned', 'in_progress')) as active_cases
            FROM rescue_teams rt
            WHERE rt.id = ? OR rt.email = (SELECT email FROM users WHERE id = ?)
        `, [req.user.id, req.user.id]);

        if (!teams || teams.length === 0) {
            return res.status(404).json({ message: 'Rescue team not found' });
        }

        // If we found the team but IDs don't match, sync them
        if (teams[0].id !== req.user.id) {
            await req.db.execute(
                'UPDATE rescue_teams SET id = ? WHERE id = ?',
                [req.user.id, teams[0].id]
            );
            teams[0].id = req.user.id;
        }

        res.json(teams[0]);
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ message: 'Error fetching profile', error: error.message });
    }
});

// Update rescue team availability
router.put('/availability', verifyToken, checkRole(['rescue_team']), async (req, res) => {
    try {
        const { status } = req.body;
        const teamId = req.user.id;

        // Validate status
        if (!['active', 'inactive', 'busy'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        await req.db.execute(
            'UPDATE rescue_teams SET status = ? WHERE id = ?',
            [status, teamId]
        );

        res.json({ message: 'Availability updated successfully' });
    } catch (error) {
        console.error('Update availability error:', error);
        res.status(500).json({ message: 'Error updating availability' });
    }
});

// Update rescue team profile
router.put('/:id/profile', verifyToken, checkRole(['rescue_team']), async (req, res) => {
    try {
        const teamId = req.params.id;
        const { service_area } = req.body;

        // Verify team exists with either ID
        const [team] = await req.db.execute(
            'SELECT id FROM rescue_teams WHERE id = ? OR email = (SELECT email FROM users WHERE id = ?)',
            [teamId, teamId]
        );

        if (!team || team.length === 0) {
            return res.status(404).json({ message: 'Rescue team not found' });
        }

        // If we found the team but IDs don't match, sync them
        if (team.id !== parseInt(teamId)) {
            await req.db.execute(
                'UPDATE rescue_teams SET id = ? WHERE id = ?',
                [teamId, team.id]
            );
            team.id = parseInt(teamId);
        }

        if (req.user.id !== parseInt(teamId)) {
            return res.status(403).json({ message: 'Not authorized to update this team profile' });
        }

        // Update profile
        await req.db.execute(
            'UPDATE rescue_teams SET service_area = ? WHERE id = ?',
            [service_area, teamId]
        );

        // Get updated team details
        const [updatedTeam] = await req.db.execute(
            'SELECT id, name, email, phone, type, status, service_area FROM rescue_teams WHERE id = ?',
            [teamId]
        );

        res.json({
            message: 'Profile updated successfully',
            team: updatedTeam[0]
        });
    } catch (error) {
        console.error('Update team profile error:', error);
        res.status(500).json({ message: 'Error updating team profile' });
    }
});

// Create rescue team
router.post('/', verifyToken, checkRole(['rescue_team']), async (req, res) => {
    try {
        const { name, email, phone, type, latitude, longitude } = req.body;

        // Check if team already exists
        const [existingTeam] = await req.db.execute(
            'SELECT id FROM rescue_teams WHERE email = ?',
            [email]
        );

        if (existingTeam.length > 0) {
            return res.status(400).json({
                message: 'A rescue team with this email already exists',
                code: 'TEAM_EXISTS'
            });
        }

        // Create rescue team with the same ID as the user
        await req.db.execute(
            'INSERT INTO rescue_teams (id, name, email, phone, type, latitude, longitude, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, name, email, phone, type || 'medical', latitude || 0, longitude || 0, 'active']
        );

        res.status(201).json({
            message: 'Rescue team created successfully',
            team: {
                id: req.user.id,
                name,
                email,
                type,
                status: 'active'
            }
        });
    } catch (error) {
        console.error('Create rescue team error:', error);
        res.status(500).json({
            message: 'Error creating rescue team',
            error: error.message
        });
    }
});

module.exports = router; 