import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, mergeMap, catchError, throwError } from 'rxjs';
import { AuditService } from './audit.service';
import { AUDIT_KEY } from './audit.decorator';
import { AuthenticatedRequest } from '../common/auth-request';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<{ action: string; entity: string }>(AUDIT_KEY, [context.getHandler(), context.getClass()]);
    if (!metadata) return next.handle();
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return next.handle().pipe(mergeMap(async (response: any) => {
      const publicData = response && typeof response === 'object' ? response : {};
      const beforeData = publicData.before && typeof publicData.before === 'object' ? publicData.before : null;
      const afterData = publicData.after && typeof publicData.after === 'object' ? publicData.after : { status: publicData.status || 'success' };
      try {
        await this.audit.write({
          actorId: req.user?.userId || publicData.user?.id || null,
          action: metadata.action,
          entity: metadata.entity,
          entityId: req.params?.id || publicData.id || publicData.user?.id || null,
          ipAddress: (req.ip || '').slice(0, 80),
          userAgent: (req.get('user-agent') || '').slice(0, 255),
          beforeData,
          afterData,
        });
      } catch (error) {
        throw error;
      }
      return response;
    }), catchError((error: unknown) => {
      void this.audit.write({
        actorId: req.user?.userId || null,
        action: metadata.action,
        entity: metadata.entity,
       entityId: typeof req.params?.id === 'string' ? req.params.id : null,
        ipAddress: (req.ip || '').slice(0, 80),
        userAgent: (req.get('user-agent') || '').slice(0, 255),
        beforeData: null,
        afterData: { status: 'failed' },
      }).catch(() => undefined);
      return throwError(() => error);
    }));
  }
}
