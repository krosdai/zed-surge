/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

/* oxlint-disable no-useless-escape --
   `\[` inside a character class is redundant to JavaScript, but these regexes
   are re-parsed by tree-sitter using Rust's regex crate, where a bare `[`
   opens a nested class and fails with "unclosed character class". Dropping the
   escapes breaks `tree-sitter generate`. */

// Tree-sitter grammar for Surge (nssurge.com) configuration files.
//
// Surge's format is INI-shaped but not INI: the [Rule] section holds
// positional comma-separated rules (no `=` at all), values may contain
// spaces (`SSID:XD Office`) and emoji (`🧡XD:000`), and AND/OR rules nest
// arbitrarily deep inside parentheses.

module.exports = grammar({
  name: "surge",

  // Newlines are significant (they terminate entries), so only horizontal
  // whitespace goes in `extras`.
  extras: () => [/[ \t]/],

  // A bare word in a rule's argument position can turn out to be either an
  // argument or the policy; only the following token settles it. Let the GLR
  // parser carry both interpretations until then.
  conflicts: ($) => [[$.value, $.policy]],

  rules: {
    source_file: ($) => seq(repeat($._line), repeat($.section)),

    section: ($) => seq($.section_header, repeat($._line)),

    // `[General]`, and also named sections like `[Tailscale ts-007]`. The
    // opening bracket needs lexical precedence over `_word`, which would
    // otherwise match the whole header after parentheses become ordinary in
    // non-logical values.
    section_header: ($) =>
      seq(token(prec(1, "[")), alias(token(/[^\[\]\r\n]+/), $.section_name), "]", $._newline),

    _line: ($) =>
      choice($._newline, $.comment, $.hashbang_directive, $.setting, $.rule, $.raw_line),

    // Only reachable at the start of a line, so comment markers inside values
    // remain part of those values.
    comment: () => token(prec(3, seq(choice("#", ";", "//"), /[^\r\n]*/))),

    // Surge requires at least one horizontal space before an inline comment.
    // Keeping that whitespace inside an immediate token distinguishes
    // `value // comment` from a value that itself starts with `//`.
    inline_comment: () =>
      token.immediate(prec(3, seq(/[ \t]+/, choice("#", ";", "//"), /[^\r\n]*/))),

    // Standalone Surge directives include managed-profile headers, detached
    // section includes, and module metadata such as `#!name=…`. Keep this
    // generic so newly introduced metadata does not fall back to a comment.
    hashbang_directive: ($) =>
      seq(
        alias(token(prec(4, /#![A-Za-z][A-Za-z0-9_-]*/)), $.hashbang_directive_marker),
        optional("="),
        optional($.hashbang_directive_value),
        $._newline,
      ),

    hashbang_directive_value: () => token(/[^\s=\r\n][^\r\n]*/),

    // Managed profiles can conditionally enable a line. The prefix needs
    // higher lexical precedence than `comment`; the suffix is recognized once
    // the preceding value ends at horizontal whitespace.
    requirement_prefix: ($) =>
      seq(
        alias(token(prec(5, "#!REQUIREMENT")), $.requirement_marker),
        field("condition", $.requirement_expression),
      ),

    requirement_suffix: ($) =>
      seq(
        alias(token(prec(5, choice("#!REQUIREMENT", "//!REQUIREMENT"))), $.requirement_marker),
        field("condition", $.requirement_expression),
      ),

    platform_requirement_suffix: ($) =>
      alias(
        token(prec(5, choice("#!IOS-ONLY", "#!MACOS-ONLY", "#!TVOS-ONLY"))),
        $.requirement_marker,
      ),

    _requirement_suffix: ($) => choice($.requirement_suffix, $.platform_requirement_suffix),

    _line_suffix: ($) => choice($._requirement_suffix, $.inline_comment),

    requirement_expression: () => token(choice(/"[^"\r\n]*"/, /[^ \t\r\n]+/)),

    // ---- key = value ----------------------------------------------------

    setting: ($) =>
      seq(
        optional($.requirement_prefix),
        field("name", $.key),
        "=",
        optional($.value_list),
        optional($._line_suffix),
        $._newline,
      ),

    value_list: ($) => seq(optional($.directive), $._item, repeat(seq(",", $._item))),

    _item: ($) => choice($.parameter, $.value),

    // Inline `psk=…`, `version=5`, `underlying-proxy=🚦XD`.
    parameter: ($) =>
      seq(field("name", alias($._word, $.param_name)), "=", optional(field("value", $.value))),

    // `%APPEND%` / `%INSERT%`. Needs lexical precedence to beat `_word`,
    // which would otherwise match further and win on length.
    directive: () => token(prec(2, /%[A-Za-z]+%/)),

    // ---- [Rule] lines ---------------------------------------------------

    // Only logical rules treat parentheses as group delimiters. In every other
    // rule, parentheses remain part of values such as URL regex patterns.
    rule: ($) =>
      seq(
        optional($.requirement_prefix),
        choice(
          seq(field("type", alias($._logical_type, $.rule_type)), ",", $.group, ","),
          seq(field("type", alias($._word, $.rule_type)), ",", repeat(seq($.value, ","))),
        ),
        field("policy", $.policy),
        repeat(seq(",", $.rule_modifier)),
        optional($._line_suffix),
        $._newline,
      ),

    _logical_type: () => choice("AND", "OR", "NOT"),

    // The `((…),(…))` wrapper that AND/OR/NOT take.
    group: ($) => seq("(", $.nested_rule, repeat(seq(",", $.nested_rule)), ")"),

    // A rule nested inside a group carries no policy of its own.
    nested_rule: ($) =>
      seq(
        "(",
        field("type", alias($._group_word, $.rule_type)),
        ",",
        $._nested_arg,
        repeat(seq(",", $._nested_arg)),
        ")",
      ),

    _nested_arg: ($) => choice($.group, alias($._group_value, $.value)),

    _group_value: ($) => repeat1($._group_word),

    rule_modifier: () =>
      choice(
        "no-resolve",
        "force-remote-dns",
        "pre-matching",
        "extended-matching",
        "dns-failed",
      ),

    // ---- fallback -------------------------------------------------------

    // Sections such as [URL Rewrite] use whitespace-separated fields. Those
    // land here rather than producing ERROR nodes.
    raw_line: ($) =>
      seq(optional($.requirement_prefix), $.value, optional($._line_suffix), $._newline),

    key: ($) => repeat1($._word),
    value: ($) => repeat1($._word),
    policy: ($) => repeat1($._word),

    // Any whitespace-delimited run of non-structural characters. `value` and
    // `policy` join adjacent runs so names such as `SSID:XD Office` remain one
    // node. Parentheses are ordinary here because only logical rules use them
    // structurally; line-suffix markers still win through lexical precedence.
    _word: () => token(/[^\s,=\r\n]+/),

    // Inside a logical group, unmatched parentheses delimit nested rules. A
    // balanced pair can remain inside one argument, as in a URL regex.
    _group_word: () => token(/([^\s,=()\r\n]|\([^\s,=()\r\n]*\))+/),

    _newline: () => token(/\r?\n/),
  },
});
