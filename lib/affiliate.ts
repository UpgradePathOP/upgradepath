import affiliateLinks from '@/data/affiliate-links.json';
import { PartPick } from './types';

type VendorId = 'amazon' | 'newegg' | 'bestbuy';

type AffiliateLink = {
  vendor: VendorId;
  label: string;
  url: string;
  kind: 'direct' | 'search';
};

type AffiliateOverrides = {
  items?: Record<
    string,
    {
      amazon?: string;
      newegg?: string;
      bestbuy?: string;
      search?: string;
    }
  >;
  search?: Record<string, string>;
};

const OVERRIDES = affiliateLinks as AffiliateOverrides;

const VENDORS: Array<{ id: VendorId; label: string; searchBase: string }> = [
  { id: 'amazon', label: 'Amazon', searchBase: 'https://www.amazon.com/s?k=' },
  { id: 'newegg', label: 'Newegg', searchBase: 'https://www.newegg.com/p/pl?d=' },
  { id: 'bestbuy', label: 'Best Buy', searchBase: 'https://www.bestbuy.com/site/searchpage.jsp?st=' }
];

const getSearchQuery = (part: PartPick) =>
  OVERRIDES.search?.[part.id] ?? OVERRIDES.items?.[part.id]?.search ?? part.name;

export const getAffiliateLinks = (part: PartPick): AffiliateLink[] => {
  const query = getSearchQuery(part);
  return VENDORS.map(vendor => {
    const direct = OVERRIDES.items?.[part.id]?.[vendor.id];
    const url = direct ?? `${vendor.searchBase}${encodeURIComponent(query)}`;
    return {
      vendor: vendor.id,
      label: vendor.label,
      url,
      kind: direct ? 'direct' : 'search'
    };
  });
};
