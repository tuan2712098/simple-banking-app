import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>) {}

  async write(entry: Partial<AuditLog>) {
    return this.logs.save(this.logs.create(entry));
  }

  list(page: number, limit: number) {
    return this.logs.findAndCount({ order: { createdAt: 'DESC' }, take: Math.min(limit, 100), skip: (page - 1) * Math.min(limit, 100) });
  }
}
