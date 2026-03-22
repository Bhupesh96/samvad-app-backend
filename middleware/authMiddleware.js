const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  // Get token from the Authorization header (e.g., "Bearer TOKEN_STRING")
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ success: false, message: 'Authentication required: No token provided.' }); // if there isn't any token
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error("JWT Verification Error:", err.message);
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired. Please log in again.' });
      }
      return res.status(403).json({ success: false, message: 'Invalid or malformed token.' }); // if token is invalid
    }

    // Token is valid, store decoded payload (user info) on the request object
    // The payload might contain userId or adminId depending on how you created the token
    req.user = decoded;

    // Ensure we have a user identifier (adjust property names if needed)
    if (!req.user || (!req.user.userId && !req.user.adminId)) {
      console.error("JWT payload missing user identifier:", decoded);
      return res.status(403).json({ success: false, message: 'Token payload invalid.' });
    }

    next(); // pass the execution off to whatever request the client intended
  });
}

module.exports = authenticateToken;
