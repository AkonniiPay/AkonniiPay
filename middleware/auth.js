const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    // Get token from the Authorization header
    const authHeader = req.header('Authorization');

    // Check if header is missing or doesn't start with Bearer
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        // Extract token after 'Bearer '
        const token = authHeader.split(' ')[1];

        // Verify the token using your JWT_SECRET
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach user info (id and role) to the request object
        req.user = decoded;
        next(); // Move on to the actual route handler
    } catch (err) {
        res.status(401).json({ message: 'Invalid or expired token.' });
    }
};