import mongoose from 'mongoose';

export const connectDatabase = async (uri: string): Promise<void> => {
  await mongoose.connect(uri);
  console.log('[ database ] MongoDB connected');
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
  console.log('[ database ] MongoDB disconnected');
};
