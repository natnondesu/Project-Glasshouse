import { expect, test } from '@playwright/test';

test('gives two devices ports, links them, and prints the cable on the BOM CSV', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /MDF-1/ }).click();
  await page.getByRole('link', { name: 'Elevation' }).click();
  const box = page.getByRole('combobox', { name: 'Search this room' });

  for (const name of ['SW-03', 'SW-02']) {
    await box.click();
    await box.fill('');
    await box.pressSequentially(name.toLowerCase());
    await page.getByRole('listbox', { name: 'Search results' }).getByRole('option').first().waitFor();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Manage ports' }).click();
    const mgr = page.getByRole('dialog', { name: `${name} ports` });
    await mgr.getByRole('button', { name: 'Add port' }).click();
    await expect(mgr.getByRole('button', { name: /^Port port1, free/ })).toBeVisible();
    if (name === 'SW-02') {
      await mgr.getByLabel('Link to device').selectOption({ label: 'RK-02 · SW-03' });
      await mgr.getByLabel('Link to port').selectOption('port1');
      await mgr.getByRole('button', { name: 'Link' }).click();
      await expect(mgr.getByRole('button', { name: 'Port port1, linked to SW-03 port1' })).toBeVisible();
      await mgr.getByLabel('Cable label').fill('UPLINK-1');
      await mgr.getByLabel('Cable type').selectOption('cat6a');
    }
    await mgr.getByRole('button', { name: `Close ${name} ports` }).click();
  }

  await page.getByRole('link', { name: 'Devices & BOM' }).click();
  const download = page.waitForEvent('download');
  // The sample already cables three nodes in MDF-1; ours is the fourth.
  await page.getByRole('button', { name: 'Cable schedule CSV (4)' }).click();
  const file = await (await download).path();
  const { readFileSync } = await import('node:fs');
  expect(readFileSync(file, 'utf8')).toContain('UPLINK-1,RK-02,SW-02,port1,RK-02,SW-03,port1,Cat 6A');
});
