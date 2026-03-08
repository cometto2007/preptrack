// Authelia SSO header middleware
// In production, Traefik forwards authenticated user info via headers.
// This middleware extracts the user from the Remote-User header.
function authMiddleware(req, res, next) {
  const user = req.headers['remote-user'];
  const email = req.headers['remote-email'];
  const name = req.headers['remote-name'];

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.user = { username: user, email, name };
  next();
}

module.exports = authMiddleware;
