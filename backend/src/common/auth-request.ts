import { Request } from 'express';
import { UserRole } from '../users/entities/user.entity';

export interface AuthenticatedRequest extends Request {
  requestId: string;
  user: {
    userId: string;
    email: string;
    role: UserRole;
    tokenVersion: number;
  };
}
