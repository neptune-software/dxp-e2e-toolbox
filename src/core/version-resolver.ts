/**
 * Version resolver for dynamically finding the best matching class based on semver.
 * 
 * Given a requested version like "23.10.0005", it will:
 * 1. Look for exact match: LaunchpadSapEditionV23_10_0005
 * 2. Fall back to minor version: LaunchpadSapEditionV23_10
 * 3. Fall back to major version: LaunchpadSapEditionV23
 * 4. Fall back to base class: LaunchpadSapEdition
 */

import { DxpEditionType, DxpVersion, ParsedVersion } from "./types.js";
import { VersionResolutionError } from "./errors.js";

/**
 * Registry entry for a versioned class.
 */
interface VersionedClassEntry<T> {
  /**
   * The version pattern this class handles (e.g., "23", "23.10", "23.10.0005").
   */
  versionPattern: string;

  /**
   * Parsed version for comparison.
   */
  parsed: ParsedVersion;

  /**
   * The class constructor or factory function.
   */
  factory: () => T | Promise<T>;
}

/**
 * Parse a version string into components.
 * Supports formats: "23", "23.10", "23.10.0005"
 */
export function parseVersion(version: string): ParsedVersion {
  // Remove 'V' prefix if present (for class names)
  const cleanVersion = version.replace(/^V/, "").replace(/_/g, ".");
  
  const parts = cleanVersion.split(".");
  return {
    major: parseInt(parts[0], 10) || 0,
    minor: parseInt(parts[1], 10) || 0,
    patch: parseInt(parts[2], 10) || 0,
    raw: version,
  };
}

/**
 * Compare two parsed versions.
 * Returns: negative if a < b, 0 if equal, positive if a > b
 */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Check if a version pattern matches a target version (target >= pattern).
 */
export function versionMatches(pattern: ParsedVersion, target: ParsedVersion): boolean {
  // Pattern must be <= target for each specified component
  if (pattern.major > target.major) return false;
  if (pattern.major < target.major) return true;
  
  // Major matches, check minor
  if (pattern.minor > target.minor) return false;
  if (pattern.minor < target.minor) return true;
  
  // Major and minor match, check patch
  return pattern.patch <= target.patch;
}

/**
 * Calculate how specific a version pattern is (for sorting).
 * More specific = higher score.
 */
export function versionSpecificity(version: ParsedVersion): number {
  let specificity = 0;
  if (version.major > 0) specificity += 1000000;
  if (version.minor > 0) specificity += 1000;
  if (version.patch > 0) specificity += 1;
  return specificity + version.major * 100 + version.minor * 10 + version.patch;
}

/**
 * Version resolver for finding the best matching versioned class.
 */
export class VersionResolver<T> {
  private readonly edition: DxpEditionType;
  private readonly registry: Map<string, VersionedClassEntry<T>> = new Map();
  private baseFactory?: () => T | Promise<T>;

  constructor(edition: DxpEditionType, _baseClassName?: string) {
    this.edition = edition;
  }

  /**
   * Register the base (non-versioned) class.
   */
  public registerBase(factory: () => T | Promise<T>): this {
    this.baseFactory = factory;
    return this;
  }

  /**
   * Register a versioned class.
   * @param versionPattern Version pattern like "23", "23.10", or "23.10.0005"
   * @param factory Factory function to create the class instance
   */
  public register(versionPattern: string, factory: () => T | Promise<T>): this {
    const parsed = parseVersion(versionPattern);
    this.registry.set(versionPattern, {
      versionPattern,
      parsed,
      factory,
    });
    return this;
  }

  /**
   * Find the best matching class for the given version.
   * @param version The target version to match (e.g., "23.10.0005")
   * @returns The factory for the best matching class
   * 
   * Selection algorithm:
   * 1. Find all registered versions where pattern <= target
   * 2. Select the HIGHEST version that matches
   * 3. If two versions have the same major.minor.patch value, prefer the more specific one
   */
  public resolve(version: DxpVersion): () => T | Promise<T> {
    const targetVersion = parseVersion(version);
    
    // Find all matching entries (where pattern <= target)
    const matches: VersionedClassEntry<T>[] = [];
    
    for (const entry of this.registry.values()) {
      if (versionMatches(entry.parsed, targetVersion)) {
        matches.push(entry);
      }
    }
    
    if (matches.length === 0) {
      // No versioned matches, use base factory
      if (this.baseFactory) {
        return this.baseFactory;
      }
      throw new VersionResolutionError(version, this.edition);
    }
    
    // Sort by version (highest first), then by specificity (most specific first)
    // This ensures version 23 is selected over 22.10 when target is 24.x
    matches.sort((a, b) => {
      // First, compare by version (highest wins)
      const versionDiff = compareVersions(b.parsed, a.parsed);
      if (versionDiff !== 0) return versionDiff;
      // If versions are equal, prefer more specific (22.10 over 22)
      return versionSpecificity(b.parsed) - versionSpecificity(a.parsed);
    });
    
    // Return the highest matching version
    console.log(`[VersionResolver] Resolved version ${version} to ${matches[0].versionPattern}`);
    return matches[0].factory;
  }

  /**
   * Create an instance using the best matching class for the given version.
   */
  public async create(version: DxpVersion): Promise<T> {
    const factory = this.resolve(version);
    return factory();
  }

  /**
   * Get all registered version patterns.
   */
  public getRegisteredVersions(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Check if a specific version pattern is registered.
   */
  public hasVersion(versionPattern: string): boolean {
    return this.registry.has(versionPattern);
  }
}

/**
 * Convert a version string to a class name suffix.
 * "23.10.0005" -> "V23_10_0005"
 */
export function versionToClassSuffix(version: string): string {
  return "V" + version.replace(/\./g, "_");
}

/**
 * Extract version from a class name suffix.
 * "V23_10_0005" -> "23.10.0005"
 */
export function classSuffixToVersion(suffix: string): string {
  return suffix.replace(/^V/, "").replace(/_/g, ".");
}
