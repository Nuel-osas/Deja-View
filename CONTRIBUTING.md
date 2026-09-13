# Contributing

Use Node.js 22 or newer, install with `npm ci`, and run `npm test`, `npm run test:browser`, and `npm run check` before submitting a change.

Prefer locally generated fixture sites in tests. Keep downloaded websites, third-party asset bundles, credentials and personal capture reports out of commits. Changes to capture completeness should include an example that demonstrates the behavior and a test that fails without the fix.

Describe timing results together with their scope, failed resources and separate validation. Do not describe a ZIP, partial download or site-specific migration as a universal clone.

The tool currently has no open-source license assigned. Dependencies retain their own licenses.
