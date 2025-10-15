import 'module-alias/register'; 

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';

import { HttpError } from '@/shared/models/http-error';
import { errorHandler } from '@/shared/middleware/error-handler';
import connectDB from '@/config/db';
import userRoutes from '@/modules/users/routes/users-routes';
import petRoutes from '@/modules/pets/routes/pets-routes';

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

connectDB();

app.use('/api/users', userRoutes);
app.use('/api/pets', petRoutes);

app.use((req, res, next) => {
  const error = new HttpError('Could not find this route.', 404);
  next(error); 
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));