require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');

const mealsRouter = require('./routes/meals');
const batchesRouter = require('./routes/batches');
const settingsRouter = require('./routes/settings');
const notificationsRouter = require('./routes/notifications');
const mealieRouter = require('./routes/mealie');
const authMiddleware = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Health check must be before auth middleware so Docker healthchecks always work
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Parse Authelia SSO headers in production
if (process.env.NODE_ENV === 'production') {
  app.use(authMiddleware);
}

// API routes
app.use('/api/meals', mealsRouter);
app.use('/api/batches', batchesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/mealie', mealieRouter);


// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`PrepTrack server running on port ${PORT}`);
});
