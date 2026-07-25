# zed-surge

Syntax highlighting for [Surge](https://nssurge.com) configuration files in
[Zed](https://zed.dev) — a Tree-sitter grammar plus the Zed language extension
that wraps it.

## Why not just use an INI grammar

Surge's `.conf` is INI-shaped right up until it isn't. `[General]` and `[Proxy]`
are ordinary `key = value`, but `[Rule]` holds positional comma-separated rules
with no `=` anywhere:

```
IP-CIDR,100.64.0.0/10,🇺🇸US,no-resolve
AND,((OR,((SUBNET,SSID:Home),(SUBNET,SSID:Office))),(RULE-SET,https://example.com/rs.conf)),DIRECT
```

An INI grammar cannot parse those lines at all, so the whole `[Rule]` section —
usually the part you actually read — falls out of the syntax tree. This grammar
handles it, along with the rest of what Surge does that INI does not: proxy
names containing emoji and colons (`🧡XD:000`), values containing spaces
(`SSID:XD Office`), named sections (`[Tailscale ts-007]`), and `%APPEND%`.

## What it highlights

| | |
|---|---|
| Section headers | `@title` |
| Rule types — `DOMAIN-SUFFIX`, `GEOIP`, `RULE-SET`, `AND`/`OR`, `FINAL` … | `@keyword` |
| The policy a rule resolves to | `@constant` |
| Setting and proxy names | `@property` |
| Inline params — `psk=`, `version=`, `hidden=` | `@attribute` |
| Rule modifiers — `no-resolve`, `force-remote-dns` … | `@attribute` |
| `DIRECT` / `REJECT*` | `@constant.builtin` |
| URLs, ports, booleans | `@link_uri`, `@number`, `@boolean` |

Sections with whitespace-separated syntax (`[URL Rewrite]`, `[Header Rewrite]`)
are recognised but not broken down; they render as plain text rather than
producing parse errors.

Bracket matching and an outline of the config's sections come along with it.

## Install

Not in the Zed extension registry yet. Clone and install as a dev extension:

```sh
git clone https://github.com/krosdai/zed-surge
```

Then in Zed: `zed: install dev extension` → pick the cloned directory. The first
load compiles the parser to WebAssembly, which takes a few seconds.

## File association

The extension registers `.sgmodule` only. It deliberately does **not** claim
`.conf`, because plenty of things that aren't Surge use that suffix — and if
another installed extension also claims it, which one wins is not well defined.

Point Zed at your own configs explicitly in `settings.json`:

```jsonc
"file_types": {
  "Surge": ["**/*.conf", "**/*.sgmodule"]
}
```

A `file_types` entry outranks any extension's built-in suffix list, so this wins
deterministically over anything else claiming `.conf`.

## Developing

Grammar and extension share one root: `grammar.js` + `src/` are the Tree-sitter
side, `extension.toml` + `languages/` are the Zed side. `[grammars.surge]` in
`extension.toml` points back at this repository.

After changing `grammar.js`:

```sh
npx tree-sitter-cli generate
git commit -am "…"
```

Then update `rev` in `extension.toml` to the new commit and run
`zed: reload extensions`.

Two things that will waste your afternoon if you forget them:

- **`src/parser.c` must stay committed.** Zed compiles it with wasi-sdk; it never
  runs `tree-sitter generate` itself.
- **Zed caches the built grammar per `rev`.** A stale `rev` silently keeps the old
  parser, with no error to tell you why your change did nothing.

To check the grammar against real configs, from the repository root:

```sh
npx tree-sitter-cli parse --quiet --stat path/to/*.conf
npx tree-sitter-cli query languages/surge/highlights.scm path/to/config.conf
```

The CLI picks up the grammar from the working directory by matching the file
against `file-types` in `tree-sitter.json`. Don't reach for `--scope` — that
resolves through `parser-directories` in the CLI's own config, which this
repository's name doesn't fit. Both commands warn that no parser directory is
configured; ignore it, the parse still runs.

A correct parse produces no `ERROR` nodes *and* no `raw_line` nodes — `raw_line`
is the catch-all that keeps unknown syntax from erroring, so if it shows up on a
line you meant to support, that line is silently unparsed.

## License

MIT
