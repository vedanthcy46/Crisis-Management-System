const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth, verifyToken, checkRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Get MySQL pool from app
const getMySQLPool = (req) => req.app.get('mysqlPool');

// Validation middleware
const validateRegistration = [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    body('phone').optional().trim(),
    body('role').isIn(['user', 'rescue_team']).withMessage('Invalid role')
];

const validateLogin = [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
];

// Check if email exists
router.post('/check-email', [
    body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email } = req.body;

        // Check if email exists in users table
        const [existingUser] = await req.db.execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        res.json({ exists: existingUser.length > 0 });
    } catch (error) {
        console.error('Check email error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Register new user
router.post('/register', async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, email, password, phone, role } = req.body;

        // Check if user already exists
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        // Create new user
        const userId = await User.create({ name, email, password, phone, role });
        const user = await User.findById(userId);

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Error registering user' });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;
        console.log('Login attempt for email:', email);

        const result = await User.authenticate(email, password);

        if (!result) {
            console.log('Authentication failed');
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const { user, token } = result;
        console.log('Authenticated user:', { ...user, password: '[HIDDEN]' });

        // Double-check the rescue team ID
        if (user.role === 'rescue_team') {
            const [teams] = await req.db.execute(
                'SELECT id FROM rescue_teams WHERE email = ?',
                [email]
            );

            if (teams && teams.length > 0) {
                console.log('Confirmed rescue team ID:', teams[0].id);
                user.id = teams[0].id;  // Ensure we're using the rescue team's ID
            }
        }

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Error during login' });
    }
});

// Get user profile
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                status: user.status,
                created_at: user.created_at
            }
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ message: 'Error fetching profile' });
    }
});

// Update user profile
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const updates = {
            name: req.body.name,
            phone: req.body.phone
        };

        const success = await User.updateProfile(req.user.id, updates);
        if (!success) {
            return res.status(400).json({ message: 'No valid updates provided' });
        }

        const updatedUser = await User.findById(req.user.id);
        res.json({
            message: 'Profile updated successfully',
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone,
                role: updatedUser.role,
                status: updatedUser.status
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: 'Error updating profile' });
    }
});

// Reset password (temporary route for fixing the issue)
router.post('/reset-rescue-password', async (req, res) => {
    try {
        const email = 'rescue1@crisis360.com';
        const newPassword = 'rescue123';

        // Find the user
        const user = await User.findByEmail(email);
        if (!user) {
            console.error('User not found:', email);
            return res.status(404).json({ message: 'User not found' });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the password in the database using req.db
        const [result] = await req.db.execute(
            'UPDATE users SET password = ? WHERE email = ?',
            [hashedPassword, email]
        );

        if (result.affectedRows === 0) {
            console.error('No rows updated');
            return res.status(500).json({ message: 'Failed to update password' });
        }

        console.log('Password reset successful for user:', email);
        res.json({ message: 'Password reset successful' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ message: 'Error resetting password' });
    }
});

// Sync rescue team ID with user ID
router.post('/sync-rescue-team', verifyToken, async (req, res) => {
    const connection = await req.db.getConnection();
    try {
        await connection.beginTransaction();

        // Get user details
        const [users] = await connection.execute(
            'SELECT id, name, email FROM users WHERE id = ? AND role = "rescue_team"',
            [req.user.id]
        );

        if (!users || users.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Rescue team user not found' });
        }

        const user = users[0];
        console.log('Found user:', user);

        // Check if rescue team exists
        const [teams] = await connection.execute(
            'SELECT id, email FROM rescue_teams WHERE email = ?',
            [user.email]
        );

        // If team doesn't exist, create it
        if (!teams || teams.length === 0) {
            console.log('Creating new rescue team for user:', user.id);

            // Create rescue team entry
            await connection.execute(
                'INSERT INTO rescue_teams (id, name, email, type, status) VALUES (?, ?, ?, ?, ?)',
                [user.id, user.name, user.email, 'medical', 'active']
            );

            await connection.commit();
            return res.json({
                message: 'Rescue team created successfully',
                new_id: user.id
            });
        }

        const team = teams[0];
        console.log('Found existing team:', team);

        // If IDs don't match, update rescue team and related records
        if (team.id !== user.id) {
            console.log(`Syncing team ID from ${team.id} to ${user.id}`);

            // Update rescue team ID
            await connection.execute(
                'UPDATE rescue_teams SET id = ? WHERE id = ?',
                [user.id, team.id]
            );

            // Update incident assignments
            await connection.execute(
                'UPDATE incident_assignments SET team_id = ? WHERE team_id = ?',
                [user.id, team.id]
            );

            // Update notifications
            await connection.execute(
                'UPDATE notifications SET user_id = ? WHERE user_id = ? AND user_role = "rescue_team"',
                [user.id, team.id]
            );

            await connection.commit();

            res.json({
                message: 'Team ID synchronized successfully',
                old_id: team.id,
                new_id: user.id
            });
        } else {
            await connection.commit();
            res.json({
                message: 'Team ID already synchronized',
                old_id: team.id,
                new_id: user.id
            });
        }
    } catch (error) {
        await connection.rollback();
        console.error('Sync rescue team error:', error);
        res.status(500).json({ message: 'Error syncing team ID', error: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router; 