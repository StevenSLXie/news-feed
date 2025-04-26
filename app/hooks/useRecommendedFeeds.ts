import recommendedFeedsRaw from "../recommendedFeeds.json";

export interface RecommendedFeed {
  name: string;
  url: string;
}

export function useRecommendedFeeds(): RecommendedFeed[] {
  // Defensive: always return array, even if import fails or is not an array
  if (Array.isArray(recommendedFeedsRaw)) {
    return recommendedFeedsRaw;
  }
  if (recommendedFeedsRaw && typeof recommendedFeedsRaw === 'object' && Array.isArray((recommendedFeedsRaw as any).default)) {
    return (recommendedFeedsRaw as any).default;
  }
  return [];
}
