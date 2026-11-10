// Serialize uncertain writes. An in-flight operation must be acknowledged before
// a later snapshot can use its new server version.
export function enqueueProgress(previous, version, snapshot, newId = () => crypto.randomUUID()) {
  if (!previous) return {version, inFlight:{id:newId(),snapshot}, latest:null};
  if (JSON.stringify(previous.inFlight.snapshot) === JSON.stringify(snapshot)) return previous;
  return {...previous, latest:snapshot};
}
export function acknowledgeProgress(queue, version, newId = () => crypto.randomUUID()) {
  if (!queue.latest) return null;
  return {version, inFlight:{id:newId(),snapshot:queue.latest}, latest:null};
}
export function resolveProgressConflict(queue, remote, choice, newId = () => crypto.randomUUID()) {
  if (choice === 'cloud') return {queue:null,position:remote};
  if (choice !== 'local') throw new Error('请选择云端或本机进度。');
  const snapshot=queue.latest || queue.inFlight.snapshot;
  return {queue:{version:remote.version,inFlight:{id:newId(),snapshot},latest:null},position:snapshot};
}
