const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    try {
        console.log('Headers:', req.headers); // Debug log
        const authHeader = req.headers.authorization;
        console.log('Auth header:', authHeader); // Debug log

        if (!authHeader) {
            console.log('No auth header found'); // Debug log
            return res.status(401).json({ message: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        console.log('Extracted token:', token); // Debug log

        if (!token) {
            console.log('No token in auth header'); // Debug log
            return res.status(401).json({ message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Decoded token:', decoded); // Debug log

        req.user = decoded;
        next();
    } catch (error) {
        console.error('Token verification error:', error); // Debug log
        console.error('Error stack:', error.stack); // Debug log
        return res.status(401).json({ message: 'Invalid token' });
    }
};

const checkRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
        }

        next();
    };
};

// Role-based middleware shortcuts
const isAdmin = (req, res, next) => checkRole(['admin'])(req, res, next);
const isRescueTeam = (req, res, next) => checkRole(['rescue_team'])(req, res, next);

module.exports = {
    verifyToken,
    checkRole,
    isAdmin,
    isRescueTeam
}; 