/**
 * Test stub for the `server-only` package.
 *
 * The real package throws on import so that a server module cannot be pulled
 * into a client bundle. That guard is correct in the app and wrong in vitest,
 * which runs in Node and is neither a server nor a client build -- it made
 * every pure module behind it untestable.
 *
 * Aliasing it here keeps the production guard exactly as it is (the app build
 * still resolves the real package) while letting tests import the logic. The
 * alternative -- dropping `import "server-only"` from modules so they can be
 * tested -- would trade a real safety property for testability.
 */
export {};
