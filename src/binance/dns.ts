import { Resolver, lookup as systemLookup, type LookupAddress } from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * A fetch that resolves hostnames through explicit public DNS servers instead of the
 * operating system's resolver.
 *
 * Some networks answer NXDOMAIN for binance.com at the resolver level. On the build
 * laptop the OS resolver included 114.114.114.114 alongside the router, and one of them
 * blocks the domain - so the collector failed intermittently depending on which one the
 * OS asked. Cloudflare and Google resolve it fine. Opt-in via `ASSAY_DNS`, because a
 * hosted runtime's own resolver is the better default there.
 */
export function publicDnsFetch(servers: string[]): typeof fetch {
  const resolver = new Resolver();
  resolver.setServers(servers);

  const lookup = (
    hostname: string,
    options: { all?: boolean; family?: number } | number,
    callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ): void => {
    const opts = typeof options === "number" ? { family: options } : options ?? {};
    resolver.resolve4(hostname, (err, addresses) => {
      if (err || addresses.length === 0) {
        // Fall back to the system rather than fail outright: a public resolver being
        // unreachable should degrade to the old behaviour, not break everything.
        systemLookup(hostname, opts as never, callback as never);
        return;
      }
      if (opts.all) callback(null, addresses.map((address) => ({ address, family: 4 })));
      else callback(null, addresses[0]!, 4);
    });
  };

  const dispatcher = new Agent({ connect: { lookup: lookup as never } });
  return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    undiciFetch(input as never, { ...(init as object), dispatcher } as never)) as unknown as typeof fetch;
}

/** `ASSAY_DNS=1.1.1.1,8.8.8.8` enables public DNS; unset keeps the system resolver. */
export function fetchFromEnv(): typeof fetch | undefined {
  const raw = process.env.ASSAY_DNS?.trim();
  if (!raw) return undefined;
  const servers = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return servers.length ? publicDnsFetch(servers) : undefined;
}
