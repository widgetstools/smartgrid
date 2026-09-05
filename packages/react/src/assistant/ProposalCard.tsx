import { useCallback, useMemo } from 'react';
import type { Operation } from 'fast-json-patch';
import type { GridConfig } from '@smartgrid/schema';
import type { AssistantSession, Proposal } from '@smartgrid/assistant';
import {
  PatchDiffCard,
  type EditorRegistry,
  type PatchStatus,
  type ResolvedEditor,
} from '@smartgrid/editors';
import { Badge } from '@smartgrid/ui';
import { describeConfigPath, resolveProposalEditor } from '../proposalEditors.js';

export interface ProposalCardProps {
  proposal: Proposal;
  session: AssistantSession;
  /** Current document, for "before" values. */
  config: GridConfig | undefined;
  registry: EditorRegistry;
  resolveEditor?: (path: string, value: unknown) => ResolvedEditor | undefined;
  compact?: boolean;
}

const STATUS: Record<Proposal['status'], PatchStatus> = {
  proposed: 'proposed',
  applied: 'applied',
  rejected: 'rejected',
  invalid: 'invalid',
  superseded: 'rejected',
};

export function ProposalCard({
  proposal,
  session,
  config,
  registry,
  resolveEditor,
  compact,
}: ProposalCardProps) {
  const resolve = useCallback(
    (path: string, value: unknown) =>
      resolveEditor ? resolveEditor(path, value) : resolveProposalEditor(path, value, { registry }),
    [resolveEditor, registry],
  );
  const describe = useCallback((p: string) => describeConfigPath(p, config), [config]);
  const warnings = useMemo(() => proposal.validation.warnings.map((w) => w.message), [proposal.validation]);
  const onEdit = useCallback(
    (patch: Operation[]) => void session.updateProposal(proposal.id, patch),
    [session, proposal.id],
  );
  return (
    <div className="flex flex-col gap-1" data-testid="proposal" data-proposal-status={proposal.status}>
      {proposal.status === 'superseded' && (
        <Badge variant="outline" className="h-4 w-fit px-1.5 text-2xs text-muted-foreground">
          Superseded by a later proposal
        </Badge>
      )}
      <PatchDiffCard
        patch={proposal.patch}
        before={config}
        title={proposal.title}
        rationale={proposal.rationale}
        status={STATUS[proposal.status]}
        errors={proposal.validation.errors}
        warnings={warnings}
        registry={registry}
        resolveEditor={resolve}
        describePath={describe}
        onEdit={proposal.status === 'proposed' ? onEdit : undefined}
        onApply={proposal.status === 'proposed' ? () => void session.approve(proposal.id) : undefined}
        onReject={proposal.status === 'proposed' ? () => session.reject(proposal.id) : undefined}
        onUndo={proposal.status === 'applied' ? () => void session.undo() : undefined}
        compact={compact}
      />
    </div>
  );
}
