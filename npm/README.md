# @vancityayush/sshx

TypeScript + Bun launcher for the `sshx` Rust CLI, published to npm.

## Usage

```bash
npx @vancityayush/sshx
npx @vancityayush/sshx setup github -e you@example.com -k personal
```

The package downloads the matching `sshx` release binary for the current
platform into the user cache directory and then executes it.

## Development

```bash
bun install
bun run build
bun run typecheck
```
