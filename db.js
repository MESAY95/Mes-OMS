import mongoose from 'mongoose';

/**
 * Connect to MongoDB with enhanced configuration
 */
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(
            process.env.MONGODB_URI || 'mongodb://localhost:27017/mesayoperations2', 
            {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                maxPoolSize: 10, // Maximum number of sockets the MongoDB driver will keep open
                serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
                socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
                family: 4, // Use IPv4, skip trying IPv6
                retryWrites: true,
                w: 'majority'
            }
        );

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📊 Database: ${conn.connection.db.databaseName}`);
        
        // Create indexes for better performance
        await createIndexes();
        
    } catch (error) {
        console.error('❌ Database connection error:', error);
        process.exit(1);
    }
};

/**
 * Create database indexes for performance
 */
const createIndexes = async () => {
    try {
        // Material indexes
        await mongoose.connection.collection('materials').createIndex({ code: 1 }, { unique: true });
        await mongoose.connection.collection('materials').createIndex({ category: 1 });
        await mongoose.connection.collection('materials').createIndex({ isActive: 1 });
        
        // Product indexes
        await mongoose.connection.collection('products').createIndex({ code: 1 }, { unique: true });
        await mongoose.connection.collection('products').createIndex({ category: 1 });
        
        // Sale indexes
        await mongoose.connection.collection('sales').createIndex({ invoiceNumber: 1 }, { unique: true });
        await mongoose.connection.collection('sales').createIndex({ saleDate: 1 });
        await mongoose.connection.collection('sales').createIndex({ customer: 1 });
        
        console.log('✅ Database indexes created successfully');
    } catch (error) {
        console.error('❌ Error creating indexes:', error);
    }
};

// Handle MongoDB connection events
mongoose.connection.on('connected', () => {
    console.log('✅ Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ Mongoose disconnected from MongoDB');
});

// Close the Mongoose connection when the application is terminated
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('✅ Mongoose connection closed through app termination');
    process.exit(0);
});

export default connectDB;