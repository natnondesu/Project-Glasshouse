import { expect, test } from '@playwright/test';

// The identity files ship in the web build and the server must hand them out as the right type, under its policy.
const FILES: [path: string, type: RegExp][] = [
  ['/favicon.svg', /^image\/svg\+xml/],
  ['/favicon.ico', /^image\/(x-icon|vnd\.microsoft\.icon)/],
  ['/favicon-16.png', /^image\/png/],
  ['/favicon-32.png', /^image\/png/],
  ['/favicon-48.png', /^image\/png/],
  ['/apple-touch-icon.png', /^image\/png/],
  ['/icon-192.png', /^image\/png/],
  ['/icon-512.png', /^image\/png/],
  ['/icon-maskable-512.png', /^image\/png/],
  ['/glasshouse-og-1200x630.png', /^image\/png/],
  ['/site.webmanifest', /^application\/manifest\+json/],
  ['/brand/glasshouse-lockup-horizontal-color.svg', /^image\/svg\+xml/],
];

for (const [path, type] of FILES) {
  test(`serves ${path}`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(type);
  });
}

test('the page head points at the favicon set, manifest and share image, and the manifest names its icons', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/site.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', '/glasshouse-og-1200x630.png');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0E1824');
  const manifest = (await (await request.get('/site.webmanifest')).json()) as { name: string; theme_color: string; background_color: string; icons: { src: string; purpose?: string }[] };
  expect(manifest).toMatchObject({ name: 'Glasshouse', theme_color: '#0E1824', background_color: '#0E1824' });
  expect(manifest.icons.find((i) => i.purpose === 'maskable')?.src).toBe('/icon-maskable-512.png');
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
});
