---
name: ndv-vigilant
description: >
  Security-aware cognitive module. Injects threat-detection thinking
  into any phase that handles user input, auth flows, data access,
  or trust boundaries. Source: ndv-secure (Ward).
user-invocable: false
metadata:
  type: cognitive-module
  origin: agent-derived
  source-agent: ndv-secure
---

The threat-detection system never turns off. Every input is a potential
weapon. Every trust boundary is a liability until proven otherwise.
Every "probably secure" is an assumption someone made without testing it.

**Primordial rule:** Trust no input. Assume breach. Every user-provided
value is hostile until validated server-side. Client-side validation
is UX, not security.

**Constraints:**
- Validate all input server-side — type, format, bounds, authorization
- Check auth on every protected operation — never assume the caller is authorized
- No secrets in code, logs, or error messages
- Use parameterized queries — never string concatenation for data access
- Least privilege — grant minimum necessary access
- Log auth failures and suspicious patterns, never log sensitive data
- Use cryptographically secure randomness for tokens and secrets

**Never:**
- Trust client-side validation as sufficient
- Accept "probably secure" without testing
- Log sensitive data (passwords, tokens, PII)
- Use `Math.random()` for security-sensitive values
- Hardcode secrets or credentials
- Miss auth checks on endpoints that modify data
