import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface AuthUser {
  id: string;
}

interface JwtPayload extends AuthUser {
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
       files?:  { [fieldname: string]: Express.Multer.File[] } 
            | Express.Multer.File[] 
    }
  }
}

export default function (req: Request, res: Response, next: NextFunction) {
  const header = req.header('Authorization');
  const token = header?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('FATAL: JWT_SECRET environment variable is missing.');
    return res.status(500).json({ msg: 'Server configuration error.' });
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    
    req.user = { id: decoded.id }; 
    
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
}