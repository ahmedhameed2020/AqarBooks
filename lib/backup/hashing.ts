/**
 * Deterministic hashing for tenant backup packages.
 *
 * Implements the Phase 0 §24/§29 design: every hash is computed over a byte
 * range that provably excludes the field being written, either by computing
 * the hash before the field exists and appending it afterward (manifest
 * pattern), or by storing the hash somewhere structurally outside the
 * content it covers (package pattern). See
 * docs/backup-recovery/tenant-backup-format-v1.md for the full package
 * layout this module serves.
 *
 * This module implements hashing only. It does NOT sign anything and does
 * NOT touch KMS/key-management infrastructure — Phase 1 is explicitly
 * prohibited from deploying that. `buildSignaturePayload` returns the exact
 * bytes a future signer would sign; nothing here calls a signing key.
 */

import { createHash } from "node:crypto";

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function artifactHash(bytes: Uint8Array | string): string {
  return sha256Hex(bytes);
}

/**
 * Minimal RFC 8785-style canonical JSON serialization: object keys sorted
 * lexicographically at every level, no insignificant whitespace. Sufficient
 * for the plain manifest structures this package produces (string/number/
 * boolean/null/array/object) — does not attempt ECMA-262 canonical number
 * formatting edge cases (e.g. exotic floats), since manifest fields are
 * counts, ids, and ISO timestamps, never arbitrary floating point.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
  return `{${entries.join(",")}}`;
}

export type ManifestContent = Record<string, unknown>;
export type WrittenManifest = ManifestContent & { manifest_hash: string };

/**
 * Computes the manifest hash over `content`. Throws if `content` already
 * carries a `manifest_hash` key — that would be exactly the self-referential
 * hashing bug this design exists to prevent (Phase 0 §24).
 */
export function computeManifestHash(content: ManifestContent): string {
  if (Object.prototype.hasOwnProperty.call(content, "manifest_hash")) {
    throw new Error(
      "computeManifestHash: content must not already include manifest_hash — " +
        "compute the hash over content first, then append manifest_hash afterward."
    );
  }
  return sha256Hex(canonicalizeJson(content));
}

/** Computes the hash and returns content with `manifest_hash` appended — never fed back into its own hash. */
export function writeManifest(content: ManifestContent): WrittenManifest {
  const manifest_hash = computeManifestHash(content);
  return { ...content, manifest_hash };
}

/** Re-derives the hash from `written` with `manifest_hash` excluded, and compares. */
export function verifyManifest(written: WrittenManifest): boolean {
  const { manifest_hash, ...content } = written;
  return computeManifestHash(content) === manifest_hash;
}

export interface FileHashEntry {
  path: string;
  sha256: string;
}

/**
 * Merkle-root-style hash over the sorted (path, sha256) index of every
 * artifact in the package — deliberately never a hash of raw archive bytes,
 * since zip/tar timestamps and metadata are non-deterministic and would
 * make verification unreproducible (Phase 0 §24). Order-independent: the
 * input list is sorted internally before hashing.
 */
export function computePackageHash(files: readonly FileHashEntry[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const concat = sorted.map((f) => `${f.path}\0${f.sha256}\n`).join("");
  return sha256Hex(concat);
}

/**
 * The exact payload a future signer signs — manifest hash and package hash
 * concatenated. This function does not sign anything; it exists so the
 * eventual signing step (Phase 2+, KMS-backed) has a single, tested
 * definition of what bytes are being signed, with no ambiguity introduced
 * later.
 */
export function buildSignaturePayload(manifestHash: string, packageHash: string): string {
  return `${manifestHash}|${packageHash}`;
}
