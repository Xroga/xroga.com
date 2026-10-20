/** Response isolation only. Outbound destination/DNS policy remains Command010. */
export {browserProxyHeaders,imageProxyHeaders} from './untrustedProxyResponsePolicy.mjs';

export function escapeProxyHtml(value: string): string {
  const entities:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
  return value.replace(/[&<>"']/g, character => entities[character]!);
}
