import { seedProductionAccounts } from './scripts/initAccounts.js';

/**
 * Seed initial application data using the authoritative production mapping:
 * Team A: Ashmit -> ashmit_curry
 * Team B: Vansh -> vansh_baby
 * Team C: Divyanshu -> divyanshu_lebron
 * Team D: Chirayu -> champ_chirayu
 * Team E: Parth -> parth_gangsta
 * Plus Admin and Public Display accounts.
 *
 * All passwords are high-entropy and stored strictly as bcrypt hashes.
 */
export async function seedInitialData() {
  return await seedProductionAccounts();
}
