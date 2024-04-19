import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config()

const url = process.env.database

;(async () => {
    await mongoose.connect(url, {
        dbName: 'ref',
        useNewUrlParser: true,
        useUnifiedTopology: true,
    } as any).catch(error => { console.error(error) });

    mongoose.connection.on('connected', () => {
        console.log('Connected to MongoDB!');
    });
    
})();