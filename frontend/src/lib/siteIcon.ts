/** Rules for the cited-source logo route. Kept out of the route file because Next.js route modules export handlers only. */
export const ICON_HOST = 'https://cdn.deepseek.com/site-icons/';
export const MAX_ICON_BYTES = 96 * 1024;
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

/** A plain hostname with a public-looking suffix. IP literals, ports, paths and credentials never match. */
export function isIconDomain(value: string): boolean {
  return DOMAIN.test(value);
}

/** Accept only small raster images, judged by their bytes. SVG and HTML are refused, whatever the server claims. */
export function sniffRasterImage(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i] ?? -1;
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'image/png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return 'image/gif';
  if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return 'image/webp';
  if (at(0) === 0x00 && at(1) === 0x00 && at(2) === 0x01 && at(3) === 0x00) return 'image/x-icon';
  return null;
}
