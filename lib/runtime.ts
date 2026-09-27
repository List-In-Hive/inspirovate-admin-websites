// Explicit server mode also covers the separately scheduled GitHub runner.
export function hostedRuntime() {
  return process.env.ADMIN_HOSTED === 'true' || process.env.GITHUB_ACTIONS === 'true';
}
