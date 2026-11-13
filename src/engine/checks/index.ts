import { caaMismatchRefiner } from '../caaMismatch';
import type { Check, CheckId, Refiner } from '../types';
import { dnssecCheck } from './dnssec';
import { caaCheck } from './caa';
import { hstsPreloadCheck } from './hstsPreload';
import { certificateCheck } from './certificate';
import { httpsRecordCheck } from './httpsRecord';
import { nameserversCheck } from './nameservers';

export interface CheckInfo {
  id: CheckId;
  /** Card heading. */
  title: string;
  /** Weight in the Grade (spec: Grading). Rescaled over the Checks that could be graded. */
  weight: number;
}

/** The six Checks of a Report, in card order. Every Report lists all six. */
export const catalog: readonly CheckInfo[] = [
  { id: 'dnssec', title: 'DNSSEC', weight: 25 },
  { id: 'caa', title: 'CAA', weight: 15 },
  { id: 'nameservers', title: 'Nameservers', weight: 20 },
  { id: 'https-record', title: 'HTTPS record', weight: 10 },
  { id: 'certificate', title: 'Certificate', weight: 20 },
  { id: 'hsts-preload', title: 'HSTS preload', weight: 10 },
];

/**
 * The Check registry: one implementation per catalog entry. The Report engine runs
 * every Check listed here, in parallel. To add a Check:
 * 1. create `checks/<name>.ts` exporting a `Check` whose `id` is in the catalog above,
 * 2. list it here (order doesn't matter; cards follow the catalog),
 * 3. add its copy in `src/content/explanations.ts`.
 * The UI renders its card from the catalog; no UI change is needed.
 *
 * `ctx.zoneApex()` and `ctx.alias` give the shared name resolution (see
 * `../names.ts`). A Check that reads records on the Hostname sets
 * `readsHostnameRecords: true` so the engine adds the Alias note to its card.
 */
export const checks: readonly Check[] = [httpsRecordCheck, caaCheck, hstsPreloadCheck, nameserversCheck, dnssecCheck, certificateCheck];

/**
 * Cross-Check post-processing, applied by the Report engine to every settled
 * result (see `Refiner`). The engine knows nothing about what each one does.
 */
export const refiners: readonly Refiner[] = [caaMismatchRefiner];
