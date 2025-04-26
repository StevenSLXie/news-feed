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
  // For ESM/Next.js JSON import edge case
  if (
    recommendedFeedsRaw &&
    typeof recommendedFeedsRaw === 'object' &&
    'default' in recommendedFeedsRaw &&
    Array.isArray((recommendedFeedsRaw as { default: unknown }).default)
  ) {
    return (recommendedFeedsRaw as { default: unknown[] }).default as RecommendedFeed[];
  }
  return [];
}
