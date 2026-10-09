/**
 * SSRF protection: the scraper fetches URLs that users (and the sites they point at) choose,
 * so it must never be turned against our own server or private networks: localhost,
 * office/home LANs, or cloud metadata endpoints like 169.254.169.254.
 *
 * fetchPage() calls assertPublicUrl() before the first request and again before every
 * redirect hop, so a public site can't bounce us to a private address either.
 */
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { ScrapeError } from "./errors";

// Every non-public range: loopback, private (RFC 1918), carrier-grade NAT, link-local
// (includes cloud metadata), "this network", documentation, benchmarking, multicast, reserved.
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local (private)
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

// Names that only mean something inside a private network.
const PRIVATE_NAME = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|home\.arpa)$/i;
const ALLOWED_PORTS = new Set(["", "80", "443"]);

/** True when an IP address (v4 or v6) is not on the public internet. */
export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return blocked.check(ip, "ipv4");
  if (version !== 6) return true; // not an IP at all: refuse
  const lower = ip.toLowerCase();
  // IPv4 hidden inside IPv6: "::ffff:127.0.0.1" (mapped) and "64:ff9b::7f00:1" (NAT64).
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  if (lower.startsWith("::ffff:") || lower.startsWith("64:ff9b:")) {
    const v4 = embeddedIpv4(lower);
    return v4 ? isPrivateIp(v4) : true;
  }
  return blocked.check(ip, "ipv6");
}

/** The last 32 bits of an IPv6 address as dotted IPv4 ("::ffff:7f00:1" -> "127.0.0.1"). */
function embeddedIpv4(ip: string): string | null {
  const groups = ip.split(":").slice(-2);
  if (groups.length !== 2 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  const n = (parseInt(groups[0], 16) << 16) | parseInt(groups[1], 16);
  return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join(".");
}

const refuse = (message = "That address points to a private network, which XenFlo doesn't read.") => new ScrapeError("PRIVATE_ADDRESS", message);

/**
 * Throws PRIVATE_ADDRESS unless `url` is http(s) on a standard port and its host is (or resolves only to)
 * public IP addresses. Every resolved address is checked, so one public and one private record still fails.
 */
export async function assertPublicUrl(url: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ScrapeError("INVALID_URL", "That doesn't look like a valid website address.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw refuse("XenFlo only reads http and https websites.");
  // Other ports are where admin panels and internal services live, not business websites.
  if (!ALLOWED_PORTS.has(u.port)) throw refuse("XenFlo only reads websites on the standard ports (80 and 443).");
  if (u.username || u.password) throw refuse("Addresses with a username or password aren't supported.");

  const host = u.hostname.replace(/^\[|\]$/g, ""); // IPv6 literals come wrapped in [ ]
  if (isIP(host)) {
    if (isPrivateIp(host)) throw refuse();
    return;
  }
  if (PRIVATE_NAME.test(host) || !host.includes(".")) throw refuse();

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ScrapeError("UNREACHABLE", "We couldn't find that website. Check the address and try again.");
  }
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) throw refuse();
}
