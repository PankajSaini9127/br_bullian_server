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
const noteRoutes = require('./src/routes/note.routes');
const profileRoutes = require('./src/routes/profile.routes');
const physicalStockVerificationRoutes = require('./src/routes/physicalStockVerification.routes');
const metalBadlaRoutes = require('./src/routes/metalBadla.routes');
const pakkiSalePurchaseRoutes = require('./src/routes/pakkiSalePurchase.routes');
const reportRoutes = require('./src/routes/report.routes');

const app = express();
const PORT = process.env.PORT || 8080;

// Connect to database
connectDB();

// Middleware
app.use(cors({
   origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://192.168.1.4:3000",
    "http://15.206.168.54:3030"
  ],
  credentials: true,
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
app.use('/api/notes', noteRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/physical-stock-verification', physicalStockVerificationRoutes);
app.use('/api/metal-badla', metalBadlaRoutes);
app.use('/api/pakki-sale-purchase', pakkiSalePurchaseRoutes);
app.use('/api/reports', reportRoutes);

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
app.listen(PORT,"0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
