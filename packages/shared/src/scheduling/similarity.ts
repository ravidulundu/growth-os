function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function vectorize(tokens: string[]) {
  const vector = new Map<string, number>();
  for (const token of tokens) {
    vector.set(token, (vector.get(token) ?? 0) + 1);
  }
  return vector;
}

export function cosineSimilarity(left: string, right: string) {
  const leftVector = vectorize(tokenize(left));
  const rightVector = vectorize(tokenize(right));

  const union = new Set([...leftVector.keys(), ...rightVector.keys()]);
  if (union.size === 0) {
    return 1;
  }

  let dot = 0;
  let leftNormSq = 0;
  let rightNormSq = 0;

  for (const key of union) {
    const leftValue = leftVector.get(key) ?? 0;
    const rightValue = rightVector.get(key) ?? 0;
    dot += leftValue * rightValue;
    leftNormSq += leftValue * leftValue;
    rightNormSq += rightValue * rightValue;
  }

  const denominator = Math.sqrt(leftNormSq) * Math.sqrt(rightNormSq);
  if (denominator === 0) {
    return 0;
  }

  return dot / denominator;
}

export function exceedsSimilarityThreshold(left: string, right: string, threshold: number) {
  return cosineSimilarity(left, right) >= threshold;
}
