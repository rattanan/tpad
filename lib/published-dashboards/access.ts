import type { Role } from "@/lib/db/schema";

export type PublicationAccessInput = {
  visibility: "PRIVATE" | "ROLE" | "WORKSPACE";
  allowedRolesJson: string | null;
  allowedUserIdsJson: string | null;
};

function stringArray(value: string | null) {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; }
  catch { return []; }
}

export function canAccessPublication(publication: PublicationAccessInput, user: { id: string; role: Role }) {
  if (user.role === "ADMIN") return true;
  if (stringArray(publication.allowedUserIdsJson).includes(user.id)) return true;
  if (publication.visibility === "WORKSPACE") return true;
  if (publication.visibility === "ROLE") return stringArray(publication.allowedRolesJson).includes(user.role);
  return false;
}
