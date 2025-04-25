import recommendedFeeds from "../recommendedFeeds.json";

export interface RecommendedFeed {
  name: string;
  url: string;
}

export function useRecommendedFeeds(): RecommendedFeed[] {
  return recommendedFeeds;
}
