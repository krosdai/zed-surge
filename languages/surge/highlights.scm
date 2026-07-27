; Patterns are kept mutually exclusive — no two of them can capture the same
; node — so capture precedence never has to be reasoned about.

(comment) @comment
(inline_comment) @comment
(hashbang_directive_marker) @keyword
(hashbang_directive_value) @string.special
(requirement_marker) @keyword
(requirement_expression) @string.special

; ---- section headers -------------------------------------------------------

(section_name) @title
(section_header ["[" "]"] @punctuation.bracket)

; ---- key = value -----------------------------------------------------------

(key) @property
(param_name) @attribute
(directive) @keyword

; ---- [Rule] lines ----------------------------------------------------------

; DOMAIN-SUFFIX, GEOIP, RULE-SET, IP-CIDR, AND, OR, FINAL, …
(rule_type) @keyword

; The routing target the rule resolves to.
(policy) @constant

; no-resolve, force-remote-dns, …
(rule_modifier) @attribute

; ---- punctuation -----------------------------------------------------------

"," @punctuation.delimiter
["(" ")"] @punctuation.bracket
"=" @operator

; ---- value refinements -----------------------------------------------------

((value) @boolean
  (#match? @boolean "^\\s*(true|false)$"))

((value) @constant.builtin
  (#match? @constant.builtin "^\\s*(DIRECT|REJECT|REJECT-TINYGIF|REJECT-DROP|REJECT-NO-DROP)$"))

((value) @number
  (#match? @number "^\\s*[0-9]+$"))

((value) @link_uri
  (#match? @link_uri "^\\s*https?://"))
