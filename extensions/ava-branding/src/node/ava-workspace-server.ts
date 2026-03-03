import { injectable } from '@theia/core/shared/inversify';
import { DefaultWorkspaceServer } from '@theia/workspace/lib/node/default-workspace-server';

/**
 * Extends Theia's DefaultWorkspaceServer to skip empty string entries in
 * recentworkspace.json. Without this, an empty string ("") persists as the
 * most-recent entry and the IDE always opens with no folder loaded.
 */
@injectable()
export class AvaWorkspaceServer extends DefaultWorkspaceServer {

  protected override async getRoot(): Promise<string | undefined> {
    // Prefer CLI argument
    const fromCli = await this.getWorkspaceURIFromCli();
    if (fromCli) {
      return fromCli;
    }

    // Read recent workspaces and return the first *non-empty* entry
    const data = await this.readRecentWorkspacePathsFromUserHome();
    if (data && data.recentRoots) {
      for (const root of data.recentRoots) {
        if (root && root.length > 0) {
          return root;
        }
      }
    }
    return undefined;
  }

  override async setMostRecentlyUsedWorkspace(rawUri: string): Promise<void> {
    // Don't let an empty URI push to the front of the recent list —
    // only persist actual workspace paths
    if (!rawUri || rawUri.length === 0) {
      return;
    }
    return super.setMostRecentlyUsedWorkspace(rawUri);
  }
}
