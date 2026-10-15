export function roundStatus(results = []) {
  const text = results.filter(result => result.type !== 'html');
  const judged = text.length ? text : results;
  if (text.some(result => result.status === 'degraded')) return 'degraded';
  if (judged.some(result => result.status === 'detecting')) return 'detecting';
  if (!judged.length || judged.some(result => !['normal', 'generated'].includes(result.status))) return 'insufficient';
  return text.length ? 'normal' : 'generated';
}

export function roundPending(round) {
  return round.status === 'detecting' || (round.results || []).some(result => result.status === 'detecting');
}
