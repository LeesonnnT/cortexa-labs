export function resolveContextPacket(task) {
  return {
    task,
    scope: [],
    dependencies: [],
    specs: [],
    skills: []
  };
}
