import type { Check } from '../types';
import { httpsRecordCheck } from './httpsRecord';

/**
 * The Check registry. The Report engine runs every Check listed here, in
 * parallel, and grades each by its `weight`. To add a Check:
 * 1. create `checks/<name>.ts` exporting a `Check` (with its spec weight),
 * 2. add its id to `CheckId` in `../types.ts`,
 * 3. list it here (order = card order in the UI),
 * 4. add its copy in `src/content/explanations.ts` (the compiler will insist).
 */
export const checks: readonly Check[] = [httpsRecordCheck];
