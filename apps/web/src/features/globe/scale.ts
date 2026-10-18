/** Metres in a degree of latitude: near enough for a scale bar anywhere on the map. */
const METRES_PER_DEGREE = 111_320;

/** A round distance (1, 2 or 5 × a power of ten) that fits in `maxPx` at this zoom, and its length on screen. */
export function scaleBar(ppd: number, maxPx = 120): { label: string; px: number } {
  const metresPerPx = METRES_PER_DEGREE / ppd;
  const budget = metresPerPx * maxPx;
  const power = 10 ** Math.floor(Math.log10(budget));
  const nice = [5, 2, 1].map((n) => n * power).find((n) => n <= budget) ?? power;
  return { label: nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, px: nice / metresPerPx };
}
