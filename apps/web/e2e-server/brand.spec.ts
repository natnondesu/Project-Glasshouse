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

// favicon.svg colours its faces with an inline <style> (and swaps them for dark mode). A policy that bans inline styles
// would draw it unstyled, so read real pixels from the file as the server sends it.
const SAMPLE_POINTS = { top: [46.2, 11.8], left: [10.7, 41.5], right: [53.3, 39.1] } as const;

type Rgb = [number, number, number];
const FACES: Record<'light' | 'dark', Record<keyof typeof SAMPLE_POINTS, Rgb>> = {
  light: { top: [0x7f, 0xa2, 0xe8], left: [0x0e, 0x18, 0x24], right: [0x1c, 0x64, 0xc8] },
  dark: { top: [0xc9, 0xd8, 0xf5], left: [0xff, 0xff, 0xff], right: [0x7f, 0xa2, 0xe8] },
};

for (const scheme of ['light', 'dark'] as const) {
  test(`favicon.svg keeps its own colours under the content security policy (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const pixels = await page.evaluate(async (points) => {
      const img = new Image();
      img.src = '/favicon.svg';
      await img.decode();
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, size, size);
      return Object.fromEntries(Object.entries(points).map(([face, [x, y]]) => [face, [...ctx.getImageData(Math.round(x!), Math.round(y!), 1, 1).data]]));
    }, SAMPLE_POINTS);
    for (const face of Object.keys(SAMPLE_POINTS) as (keyof typeof SAMPLE_POINTS)[]) {
      const [r, g, b, a] = pixels[face] as number[];
      const want = FACES[scheme][face];
      expect(a, `${face} is opaque`).toBe(255);
      expect(Math.abs(r! - want[0]) + Math.abs(g! - want[1]) + Math.abs(b! - want[2]), `${face} is ${want} but drew as ${[r, g, b]}`).toBeLessThan(24);
    }
  });
}

test('only SVG files get the relaxed policy; the app and its other files keep the strict one', async ({ request }) => {
  const svg = await request.get('/favicon.svg');
  expect(svg.headers()['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'");
  for (const path of ['/', '/site.webmanifest', '/favicon.ico', '/no-such-file.svg']) {
    const res = await request.get(path);
    const csp = res.headers()['content-security-policy'] ?? '';
    expect(csp, path).toContain("default-src 'self'");
    expect(csp, path).not.toContain('unsafe-inline');
  }
});

for (const [scheme, top] of [['light', 'rgb(127, 162, 232)'], ['dark', 'rgb(201, 216, 245)']] as const) {
  test(`opening favicon.svg on its own still applies its inline style (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/favicon.svg');
    expect(await page.locator('path.t').evaluate((el) => getComputedStyle(el).fill)).toBe(top);
  });
}
