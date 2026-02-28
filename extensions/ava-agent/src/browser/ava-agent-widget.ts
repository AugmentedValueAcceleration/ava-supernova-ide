import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { BaseWidget, Message } from '@theia/core/lib/browser';

@injectable()
export class AvaAgentWidget extends BaseWidget {
  static readonly ID = 'ava-agent-panel';
  static readonly LABEL = 'Ava';

  constructor() {
    super();
    this.id = AvaAgentWidget.ID;
    this.title.label = AvaAgentWidget.LABEL;
    this.title.caption = 'Ava | Supernova Agent';
    this.title.closable = true;
    this.addClass('ava-agent-widget');

    // Ensure the widget fills its container properly
    this.node.style.overflow = 'hidden';
  }

  @postConstruct()
  protected init(): void {
    this.update();
  }

  protected onUpdateRequest(msg: Message): void {
    super.onUpdateRequest(msg);
    // TODO: Replace with React-based agent chat UI
    // This will import @ava/core and wire the AgentEventHandler
    this.node.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 16px;
        box-sizing: border-box;
        font-family: var(--theia-ui-font-family);
        color: var(--theia-foreground);
      ">
        <div style="
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--theia-panel-border);
          flex-shrink: 0;
        ">
          <span style="font-size: 18px; font-weight: 700;">Ava</span>
          <span style="
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 2px;
            text-transform: uppercase;
            opacity: 0.6;
          ">Supernova</span>
        </div>
        <div style="
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.5;
          font-size: 13px;
          text-align: center;
          line-height: 1.6;
          min-height: 0;
          overflow: auto;
        ">
          Agent panel ready.<br/>
          @ava/core integration coming next.
        </div>
        <div style="
          flex-shrink: 0;
          padding: 8px 12px;
          border: 1px solid var(--theia-input-border);
          border-radius: 6px;
          background: var(--theia-input-background);
          color: var(--theia-input-foreground);
          font-size: 13px;
          opacity: 0.5;
        ">
          Ask Ava something...
        </div>
      </div>
    `;
  }
}
