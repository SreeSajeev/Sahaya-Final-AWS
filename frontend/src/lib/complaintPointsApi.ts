/** Complaint point row from GET/POST /complaint-points (Phase 2 backend). */
export type ComplaintPointStatus = "active" | "disabled";

export interface ComplaintPoint {
  id: string;
  organisation_id: string;
  name: string;
  description: string | null;
  building: string | null;
  floor: string | null;
  site_name: string | null;
  asset_reference: string | null;
  default_client_slug: string | null;
  default_category: string | null;
  default_issue_type: string | null;
  public_token: string;
  public_url: string | null;
  status: ComplaintPointStatus;
  token_version: number;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
  created_by_user_id: string | null;
}

export type ComplaintPointCreateBody = {
  name: string;
  description?: string | null;
  building?: string | null;
  floor?: string | null;
  site_name?: string | null;
  asset_reference?: string | null;
  default_client_slug?: string | null;
  default_category?: string | null;
  default_issue_type?: string | null;
  organisation_id?: string;
};

export type ComplaintPointUpdateBody = Partial<
  Omit<ComplaintPointCreateBody, "organisation_id">
> & {
  status?: ComplaintPointStatus;
};
