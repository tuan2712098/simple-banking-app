import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MonitoringService } from './monitoring.service';
import { ReconciliationReport } from './entities/reconciliation-report.entity';
import { TransactionsService } from '../transactions/transactions.service';

describe('MonitoringService', () => {
  function setup() {
    const query = jest.fn();
    const save = jest.fn();
    const find = jest.fn();
    const getRepository = jest.fn().mockReturnValue({ save, find });
    const failStalled = jest.fn();

    const service = new MonitoringService(
      { query, getRepository } as unknown as DataSource,
      { failStalled } as unknown as TransactionsService,
    );

    return { service, query, save, find, getRepository, failStalled };
  }

  it('khong tao bao cao khi so du khop so cai', async () => {
    const { service, query, save } = setup();
    query.mockResolvedValue([]);

    const result = await service.reconcile();

    expect(result.mismatches).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it('ghi bao cao khi phat hien sai lech so du', async () => {
    const { service, query, save, getRepository } = setup();

    const mismatch = {
      account_id: 'account-1',
      stored_balance: '500000.00',
      ledger_balance: '400000.00',
    };

    query.mockResolvedValue([mismatch]);
    save.mockResolvedValue({});

    const result = await service.reconcile();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ledger_entries'),
    );
    expect(getRepository).toHaveBeenCalledWith(ReconciliationReport);
    expect(save).toHaveBeenCalledWith({
      accountId: 'account-1',
      storedBalance: '500000.00',
      ledgerBalance: '400000.00',
    });
    expect(result.mismatches).toEqual([mismatch]);
  });

  it('health tra ve ok khi PostgreSQL ket noi', async () => {
    const { service, query } = setup();
    query.mockResolvedValue([{ '?column?': 1 }]);

    await expect(service.health()).resolves.toEqual(
      expect.objectContaining({
        status: 'ok',
        database: 'connected',
        responseMs: expect.any(Number),
      }),
    );

    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('health bao loi 503 khi PostgreSQL mat ket noi', async () => {
    const { service, query } = setup();
    query.mockRejectedValue(new Error('Database disconnected'));

    await expect(service.health()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('goi xu ly giao dich bi treo', async () => {
    const { service, failStalled } = setup();
    failStalled.mockResolvedValue({ failed: 2 });

    await expect(service.inspectStalled()).resolves.toEqual({ failed: 2 });
    expect(failStalled).toHaveBeenCalledTimes(1);
  });
});