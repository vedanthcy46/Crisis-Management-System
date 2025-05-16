const mysql = require('mysql2/promise');
const mongoose = require('mongoose');
const IncidentImage = require('./IncidentImage');

class Incident {
    static async create(pool, {
        userId,
        title,
        description,
        location,
        latitude,
        longitude,
        imageBuffer,
        contentType
    }) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Create incident report in MySQL
            const [result] = await connection.execute(
                `INSERT INTO incident_reports 
                (user_id, title, description, location, latitude, longitude) 
                VALUES (?, ?, ?, ?, ?, ?)`,
                [userId, title, description, location, latitude, longitude]
            );

            const reportId = result.insertId;

            // Store image in MongoDB if provided
            if (imageBuffer) {
                const image = new IncidentImage({
                    report_id: reportId.toString(),
                    binary_data: imageBuffer,
                    contentType: contentType,
                    image_url: `/api/incidents/${reportId}/image`
                });
                await image.save();

                // Update MySQL record with image reference
                await connection.execute(
                    'UPDATE incident_reports SET mongo_image_id = ?, image_url = ? WHERE report_id = ?',
                    [image._id.toString(), image.image_url, reportId]
                );
            }

            await connection.commit();
            return reportId;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async findById(pool, reportId) {
        const [rows] = await pool.execute(
            'SELECT * FROM incident_reports WHERE report_id = ?',
            [reportId]
        );
        return rows[0];
    }

    static async findByUser(pool, userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM incident_reports WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        return rows;
    }

    static async updateStatus(pool, reportId, status) {
        const [result] = await pool.execute(
            'UPDATE incident_reports SET status = ? WHERE report_id = ?',
            [status, reportId]
        );
        return result.affectedRows > 0;
    }

    static async getImage(reportId) {
        return await IncidentImage.findOne({ report_id: reportId.toString() });
    }

    static async findAll(pool, filters = {}) {
        let query = 'SELECT * FROM incident_reports WHERE 1=1';
        const params = [];

        if (filters.status) {
            query += ' AND status = ?';
            params.push(filters.status);
        }

        if (filters.startDate) {
            query += ' AND created_at >= ?';
            params.push(filters.startDate);
        }

        if (filters.endDate) {
            query += ' AND created_at <= ?';
            params.push(filters.endDate);
        }

        query += ' ORDER BY created_at DESC';

        const [rows] = await pool.execute(query, params);
        return rows;
    }
}

module.exports = Incident; 