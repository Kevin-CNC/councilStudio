import { invoke } from "@tauri-apps/api/core";
import type { Persona, PersonaCreate, PersonaUpdate } from "@/types";

/**
 * Create a new council member. The backend assigns a UUID id and sort order.
 */
export async function createMember(data: PersonaCreate): Promise<Persona> {
  return invoke<Persona>("create_member", { payload: data });
}

/**
 * List all council members ordered by sort order.
 */
export async function listMembers(): Promise<Persona[]> {
  return invoke<Persona[]>("list_members");
}

/**
 * Partially update an existing member. Only the fields provided will be changed.
 */
export async function updateMember(
  id: string,
  updates: PersonaUpdate
): Promise<Persona> {
  return invoke<Persona>("update_member", {
    request: { id, updates },
  });
}

/**
 * Permanently delete a member by id.
 */
export async function deleteMember(id: string): Promise<void> {
  return invoke<void>("delete_member", { request: { id } });
}

/**
 * Batch update the sort order of members. Each item specifies the member id
 * and its new position (0-based).
 */
export async function reorderMembers(
  order: { id: string; order: number }[]
): Promise<void> {
  return invoke<void>("reorder_members", { items: order });
}

/**
 * Seed the four default personas (Pragmatist, Skeptic, Visionary, Specialist)
 * if the database is empty. Does nothing if members already exist.
 */
export async function seedDefaultMembers(): Promise<Persona[]> {
  return invoke<Persona[]>("seed_default_members");
}