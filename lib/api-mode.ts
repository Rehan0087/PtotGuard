/**
 * One decision for both the browser client and Next's server-side proxy.
 *
 * Local development is self-contained by default. The persistent Nest API is
 * selected only when it is explicit, so an unset variable can never make the
 * browser start MSW while Next simultaneously proxies the same request to a
 * closed port.
 */
export function isApiMockingEnabled(
  configured = process.env.NEXT_PUBLIC_API_MOCKING,
  nodeEnv = process.env.NODE_ENV,
): boolean {
  return configured === "enabled" || (nodeEnv === "development" && configured !== "disabled");
}
