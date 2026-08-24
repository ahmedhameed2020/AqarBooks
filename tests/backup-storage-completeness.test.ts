import { describe, it, expect } from "vitest";
import {
  evaluatePackageStorageState,
  evaluateEmptyManifestState,
} from "@/lib/backup/storage-completeness";

describe("evaluatePackageStorageState", () => {
  it("is COMPLETE_VERIFIED when every object is CAPTURED", () => {
    expect(evaluatePackageStorageState(["CAPTURED", "CAPTURED"], false)).toBe(
      "COMPLETE_VERIFIED"
    );
  });

  it("is INCOMPLETE (not FAILED) while pending objects remain before cutoff", () => {
    expect(evaluatePackageStorageState(["CAPTURED", "PENDING"], false)).toBe("INCOMPLETE");
  });

  it("is FAILED when a capture failure remains at cutoff, even if every other object succeeded", () => {
    expect(evaluatePackageStorageState(["CAPTURED", "CAPTURE_FAILED"], true)).toBe("FAILED");
  });

  it("is FAILED when a checksum mismatch remains at cutoff", () => {
    expect(evaluatePackageStorageState(["CAPTURED", "CHECKSUM_MISMATCH"], true)).toBe("FAILED");
  });

  it("is FAILED, not COMPLETE_VERIFIED, when objects are still unresolved at cutoff", () => {
    expect(evaluatePackageStorageState(["CAPTURED", "IN_PROGRESS"], true)).toBe("FAILED");
  });

  it("never returns COMPLETE_VERIFIED if any object failed or mismatched, regardless of cutoff", () => {
    expect(evaluatePackageStorageState(["CAPTURE_FAILED"], false)).not.toBe("COMPLETE_VERIFIED");
    expect(evaluatePackageStorageState(["CAPTURE_FAILED"], true)).not.toBe("COMPLETE_VERIFIED");
  });
});

describe("evaluateEmptyManifestState", () => {
  it("is COMPLETE_VERIFIED for a tenant with zero referenced Storage objects", () => {
    expect(evaluateEmptyManifestState()).toBe("COMPLETE_VERIFIED");
  });
});
