import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpRequest');

  use(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
    const started = Date.now();
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    res.on('finish', () => {
      this.logger.log(JSON.stringify({
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
      }));
    });
    next();
  }
}
