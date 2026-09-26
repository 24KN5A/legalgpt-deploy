import mongoose from 'mongoose';

export async function connectDB(uri) {
  try {
    const mongoUri = uri || process.env.MONGO_URI || 'mongodb+srv://venkatshiva823_db_user:9xNZdjBBiwKLEnME@cluster0.e24bunz.mongodb.net/legalgpt?retryWrites=true&w=majority';
    mongoose.set('strictQuery', false);
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log(`[MongoDB] Connected successfully to database: ${mongoose.connection.name}`);
  } catch (error) {
    console.error('[MongoDB] Connection error:', error.message);
    // Don't crash process, allow server to boot and report status
  }
}
