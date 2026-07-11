import crypto from 'crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import { getXrgBalance, debitXrg, creditXrg } from './xrgBalance.js';
import { invalidateCachePattern } from '../middleware/cacheMiddleware.js';

export interface MarketplaceListing {
  id: string;
  sellerId: string;
  sellerName: string;
  title: string;
  description: string;
  category: string;
  priceXrg: number;
  previewUrl: string | null;
  tags: string[];
  status: string;
  salesCount: number;
  createdAt: string;
  owned?: boolean;
  purchased?: boolean;
}

const memoryListings: MarketplaceListing[] = [];
const memoryPurchases = new Map<string, Set<string>>();

const CATEGORIES = ['template', 'component', 'automation', 'project', 'prompt', 'other'];

export function getMarketplaceCategories(): string[] {
  return CATEGORIES;
}

export async function listMarketplaceListings(
  userId: string,
  opts: { category?: string; mine?: boolean } = {}
): Promise<MarketplaceListing[]> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      let query = supabase
        .from('marketplace_listings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (opts.mine) {
        query = query.eq('seller_id', userId);
      } else {
        query = query.eq('status', 'active');
      }
      if (opts.category && opts.category !== 'all') {
        query = query.eq('category', opts.category);
      }

      const { data: listings } = await query;

      const { data: purchases } = await supabase
        .from('marketplace_purchases')
        .select('listing_id')
        .eq('buyer_id', userId);

      const purchasedIds = new Set((purchases ?? []).map((p) => p.listing_id));

      const sellerIds = [...new Set((listings ?? []).map((l) => l.seller_id))];
      const nameMap = new Map<string, string>();
      if (sellerIds.length) {
        const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', sellerIds);
        for (const p of profiles ?? []) {
          nameMap.set(p.id, p.display_name ?? 'Builder');
        }
      }

      return (listings ?? []).map((row) => ({
        id: row.id,
        sellerId: row.seller_id,
        sellerName: nameMap.get(row.seller_id) ?? 'Builder',
        title: row.title,
        description: row.description ?? '',
        category: row.category,
        priceXrg: Number(row.price_xrg),
        previewUrl: row.preview_url,
        tags: row.tags ?? [],
        status: row.status,
        salesCount: row.sales_count ?? 0,
        createdAt: row.created_at,
        owned: row.seller_id === userId,
        purchased: purchasedIds.has(row.id),
      }));
    } catch {
      // memory fallback
    }
  }

  return memoryListings
    .filter((l) => {
      if (opts.mine) return l.sellerId === userId;
      if (l.status !== 'active') return false;
      if (opts.category && opts.category !== 'all') return l.category === opts.category;
      return true;
    })
    .map((l) => ({
      ...l,
      owned: l.sellerId === userId,
      purchased: memoryPurchases.get(userId)?.has(l.id) ?? false,
    }));
}

export async function createMarketplaceListing(
  userId: string,
  body: { title: string; description: string; category: string; priceXrg: number; previewUrl?: string; tags?: string[] }
): Promise<{ success: boolean; listing?: MarketplaceListing; message: string }> {
  if (!body.title?.trim()) {
    return { success: false, message: 'Title is required.' };
  }
  if (body.priceXrg < 0) {
    return { success: false, message: 'Price must be zero or positive.' };
  }

  const category = CATEGORIES.includes(body.category) ? body.category : 'template';

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('marketplace_listings')
        .insert({
          seller_id: userId,
          title: body.title.trim(),
          description: body.description?.trim() ?? '',
          category,
          price_xrg: body.priceXrg,
          preview_url: body.previewUrl ?? null,
          tags: body.tags ?? [],
        })
        .select('*')
        .single();

      if (error) throw error;

      await invalidateCachePattern('cache:/api/marketplace*');

      return {
        success: true,
        message: 'Listing published to marketplace.',
        listing: {
          id: data.id,
          sellerId: userId,
          sellerName: 'You',
          title: data.title,
          description: data.description,
          category: data.category,
          priceXrg: Number(data.price_xrg),
          previewUrl: data.preview_url,
          tags: data.tags ?? [],
          status: data.status,
          salesCount: 0,
          createdAt: data.created_at,
          owned: true,
        },
      };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  const listing: MarketplaceListing = {
    id: crypto.randomUUID(),
    sellerId: userId,
    sellerName: 'You',
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
    category,
    priceXrg: body.priceXrg,
    previewUrl: body.previewUrl ?? null,
    tags: body.tags ?? [],
    status: 'active',
    salesCount: 0,
    createdAt: new Date().toISOString(),
    owned: true,
  };
  memoryListings.unshift(listing);
  return { success: true, message: 'Listing published.', listing };
}

export async function purchaseMarketplaceListing(
  userId: string,
  listingId: string
): Promise<{ success: boolean; message: string }> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data: listing } = await supabase
        .from('marketplace_listings')
        .select('*')
        .eq('id', listingId)
        .eq('status', 'active')
        .maybeSingle();

      if (!listing) return { success: false, message: 'Listing not found or no longer available.' };
      if (listing.seller_id === userId) return { success: false, message: 'You cannot buy your own listing.' };

      const { data: existing } = await supabase
        .from('marketplace_purchases')
        .select('id')
        .eq('listing_id', listingId)
        .eq('buyer_id', userId)
        .maybeSingle();

      if (existing) return { success: false, message: 'You already own this item.' };

      const price = Number(listing.price_xrg);
      const balance = await getXrgBalance(userId);
      if (balance.availableXrg < price) {
        return { success: false, message: `Insufficient XRG. Need ${price.toLocaleString()}, have ${balance.availableXrg.toLocaleString()}.` };
      }

      await debitXrg(userId, price);
      const sellerShare = Math.floor(price * 0.9);
      await creditXrg(listing.seller_id, sellerShare, 0);

      await supabase.from('marketplace_purchases').insert({
        listing_id: listingId,
        buyer_id: userId,
        seller_id: listing.seller_id,
        price_xrg: price,
      });

      await supabase
        .from('marketplace_listings')
        .update({
          sales_count: (listing.sales_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', listingId);

      await invalidateCachePattern('cache:/api/marketplace*');

      return { success: true, message: `Purchased "${listing.title}" for ${price.toLocaleString()} XRG.` };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  const listing = memoryListings.find((l) => l.id === listingId && l.status === 'active');
  if (!listing) return { success: false, message: 'Listing not found.' };
  if (listing.sellerId === userId) return { success: false, message: 'You cannot buy your own listing.' };

  const balance = await getXrgBalance(userId);
  if (balance.availableXrg < listing.priceXrg) {
    return { success: false, message: 'Insufficient XRG.' };
  }

  await debitXrg(userId, listing.priceXrg);
  await creditXrg(listing.sellerId, Math.floor(listing.priceXrg * 0.9), 0);

  if (!memoryPurchases.has(userId)) memoryPurchases.set(userId, new Set());
  memoryPurchases.get(userId)!.add(listingId);
  listing.salesCount++;

  return { success: true, message: `Purchased "${listing.title}".` };
}

export async function getMarketplaceStats(userId: string): Promise<{
  totalListings: number;
  myListings: number;
  mySales: number;
  myPurchases: number;
}> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const [{ count: total }, { count: mine }, { count: sales }, { count: purchases }] = await Promise.all([
        supabase.from('marketplace_listings').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('marketplace_listings').select('*', { count: 'exact', head: true }).eq('seller_id', userId),
        supabase.from('marketplace_purchases').select('*', { count: 'exact', head: true }).eq('seller_id', userId),
        supabase.from('marketplace_purchases').select('*', { count: 'exact', head: true }).eq('buyer_id', userId),
      ]);
      return {
        totalListings: total ?? 0,
        myListings: mine ?? 0,
        mySales: sales ?? 0,
        myPurchases: purchases ?? 0,
      };
    } catch {
      // fallback
    }
  }

  return {
    totalListings: memoryListings.filter((l) => l.status === 'active').length,
    myListings: memoryListings.filter((l) => l.sellerId === userId).length,
    mySales: 0,
    myPurchases: memoryPurchases.get(userId)?.size ?? 0,
  };
}
