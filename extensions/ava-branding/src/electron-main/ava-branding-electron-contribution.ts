import { injectable } from '@theia/core/shared/inversify';
import { ElectronMainApplication, ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { nativeTheme } from '@theia/core/electron-shared/electron';

/**
 * Forces Electron into dark mode so Windows 11 draws a dark window border
 * instead of the default grey DWM chrome.
 */
@injectable()
export class AvaBrandingElectronContribution implements ElectronMainApplicationContribution {

  onStart(_application: ElectronMainApplication): void {
    // Force dark mode — Windows 11 DWM respects this for the window border color
    nativeTheme.themeSource = 'dark';
  }
}
