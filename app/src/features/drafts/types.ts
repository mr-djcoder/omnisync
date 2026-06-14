export type SourcePostVM = { id: string; type: string; text: string; media: string[] };
export type DraftVM = { id: string; source_post_id: string | null; origin: string; status: string };
export type DraftTargetVM = { id: string; connection_id: string; text: string; media: string[] };
