const mysql = require('mysql2/promise');

// Create MySQL connection pool
const createMySQLPool = () => {
    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE || 'crisis360_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        namedPlaceholders: true,
        dateStrings: true
    });

    // Test the connection
    pool.getConnection()
        .then(connection => {
            console.log('Database connection established successfully');
            console.log('Connection config:', {
                host: process.env.MYSQL_HOST || 'localhost',
                user: process.env.MYSQL_USER || 'root',
                database: process.env.MYSQL_DATABASE || 'crisis360_db'
            });
            connection.release();
        })
        .catch(err => {
            console.error('Error connecting to the database:', err);
            console.error('Error stack:', err.stack);
            process.exit(1); // Exit if we can't connect to the database
        });

    // Add error handler to the pool
    pool.on('error', (err) => {
        console.error('Database pool error:', err);
        console.error('Error stack:', err.stack);

        // If this is a connection error, exit the process
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.error('Database connection was closed. Exiting...');
            process.exit(1);
        }
    });

    return pool;
};

module.exports = { createMySQLPool }; 