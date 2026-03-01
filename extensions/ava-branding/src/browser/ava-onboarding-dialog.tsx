import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import { DialogProps } from '@theia/core/lib/browser/dialogs';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { CommandService } from '@theia/core/lib/common/command';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  outer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px',
    minWidth: 420,
    maxWidth: 480,
    fontFamily: 'var(--theia-ui-font-family)',
    color: 'var(--theia-foreground)',
  },
  logo: {
    fontSize: 32,
    fontWeight: 700,
    background: 'linear-gradient(135deg, var(--ava-gradient-start, #6366F1), var(--ava-gradient-end, #8B5CF6))',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 32,
    textAlign: 'center' as const,
  },
  heading: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 8,
  },
  desc: {
    fontSize: 13,
    opacity: 0.6,
    marginBottom: 24,
    textAlign: 'center' as const,
  },
  cardsRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 32,
    width: '100%',
    justifyContent: 'center',
  },
  card: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px 12px',
    border: '2px solid var(--theia-panel-border)',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s',
    background: 'transparent',
    color: 'var(--theia-foreground)',
    fontSize: 14,
    fontWeight: 500,
    fontFamily: 'var(--theia-ui-font-family)',
    minHeight: 60,
  },
  cardSelected: {
    borderColor: 'var(--ava-accent, #6366F1)',
    background: 'rgba(99, 102, 241, 0.1)',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: 600,
  },
  cardHint: {
    fontSize: 11,
    opacity: 0.5,
    marginTop: 4,
  },
  primaryBtn: {
    padding: '10px 32px',
    background: 'var(--ava-accent, #6366F1)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--theia-ui-font-family)',
    transition: 'background 0.2s',
  },
  ghostBtn: {
    padding: '8px 24px',
    background: 'transparent',
    color: 'var(--theia-foreground)',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
    opacity: 0.6,
    fontFamily: 'var(--theia-ui-font-family)',
  },
  dots: {
    display: 'flex',
    gap: 6,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--theia-panel-border)',
    transition: 'background 0.2s',
  },
  dotActive: {
    background: 'var(--ava-accent, #6366F1)',
  },
  footer: {
    fontSize: 12,
    opacity: 0.4,
    marginTop: 16,
  },
};

// ── Wizard Steps ──────────────────────────────────────────────────────────────

interface StepProps {
  onNext: () => void;
  onSkip: () => void;
  themeService: ThemeService;
  preferenceService: PreferenceService;
  commandService: CommandService;
}

function StepWelcome({ onNext }: StepProps): React.ReactElement {
  return (
    <div style={s.outer}>
      <div style={s.logo}>Ava | Supernova</div>
      <div style={s.subtitle}>Open-source agentic coding for everyone</div>
      <button
        style={s.primaryBtn}
        onClick={onNext}
        onMouseEnter={e => { (e.target as HTMLElement).style.background = '#5558E6'; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.background = 'var(--ava-accent, #6366F1)'; }}
      >
        Get Started
      </button>
    </div>
  );
}

function StepTheme({ onNext, onSkip, themeService }: StepProps): React.ReactElement {
  const current = themeService.getCurrentTheme().id;
  const [selected, setSelected] = React.useState(current);

  const pick = (id: string) => {
    setSelected(id);
    themeService.setCurrentTheme(id, true);
  };

  const themes = [
    { id: 'ava-dark', label: 'Dark', hint: 'Easy on the eyes' },
    { id: 'ava-light', label: 'Light', hint: 'Clean and bright' },
  ];

  return (
    <div style={s.outer}>
      <div style={s.heading}>Choose your theme</div>
      <div style={s.desc}>You can change this anytime in Settings</div>
      <div style={s.cardsRow}>
        {themes.map(t => (
          <button
            key={t.id}
            style={{
              ...s.card,
              ...(selected === t.id ? s.cardSelected : {}),
            }}
            onClick={() => pick(t.id)}
          >
            <div style={s.cardLabel}>{t.label}</div>
            <div style={s.cardHint}>{t.hint}</div>
          </button>
        ))}
      </div>
      <button
        style={s.primaryBtn}
        onClick={onNext}
        onMouseEnter={e => { (e.target as HTMLElement).style.background = '#5558E6'; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.background = 'var(--ava-accent, #6366F1)'; }}
      >
        Continue
      </button>
      <button style={s.ghostBtn} onClick={onSkip}>Skip setup</button>
    </div>
  );
}

function StepFontSize({ onNext, onSkip, preferenceService }: StepProps): React.ReactElement {
  const sizes = [
    { label: 'Small', value: 12 },
    { label: 'Medium', value: 14 },
    { label: 'Large', value: 16 },
  ];
  const [selected, setSelected] = React.useState(14);

  const pick = (value: number) => {
    setSelected(value);
    preferenceService.set('editor.fontSize', value);
  };

  return (
    <div style={s.outer}>
      <div style={s.heading}>Choose your font size</div>
      <div style={s.desc}>Pick what's comfortable for you</div>
      <div style={s.cardsRow}>
        {sizes.map(sz => (
          <button
            key={sz.value}
            style={{
              ...s.card,
              ...(selected === sz.value ? s.cardSelected : {}),
            }}
            onClick={() => pick(sz.value)}
          >
            <div style={{ fontSize: sz.value, fontWeight: 600 }}>{sz.label}</div>
            <div style={s.cardHint}>{sz.value}px</div>
          </button>
        ))}
      </div>
      <button
        style={s.primaryBtn}
        onClick={onNext}
        onMouseEnter={e => { (e.target as HTMLElement).style.background = '#5558E6'; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.background = 'var(--ava-accent, #6366F1)'; }}
      >
        Continue
      </button>
      <button style={s.ghostBtn} onClick={onSkip}>Skip setup</button>
    </div>
  );
}

function StepConnectProvider({ onNext, onSkip, commandService }: StepProps): React.ReactElement {
  const handleOpenDashboard = () => {
    commandService.executeCommand('ava.dashboard.toggle');
    onNext();
  };

  return (
    <div style={s.outer}>
      <div style={s.heading}>Connect your AI provider</div>
      <div style={s.desc}>
        Ava works with DeepSeek, Kimi, and more.
        <br />
        Add an API key in the Dashboard to get started.
      </div>
      <button
        style={s.primaryBtn}
        onClick={handleOpenDashboard}
        onMouseEnter={e => { (e.target as HTMLElement).style.background = '#5558E6'; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.background = 'var(--ava-accent, #6366F1)'; }}
      >
        Open Dashboard
      </button>
      <button style={s.ghostBtn} onClick={onSkip}>Skip — I'll do this later</button>
    </div>
  );
}

function StepOpenFolder({ onNext, onSkip, commandService }: StepProps): React.ReactElement {
  const handleOpenFolder = () => {
    commandService.executeCommand(WorkspaceCommands.OPEN_FOLDER.id);
    onNext();
  };

  return (
    <div style={s.outer}>
      <div style={s.heading}>Open a project</div>
      <div style={s.desc}>
        Open a folder to start coding, or explore the IDE first.
      </div>
      <button
        style={s.primaryBtn}
        onClick={handleOpenFolder}
        onMouseEnter={e => { (e.target as HTMLElement).style.background = '#5558E6'; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.background = 'var(--ava-accent, #6366F1)'; }}
      >
        Open Folder
      </button>
      <button style={s.ghostBtn} onClick={onSkip}>I'll explore first</button>
    </div>
  );
}

function StepReady({ onNext }: StepProps): React.ReactElement {
  return (
    <div style={s.outer}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>&#10003;</div>
      <div style={s.heading}>You're all set!</div>
      <div style={s.desc}>
        Press <strong>Ctrl+Shift+A</strong> anytime to open the Ava AI panel.
      </div>
      <button
        style={s.primaryBtn}
        onClick={onNext}
        onMouseEnter={e => { (e.target as HTMLElement).style.background = '#5558E6'; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.background = 'var(--ava-accent, #6366F1)'; }}
      >
        Start Coding
      </button>
      <div style={s.footer}>You can change all settings later in the Dashboard</div>
    </div>
  );
}

// ── Wizard Container ──────────────────────────────────────────────────────────

const STEPS = [StepWelcome, StepTheme, StepFontSize, StepConnectProvider, StepOpenFolder, StepReady];

function WizardContainer(props: {
  themeService: ThemeService;
  preferenceService: PreferenceService;
  commandService: CommandService;
  onComplete: () => void;
}): React.ReactElement {
  const [step, setStep] = React.useState(0);
  const StepComponent = STEPS[step];

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      props.onComplete();
    }
  };

  const skip = () => {
    props.onComplete();
  };

  return (
    <div>
      <div style={s.dots}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              ...s.dot,
              ...(i <= step ? s.dotActive : {}),
            }}
          />
        ))}
      </div>
      <StepComponent
        onNext={next}
        onSkip={skip}
        themeService={props.themeService}
        preferenceService={props.preferenceService}
        commandService={props.commandService}
      />
    </div>
  );
}

// ── Dialog ────────────────────────────────────────────────────────────────────

@injectable()
export class AvaOnboardingDialog extends ReactDialog<void> {

  @inject(ThemeService) protected readonly themeService: ThemeService;
  @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
  @inject(CommandService) protected readonly commandService: CommandService;

  constructor(@inject(DialogProps) props: DialogProps) {
    super(props);
  }

  @postConstruct()
  protected init(): void {
    this.titleNode.style.display = 'none';
    this.closeCrossNode.style.display = 'none';
    this.contentNode.style.padding = '0';
  }

  get value(): void {
    return undefined;
  }

  protected render(): React.ReactNode {
    return (
      <WizardContainer
        themeService={this.themeService}
        preferenceService={this.preferenceService}
        commandService={this.commandService}
        onComplete={() => this.accept()}
      />
    );
  }
}
