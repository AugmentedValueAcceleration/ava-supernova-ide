import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser';
import { Message } from '@lumino/messaging';
import { AvaAgentClient } from './ava-agent-client';
import { AvaAgentApp } from './components/AvaAgentApp';
import {
  IAvaAgentService,
  AvaAgentService,
  AvaMode,
} from '../common/ava-agent-protocol';

@injectable()
export class AvaAgentWidget extends ReactWidget {
  static readonly ID = 'ava-agent-panel';
  static readonly LABEL = 'Ava';

  @inject(AvaAgentService) protected readonly service: IAvaAgentService;
  @inject(AvaAgentClient) protected readonly client: AvaAgentClient;

  constructor() {
    super();
    this.id = AvaAgentWidget.ID;
    this.title.label = AvaAgentWidget.LABEL;
    this.title.caption = 'Ava | Supernova Agent';
    this.title.closable = true;
    this.title.iconClass = 'no-icon';
    this.addClass('ava-agent-widget');
    this.node.style.overflow = 'hidden';
  }

  @postConstruct()
  protected init(): void {
    // Re-render whenever client state changes
    this.toDispose.push(this.client.onStateChanged(() => this.update()));

    // Initialize the backend service
    this.service.initialize().then(initState => {
      this.client.notifyInit(initState);
    }).catch(err => {
      console.error('[ava-agent] Failed to initialize:', err);
      this.client.notifyError(
        'Failed to connect to Ava backend. Check the developer console for details.',
        'init_error',
      );
    });

    this.update();
  }

  protected render(): React.ReactNode {
    return React.createElement(AvaAgentApp, {
      state: this.client.getState(),
      onSend: (text: string, mode: AvaMode) => {
        this.service.sendMessage(text, mode);
      },
      onCancel: () => {
        this.service.cancelRun();
      },
      onNewChat: () => {
        this.service.newChat();
      },
      onSwitchModel: (modelId: string) => {
        this.service.switchModel(modelId);
      },
      onConfirmTool: (confirmationId, approved, options) => {
        this.service.confirmTool(
          confirmationId,
          approved,
          options?.alwaysAllow,
          options?.allowAll,
          undefined,
          options?.userResponse,
        );
      },
    });
  }

  protected onActivateRequest(msg: Message): void {
    super.onActivateRequest(msg);
    // Focus the textarea when the panel is activated
    const textarea = this.node.querySelector('textarea');
    if (textarea) {
      textarea.focus();
    }
  }
}
