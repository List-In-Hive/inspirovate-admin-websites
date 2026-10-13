// Explicit server mode also covers the separately scheduled GitHub runner.
// Railway supplies the generated public domain without a scheme; ADMIN_ORIGIN overrides it (custom domain).
export function adminOrigin() {
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  return process.env.ADMIN_ORIGIN || (domain ? `https://${domain}` : '');
}
export function hostedRuntime() {
  return process.env.ADMIN_HOSTED === 'true' || process.env.GITHUB_ACTIONS === 'true';
}
