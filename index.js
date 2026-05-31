require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/database.config');

const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const partyRoutes = require('./src/routes/party.routes');
const invoiceRoutes = require('./src/routes/invoice.routes');
const puggaRoutes = require('./src/routes/pugga.routes');
const salesInvoiceRoutes = require('./src/routes/salesInvoice.routes');
const saudaRoutes = require('./src/routes/sauda.routes');
const dashboardRoutes = require('./src/routes/dashboard.routes');
const paymentRoutes = require('./src/routes/payment.routes');

const app = express();
const PORT = process.env.PORT || 8080;

// Connect to database
connectDB();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/parties', partyRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/puggas', puggaRoutes);
app.use('/api/sales-invoices', salesInvoiceRoutes);
app.use('/api/sauda', saudaRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/payments', paymentRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'BR Bullian API Server',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      parties: '/api/parties',
      invoices: '/api/invoices',
      puggas: '/api/puggas',
      salesInvoices: '/api/sales-invoices',
      saudas: '/api/saudas',
      dashboard: '/api/dashboard'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
