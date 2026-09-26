import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import analysisRoutes from './routes/analysisRoutes.js';
import healthRoutes from './routes/healthRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

// Connect to MongoDB Atlas
connectDB(process.env.MONGO_URI);

// Middlewares
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true, limit: '35mb' }));
app.use(morgan('dev'));

// Mount routes on both / and /api prefixes for seamless Vite proxy & direct Render deployment
// 1. Health & Evaluation
app.use('/', healthRoutes);
app.use('/api', healthRoutes);

// 2. Auth (/auth/* and /api/auth/*)
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);

// 3. Documents (/upload, /documents, etc.)
app.use('/', documentRoutes);
app.use('/api', documentRoutes);

// 4. Chat & Conversations (/chat, /conversations, etc.)
app.use('/', chatRoutes);
app.use('/api', chatRoutes);

// 5. Contract Analysis (/analysis, etc.)
app.use('/', analysisRoutes);
app.use('/api', analysisRoutes);

// Root welcome message
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to LegalGPT MERN API 🚀',
    version: '2.0.0',
    status: 'healthy',
    engine: 'LegalGPT Neural Core v2.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      documents: '/api/documents',
      chat: '/api/chat',
      analysis: '/api/analysis',
    },
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error_code: 'not_found',
    message: `Route not found: ${req.method} ${req.path}`,
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(500).json({
    error_code: 'internal_server_error',
    message: err.message || 'An unexpected error occurred.',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`⚖️ LegalGPT MERN Backend running on http://127.0.0.1:${PORT}`);
  console.log(`🤖 Engine: LegalGPT Neural Core v2.0`);
  console.log(`📦 Database: MongoDB Atlas Cloud Cluster`);
  console.log(`======================================================\n`);
});

export default app;
