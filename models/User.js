const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createMySQLPool } = require('../config/database');

const pool = createMySQLPool();

class User {
    static async create({ name, email, password, phone, role = 'user' }) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
            [name, email, hashedPassword, phone, role]
        );
        return result.insertId;
    }

    static async findByEmail(email) {
        console.log('Finding user by email:', email);
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
        console.log('Found user:', rows[0] ? { ...rows[0], password: '[HIDDEN]' } : null);
        return rows[0];
    }

    static async findById(id) {
        const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
        return rows[0];
    }

    static async authenticate(email, password) {
        const user = await this.findByEmail(email);
        if (!user) {
            console.log('User not found');
            return null;
        }

        console.log('Comparing passwords...');
        const isValid = await bcrypt.compare(password, user.password);
        console.log('Password valid:', isValid);

        if (!isValid) return null;

        // If this is a rescue team, get the correct team ID
        if (user.role === 'rescue_team') {
            const [teams] = await pool.execute(
                'SELECT id FROM rescue_teams WHERE email = ?',
                [email]
            );
            if (teams && teams.length > 0) {
                console.log('Found rescue team ID:', teams[0].id);
                // Update the rescue team ID to match the user ID if they don't match
                if (teams[0].id !== user.id) {
                    await pool.execute(
                        'UPDATE rescue_teams SET id = ? WHERE email = ?',
                        [user.id, email]
                    );
                    console.log('Synchronized rescue team ID with user ID');
                }
                user.id = user.id;  // Ensure we use the user ID consistently
            }
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'your_jwt_secret_key',
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        return { user, token };
    }

    static async updateProfile(id, updates) {
        const allowedUpdates = ['name', 'phone', 'status'];
        const updateFields = Object.keys(updates)
            .filter(key => allowedUpdates.includes(key) && updates[key] !== undefined)
            .map(key => `${key} = ?`);

        if (updateFields.length === 0) return false;

        const values = [...updateFields.map(field => updates[field.split(' = ')[0]]), id];

        const [result] = await pool.execute(
            `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
            values
        );

        return result.affectedRows > 0;
    }

    static async changePassword(pool, id, newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const [result] = await pool.execute(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, id]
        );
        return result.affectedRows > 0;
    }

    static async verifyPassword(password, hashedPassword) {
        return await bcrypt.compare(password, hashedPassword);
    }

    static generateToken(userId, role) {
        return jwt.sign(
            { userId, role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );
    }
}

module.exports = User; 