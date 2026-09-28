import { dataSource } from './db';

async function main() {
  await dataSource.initialize();
  await dataSource.query(`
    CREATE OR REPLACE FUNCTION reject_ledger_mutation() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'ledger_entries is append-only';
    END;
    $$ LANGUAGE plpgsql;
  `);
  await dataSource.query('DROP TRIGGER IF EXISTS ledger_append_only ON ledger_entries');
  await dataSource.query(`
    CREATE TRIGGER ledger_append_only
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation()
  `);
  await dataSource.destroy();
}

main().catch(async (error) => {
  process.stderr.write(`${String(error)}\n`);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exitCode = 1;
});
