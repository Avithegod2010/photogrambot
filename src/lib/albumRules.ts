// Album auto-add rules (pure matching). A rule is folder substring, tag
// substring and/or favorites-only; all present conditions must match. Rules
// are applied to albums by albumRulesApply.ts.

import type { PhotoRow } from "./db";

export interface AlbumRule {
  folder?: string;
  tag?: string;
  favorite?: boolean;
}

export function hasRuleConditions(rule: AlbumRule | null | undefined): boolean {
  if (!rule) return false;
  return !!(rule.folder?.trim() || rule.tag?.trim() || rule.favorite);
}

export function matchesAlbumRule(photo: PhotoRow, rule: AlbumRule): boolean {
  if (!hasRuleConditions(rule)) return false;
  if (rule.folder?.trim()) {
    const folder = rule.folder.trim().toLowerCase();
    if (!(photo.folder ?? "").toLowerCase().includes(folder)) return false;
  }
  if (rule.tag?.trim()) {
    const tag = rule.tag.trim().toLowerCase();
    if (!(photo.tags ?? "").toLowerCase().includes(tag)) return false;
  }
  if (rule.favorite && !photo.favorite) return false;
  return true;
}

export function ruleSummary(rule: AlbumRule | null | undefined): string {
  if (!hasRuleConditions(rule)) return "No auto-add rule";
  const parts: string[] = [];
  if (rule?.folder?.trim()) parts.push(`folder contains "${rule.folder.trim()}"`);
  if (rule?.tag?.trim()) parts.push(`tag contains "${rule.tag.trim()}"`);
  if (rule?.favorite) parts.push("favorites only");
  return parts.join(" · ");
}
