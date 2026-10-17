# Varro silently attaches to another user's unauthenticated OpenCode server (cross-user leak)

## Summary

OpenCode v2 already requires a password by default. The remaining exposure is v1 servers or a
manually started `opencode serve` with no password. When Varro finds such a server it silently falls
back to `connecting without authentication` (`serverAuthorization`,
`src/extension/open-code-process.ts:689-706`), so on a multi-user host a second user's Varro adopts
the first user's sessions and workspace over the shared `127.0.0.1:4096` loopback.

## Expected

Connecting to your own unauthenticated v1 server should keep working, but Varro should not silently
operate against *another user's* server without making that clear.

## Actual

Varro logs `Found existing OpenCode server at http://127.0.0.1:4096` and runs against the other
user's server with no indication that it belongs to someone else.

## Repro

1. User A: `opencode serve --port 4096` (v1, or v2 with no password), leave running.
2. User B (same host): open VS Code with Varro pointed at `127.0.0.1:4096`.
3. User B's Varro reports "running" against User A's server and shows User A's history.

## Environment

- OS / host: macOS 26.7 (arm64), one shared machine, two OS users
- VS Code: 1.138.0
- Varro: 0.30.15
- OpenCode: 1.18.32 (v1)

## Analysis: why Varro cannot simply block or warn globally

- Varro cannot refuse to connect to an unauthenticated OpenCode server. Such setups may exist - for
  example, v1 users deliberately running an unauthenticated `opencode serve` - and failing closed
  would break them.
- Varro also cannot print a warning every time it connects without authentication. For users who
  intentionally run unauthenticated servers, that warning would be constant noise and would bother
  exactly the people the behavior is meant to serve.
- The problem is therefore only the *cross-user* case: it is fine for a user to attach to their own
  unauthenticated server, but not to silently operate another user's sessions and workspace. The
  distinguishing factor should be **whose server it is**, not whether it is authenticated.
- Loopback (`127.0.0.1`) is shared by every user on a host and the connection is reachable by design;
  there is no per-user network boundary. The only reliable signal available to the client is OS-level
  process inspection: which process owns the listening socket, and which OS user that process runs as.

## Recommendation

- Varro should distinguish same-user from cross-user connections. When attaching to another user's
  unauthenticated server, it should warn or require confirmation rather than connecting silently,
  while leaving same-user unauthenticated v1 servers working unchanged.
- Detection should be client-side and OS-level: inspect the process that owns the listening socket
  and compare its OS user to the current user. Varro already maps the port to a PID in
  `findListeningPids` (`src/extension/process-inspection.ts:293`). Do not ask the server or trust
  anything it reports about itself - a hostile server could claim to be anyone.
- Upstream: OpenCode v1 should match v2's already-fixed behavior and require a password by default.
