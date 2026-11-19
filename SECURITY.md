# Security

Kármán is a static page. It has no server, no accounts and no secrets, and it stores nothing beyond layer preferences and cached copies of a few public feeds in the visitor's own browser.

## Reporting a problem

If you find a way to make the page run untrusted code, leak a visitor's data, or load content from somewhere it should not, please report it privately:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**.

Please do not open a public issue for a security problem.

## What the page defends against

- Text from feeds is escaped before it reaches the page, and links are limited to `http` and `https`.
- A Content-Security-Policy restricts scripts to the page itself and two named CDNs, and blocks plugins, form posts and base-URL changes.
- No third-party analytics or advertising code is loaded.
