import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateEnvironment } from './utils/envValidator.js';

import departmentmanagementRoutes from './routes/departmentmanagements.js';
import companyManagementRoutes from './routes/companyManagements.js';
import employeeRoutes from './routes/employees.js';
import attendanceRoutes from './routes/attendances.js';
import materialRoutes from './routes/materials.js';
import productRoutes from './routes/products.js';

import productionmanagementRoutes from './routes/productionmanagements.js';
import productionScheduleRoutes from './routes/productionSchedules.js';
import capacityRoutes from './routes/capacitys.js';
import lineManagementRoutes from './routes/lineManagements.js';
import productformulationRoutes from './routes/productformulations.js';

import materialRIRoutes from './routes/materialRI.js';
import productRIRoutes from './routes/productRI.js';
import inventoryplanRoutes from './routes/inventoryplans.js';

import infoPricingRoutes from './routes/infoPricings.js';
import materialcostRoutes from './routes/materialcosts.js';

import dailySaleFormRoutes from './routes/dailySalesForm.js';
import expenseRoutes from './routes/expenses.js';
import pettycashmanagementRoutes from './routes/pettycashmanagements.js';
import salesplanRoutes from './routes/salesplans.js';

// ES module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Validate environment variables
if (!validateEnvironment()) {
  console.error('Server cannot start due to missing environment variables');
  process.exit(1);
}

const app = express();

// Use the client app
app.use(express.static(path.join(__dirname, '/client/dist')));

// Render client for any path
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '/client/dist/index.html'));
});

// CORS configuration - make sure this is before routes
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Log all requests for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Mesay Operations API is running',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/departmentmanagements', departmentmanagementRoutes);
app.use('/api/companyManagements', companyManagementRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/products', productRoutes);

app.use('/api/production-managements', productionmanagementRoutes);
app.use('/api/productionSchedules', productionScheduleRoutes);
app.use('/api/capacitys', capacityRoutes);
app.use('/api/lineManagements', lineManagementRoutes);
app.use('/api/productformulations', productformulationRoutes);

app.use('/api/material-ri', materialRIRoutes);
app.use('/api/product-ri', productRIRoutes);
app.use('/api/inventoryplans', inventoryplanRoutes);

app.use('/api/info-pricings', infoPricingRoutes);
app.use('/api/materialcosts', materialcostRoutes);

app.use('/api/dailySalesForm', dailySaleFormRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/pettycashmanagements', pettycashmanagementRoutes);
app.use('/api/salesplans', salesplanRoutes);

// Test route to verify API is working
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'API is working!',
    timestamp: new Date().toISOString()
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  console.log('404 - Route not found:', req.originalUrl);
  res.status(404).json({ 
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}` 
  });
});

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mesayoperations2', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Connect to database and start server
connectDB();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`
🚀 Mesay Operations Server Started!
📍 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📊 API Health: http://localhost:${PORT}/api/health
🔧 Test Route: http://localhost:${PORT}/api/test
📝 Expense API: http://localhost:${PORT}/api/expenses
  `);
});

export default app;