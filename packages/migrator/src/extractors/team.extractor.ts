import { YouTrackClient } from '../youtrack/youtrack-client';

// YouTrack default project-role names → NextTrack role names. NextTrack resolves
// the name to a role id and falls back to Developer for anything not mapped here
// (or not present in the target), so an incomplete map degrades safely.
const YT_ROLE_MAP: Record<string, string> = {
  'project admin': 'Project Admin',
  administrator: 'Project Admin',
  admin: 'Project Admin',
  developer: 'Developer',
  contributor: 'Developer',
  reporter: 'Reporter',
  observer: 'Observer',
};

export function mapYtRole(ytRoleName?: string): string | undefined {
  if (!ytRoleName) return undefined;
  return YT_ROLE_MAP[ytRoleName.trim().toLowerCase()];
}

export class TeamExtractor {
  constructor(private yt: YouTrackClient) {}

  /**
   * Returns a YouTrack userId → YouTrack project-role name map for the project.
   *
   * Best-effort: the team/roles surface is YouTrack-version-dependent (folded
   * into the app REST API in 2026.1, Hub-only before), so on any failure this
   * returns an empty map and every member falls back to the default role.
   * VERIFY the endpoint/shape against the target instance during the pilot — if
   * roles come back empty, adjust the request here.
   */
  async getUserRoles(projectId: string): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    try {
      const roles = await this.yt.get<
        Array<{ role?: { name?: string }; users?: Array<{ id?: string }> }>
      >(`/admin/projects/${projectId}/team/projectRoles`, {
        fields: 'role(name),users(id)',
      });
      for (const entry of roles ?? []) {
        const roleName = entry?.role?.name;
        if (!roleName) continue;
        for (const user of entry?.users ?? []) {
          if (user?.id) result.set(user.id, roleName);
        }
      }
    } catch {
      // Version/permission mismatch — fall back to the default role for all.
    }
    return result;
  }
}
