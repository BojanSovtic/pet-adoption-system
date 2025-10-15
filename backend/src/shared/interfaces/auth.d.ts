import { Request } from 'express';

type MulterFiles =
  | Express.Multer.File[]
  | { [fieldname: string]: Express.Multer.File[] };

export interface AuthRequest<P = any, ResBody = any, ReqBody = any, Query = any>
  extends Request<P, ResBody, ReqBody, Query> {
  user?: { id: string; };
  files?: MulterFiles;
}