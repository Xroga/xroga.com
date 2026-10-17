/**
 * A destination's identity in the store tabs.
 * Until brand clearance is recorded (STORE_MARKS_CLEARED, see S04_BRAND_ASSET_AUDIT.md) the store is identified by its
 * exact name only: no generic icon stands in for a trademark. Apple licenses the App Store icon only for apps available
 * on the App Store; Google allows the Google Play icon only with licensed devices unless its brand team approves; the
 * Chrome Web Store badge is for published items. When cleared, the vendored mark renders unmodified and unanimated.
 */
import { STORE_MARKS, STORE_MARKS_CLEARED, type StoreId } from './storeMarks';

export function StoreMark({ id, size = 20 }: { id: StoreId; size?: number }) {
  if (!STORE_MARKS_CLEARED) return null;
  const m = STORE_MARKS[id];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={`${m.name} mark`} style={{ flex: 'none' }}>
      <path d={m.d} fill={m.hex} />
    </svg>
  );
}
