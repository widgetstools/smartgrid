// @smartgrid/react — React surfaces for the assistant.
export { AssistantPane, DEFAULT_SUGGESTIONS, type AssistantPaneProps } from './AssistantPane.js';
export {
  useAssistant,
  useAssistantState,
  providerFor,
  DEFAULT_ASSISTANT_SETTINGS,
  type AssistantSettings,
  type UseAssistantOptions,
} from './useAssistant.js';
export {
  resolveProposalEditor,
  schemaNodeAt,
  describeConfigPath,
  type ProposalEditorOptions,
  type SchemaLocation,
} from './proposalEditors.js';
export { ProposalCard, type ProposalCardProps } from './assistant/ProposalCard.js';
export { MessageList, type MessageListProps } from './assistant/MessageList.js';
export { Composer, type ComposerProps } from './assistant/Composer.js';
export { HealthBanner, type HealthBannerProps } from './assistant/HealthBanner.js';
export { SettingsPopover, type SettingsPopoverProps } from './assistant/SettingsPopover.js';
