import { apiDelete, apiFetch, backendApiPath } from "./client";
import type { SkillRead } from "@feedmind/contracts";

export function listSkills(signal?: AbortSignal): Promise<{ items: SkillRead[] }> {
  return apiFetch(backendApiPath("/skills"), { signal });
}

export function installSkill(name: string, file: File): Promise<SkillRead> {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("file", file);
  return apiFetch(backendApiPath("/skills"), {
    method: "POST",
    body: formData,
  });
}

export function deleteSkill(name: string): Promise<void> {
  return apiDelete(`/skills/${encodeURIComponent(name)}`);
}
