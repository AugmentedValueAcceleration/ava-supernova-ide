import { AvaOnboardingDialog } from './ava-onboarding-dialog';

export const AvaOnboardingDialogFactory = Symbol('AvaOnboardingDialogFactory');
export type AvaOnboardingDialogFactory = () => AvaOnboardingDialog;
