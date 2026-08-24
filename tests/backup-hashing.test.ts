import { describe, it, expect } from "vitest";
import {
  artifactHash,
  canonicalizeJson,
  computeManifestHash,
  writeManifest,
  verifyManifest,
  computePackageHash,
  buildSignaturePayload,
} from "@/lib/backup/hashing";

describe("artifactHash", () => {
  it("is a deterministic sha256 of the exact bytes", () => {
    expect(artifactHash("hello")).toBe(artifactHash("hello"));
    expect(artifactHash("hello")).not.toBe(artifactHash("hello "));
  });
});

describe("canonicalizeJson", () => {
  it("produces identical output regardless of key insertion order", () => {
    expect(canonicalizeJson({ b: 1, a: 2 })).toBe(canonicalizeJson({ a: 2, b: 1 }));
  });

  it("sorts keys at every nesting level", () => {
    const nested = { z: { y: 1, x: 2 }, a: 1 };
    const reordered = { a: 1, z: { x: 2, y: 1 } };
    expect(canonicalizeJson(nested)).toBe(canonicalizeJson(reordered));
  });

  it("preserves array order (arrays are not sorted)", () => {
    expect(canonicalizeJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("changes when any value changes", () => {
    expect(canonicalizeJson({ a: 1 })).not.toBe(canonicalizeJson({ a: 2 }));
  });
});

describe("computeManifestHash — self-reference guard", () => {
  it("throws if content already contains a manifest_hash key", () => {
    expect(() => computeManifestHash({ tenant_id: "t1", manifest_hash: "x" })).toThrow(
      /manifest_hash/
    );
  });

  it("is deterministic for logically identical content regardless of key order", () => {
    const a = computeManifestHash({ tenant_id: "t1", count: 3 });
    const b = computeManifestHash({ count: 3, tenant_id: "t1" });
    expect(a).toBe(b);
  });

  it("changes when content changes", () => {
    const a = computeManifestHash({ count: 3 });
    const b = computeManifestHash({ count: 4 });
    expect(a).not.toBe(b);
  });
});

describe("writeManifest / verifyManifest round trip", () => {
  it("verifies successfully when untampered", () => {
    const written = writeManifest({ tenant_id: "t1", row_counts: { dues: 10 } });
    expect(written.manifest_hash).toBeTruthy();
    expect(verifyManifest(written)).toBe(true);
  });

  it("fails verification when content is tampered after writing", () => {
    const written = writeManifest({ tenant_id: "t1", row_counts: { dues: 10 } });
    const tampered = { ...written, row_counts: { dues: 999 } };
    expect(verifyManifest(tampered)).toBe(false);
  });

  it("never feeds manifest_hash back into its own computation", () => {
    // If this were self-referential, writing twice would produce different hashes
    // (since the second write would see a manifest_hash key). It must not.
    const content = { tenant_id: "t1" };
    const first = writeManifest(content);
    const contentOnly: Record<string, unknown> = { ...first };
    delete contentOnly.manifest_hash;
    const second = writeManifest(contentOnly);
    expect(first.manifest_hash).toBe(second.manifest_hash);
  });
});

describe("computePackageHash", () => {
  it("is independent of input array order", () => {
    const files = [
      { path: "b.json", sha256: "h2" },
      { path: "a.json", sha256: "h1" },
    ];
    expect(computePackageHash(files)).toBe(computePackageHash([...files].reverse()));
  });

  it("changes if any file's hash changes", () => {
    const before = [{ path: "a.json", sha256: "h1" }];
    const after = [{ path: "a.json", sha256: "h2" }];
    expect(computePackageHash(before)).not.toBe(computePackageHash(after));
  });

  it("changes if a file is added or removed", () => {
    const one = [{ path: "a.json", sha256: "h1" }];
    const two = [...one, { path: "b.json", sha256: "h2" }];
    expect(computePackageHash(one)).not.toBe(computePackageHash(two));
  });
});

describe("buildSignaturePayload", () => {
  it("concatenates manifest and package hashes with a pipe separator", () => {
    expect(buildSignaturePayload("m", "p")).toBe("m|p");
  });

  it("is order-sensitive between manifest and package hash", () => {
    expect(buildSignaturePayload("m", "p")).not.toBe(buildSignaturePayload("p", "m"));
  });
});
