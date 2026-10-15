const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'No token, authorization denied' });
  }

  const token = authHeader.replace('Bearer ', '').trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretkey');
    
    // Support both decoded.id and decoded.user.id format
    req.user = decoded.user || decoded;
    if (!req.user.id && req.user._id) {
      req.user.id = req.user._id;
    }

    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token is not valid' });
  }
};