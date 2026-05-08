/**
 * Executa HUGO uma vez e encerra. Útil pra teste ou cron externo (não Express).
 *   npm run run-once
 */
import 'dotenv/config';
import { runMigration } from './migration.js';
import hugoAgent from './agent.js';

runMigration();

(async () => {
  try {
    const result = await hugoAgent.execute();
    console.log('\n=== RESULTADO ===');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Erro:', err);
    process.exit(1);
  }
})();
