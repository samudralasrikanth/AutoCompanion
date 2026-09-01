import type { Candidate, MatchResult, NormalizedBox, VisionStrategyType } from './vision-types';

export class ConfidenceFusion {
  /**
   * Maximum normalized distance (e.g. 0.01 = 1% of screen) to consider candidates as referring to the same element.
   * This handles slight offsets between where OCR finds a text box vs where OpenCV finds a template.
   */
  private readonly clusterProximityThreshold: number;

  constructor(clusterProximityThreshold = 0.02) {
    this.clusterProximityThreshold = clusterProximityThreshold;
  }

  /**
   * Fuse multiple independent candidates into spatial clusters and vote.
   */
  public fuse(
    candidates: Candidate[],
    weights: Record<VisionStrategyType, number>
  ): MatchResult {
    // 1. Filter out zero-confidence
    const positive = candidates.filter(c => c.confidence > 0);

    if (positive.length === 0) {
      return {
        found: false,
        confidence: 0,
        location: { nx: 0, ny: 0, nw: 0, nh: 0 },
        cluster: [],
        allCandidates: candidates
      };
    }

    // 2. Spatial Clustering (greedy approach for simplicity, since N is very small)
    const clusters: Candidate[][] = [];
    
    for (const candidate of positive) {
      let addedToCluster = false;
      for (const cluster of clusters) {
        // Check if candidate is near any element in the cluster (single linkage)
        const isNear = cluster.some(member => this.isNear(candidate.location, member.location));
        if (isNear) {
          cluster.push(candidate);
          addedToCluster = true;
          break;
        }
      }
      if (!addedToCluster) {
        clusters.push([candidate]);
      }
    }

    // 3. Evaluate each cluster
    let bestCluster: Candidate[] = [];
    let bestClusterScore = -1;
    let bestClusterConfidence = 0;

    for (const cluster of clusters) {
      // Score = sum of weighted confidences, with bonus for distinct strategies
      let weightedSum = 0;
      let totalWeight = 0;
      const strategyTypes = new Set<VisionStrategyType>();

      for (const c of cluster) {
        const w = weights[c.strategy] ?? 0.1;
        weightedSum += c.confidence * w;
        totalWeight += w;
        strategyTypes.add(c.strategy);
      }

      let fusedConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

      // Bonus for distinct strategy agreement
      if (strategyTypes.size >= 2) {
        fusedConfidence = Math.min(100, fusedConfidence + 5 * (strategyTypes.size - 1));
      }

      // We rank clusters by number of distinct strategies first, then by confidence
      const clusterScore = strategyTypes.size * 1000 + fusedConfidence;

      if (clusterScore > bestClusterScore) {
        bestClusterScore = clusterScore;
        bestCluster = cluster;
        bestClusterConfidence = Math.round(fusedConfidence);
      }
    }

    // 4. Compute centroid of the winning cluster
    const centroid = this.computeCentroid(bestCluster);

    return {
      found: bestClusterConfidence >= 50,
      confidence: bestClusterConfidence,
      location: centroid,
      cluster: bestCluster,
      allCandidates: candidates
    };
  }

  private isNear(a: NormalizedBox, b: NormalizedBox): boolean {
    // Distance between centers
    const aCx = a.nx + a.nw / 2;
    const aCy = a.ny + a.nh / 2;
    const bCx = b.nx + b.nw / 2;
    const bCy = b.ny + b.nh / 2;

    const dist = Math.sqrt(Math.pow(aCx - bCx, 2) + Math.pow(aCy - bCy, 2));
    return dist <= this.clusterProximityThreshold;
  }

  private computeCentroid(cluster: Candidate[]): NormalizedBox {
    if (cluster.length === 0) return { nx: 0, ny: 0, nw: 0, nh: 0 };

    let sumX = 0, sumY = 0, sumW = 0, sumH = 0;
    for (const c of cluster) {
      sumX += c.location.nx;
      sumY += c.location.ny;
      sumW += c.location.nw;
      sumH += c.location.nh;
    }
    const n = cluster.length;
    return {
      nx: sumX / n,
      ny: sumY / n,
      nw: sumW / n,
      nh: sumH / n
    };
  }
}
