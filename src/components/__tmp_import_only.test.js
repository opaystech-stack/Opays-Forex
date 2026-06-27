import { describe, it, expect } from 'vitest';

describe('import isolation', () => {
  it('imports reminderService', async () => {
    const mod = await import('../services/reminderService.js');
    expect(typeof mod.buildReminders).toBe('function');
  });
  it('imports customerMatching', async () => {
    const mod = await import('../utils/customerMatching.js');
    expect(typeof mod.matchCustomer).toBe('function');
  });
});
