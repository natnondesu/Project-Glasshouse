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
      await mgr.getByRole('combobox', { name: 'Link to device' }).fill('sw-03');
      await mgr.getByRole('option', { name: /^SW-03, RK-02/ }).click();
      await mgr.getByLabel('Link to port').selectOption('port1');
      await mgr.getByRole('button', { name: 'Link', exact: true }).click();
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

test('on a short screen the port panel stays on screen and its settings scroll with the wheel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /Server room A/ }).click();
  await page.getByRole('link', { name: 'Network' }).click();
  await page.getByRole('group', { name: 'Network diagram' }).getByRole('button', { name: /^CORE-01, / }).click();
  await page.getByRole('button', { name: 'Manage ports' }).click();
  const mgr = page.getByRole('dialog', { name: 'CORE-01 ports' });
  const box = (await mgr.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(640);
  // The last control in the panel starts below the fold, and the wheel brings it into view.
  const last = mgr.getByRole('button', { name: /^(Unlink|Link)$/ });
  await expect(last).not.toBeInViewport();
  const body = mgr.locator('.port-mgr__body');
  await body.hover();
  await page.mouse.wheel(0, 600);
  await expect(last).toBeInViewport();
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});
