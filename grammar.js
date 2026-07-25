/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Tree-sitter grammar for Surge (nssurge.com) configuration files.
//
// Surge's format is INI-shaped but not INI: the [Rule] section holds
// positional comma-separated rules (no `=` at all), values may contain
// spaces (`SSID:XD Office`) and emoji (`🧡XD:000`), and AND/OR rules nest
// arbitrarily deep inside parentheses.

module.exports = grammar({
  name: 'surge',

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

    // `[General]`, and also named sections like `[Tailscale ts-007]`.
    section_header: ($) =>
      seq(
        '[',
        alias(token(/[^\[\]\r\n]+/), $.section_name),
        ']',
        $._newline,
      ),

    _line: ($) =>
      choice($._newline, $.comment, $.setting, $.rule, $.raw_line),

    // Only reachable at the start of a line, so a `#` inside a value stays
    // part of that value instead of swallowing the rest of the line.
    comment: () => token(prec(3, seq(/[#;]/, /[^\r\n]*/))),

    // ---- key = value ----------------------------------------------------

    setting: ($) =>
      seq(
        field('name', alias($._word, $.key)),
        '=',
        optional($.value_list),
        $._newline,
      ),

    value_list: ($) =>
      seq(optional($.directive), $._item, repeat(seq(',', $._item))),

    _item: ($) => choice($.parameter, $.value),

    // Inline `psk=…`, `version=5`, `underlying-proxy=🚦XD`.
    parameter: ($) =>
      seq(
        field('name', alias($._word, $.param_name)),
        '=',
        optional(field('value', $.value)),
      ),

    // `%APPEND%` / `%INSERT%`. Needs lexical precedence to beat `_word`,
    // which would otherwise match further and win on length.
    directive: () => token(prec(2, /%[A-Za-z]+%/)),

    // ---- [Rule] lines ---------------------------------------------------

    rule: ($) =>
      seq(
        field('type', alias($._word, $.rule_type)),
        ',',
        repeat(seq($._rule_arg, ',')),
        field('policy', $.policy),
        repeat(seq(',', $.rule_modifier)),
        $._newline,
      ),

    _rule_arg: ($) => choice($.group, $.value),

    // The `((…),(…))` wrapper that AND/OR/NOT take.
    group: ($) =>
      seq('(', $.nested_rule, repeat(seq(',', $.nested_rule)), ')'),

    // A rule nested inside a group carries no policy of its own.
    nested_rule: ($) =>
      seq(
        '(',
        field('type', alias($._word, $.rule_type)),
        ',',
        $._rule_arg,
        repeat(seq(',', $._rule_arg)),
        ')',
      ),

    rule_modifier: () =>
      choice(
        'no-resolve',
        'force-remote-dns',
        'pre-matching',
        'extended-matching',
        'dns-failed',
      ),

    // ---- fallback -------------------------------------------------------

    // Sections such as [URL Rewrite] use whitespace-separated fields. Those
    // land here rather than producing ERROR nodes.
    raw_line: ($) => seq($.value, $._newline),

    value: ($) => $._word,
    policy: ($) => $._word,

    // Any run of characters that is not structural. Internal spaces are kept
    // (`SSID:XD Office`), leading/trailing ones are not.
    _word: () =>
      token(/[^\s,=()\[\]#;][^,=()\r\n]*[^\s,=()\r\n]|[^\s,=()\[\]#;]/),

    _newline: () => token(/\r?\n/),
  },
});
