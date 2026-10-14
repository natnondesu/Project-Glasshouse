import type { Id } from '../model/types';

export type Severity = 'block' | 'needs_ack' | 'warn';

export type IssueCode =
  | 'footprint_empty'
  | 'footprint_disconnected'
  | 'object_outside_footprint'
  | 'object_overlap'
  | 'clearance_outside_footprint'
  | 'clearance_obstructed'
  | 'clearance_door'
  | 'device_too_deep'
  | 'demand_unknown'
  | 'reserved_demand_unknown'
  | 'over_design_limit'
  | 'feed_no_way'
  | 'feed_overload'
  | 'link_media_mismatch'
  | 'vlan_access_mismatch'
  | 'vlan_native_mismatch'
  | 'vlan_allowed_mismatch';

export interface Issue {
  key: string;
  code: IssueCode;
  severity: Severity;
  /** English wording; the UI rebuilds it from `code` and `params` in the active language. */
  message: string;
  hint: string;
  params: Record<string, string | number>;
  targets: Id[];
}
