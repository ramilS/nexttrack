'use client';

import { useEffect, useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import type { AiDocsSettingsView } from '@repo/shared/schemas';
import { useUpdateAiDocsSettings } from '@/lib/hooks/use-ai-docs';

interface AiDocsSettingsFormProps {
  projectKey: string;
  settings: AiDocsSettingsView;
}

export function AiDocsSettingsForm({ projectKey, settings }: AiDocsSettingsFormProps) {
  const [suggestion, setSuggestion] = useState(settings.suggestionPrompt ?? '');
  const [merge, setMerge] = useState(settings.mergePrompt ?? '');
  const update = useUpdateAiDocsSettings(projectKey);

  useEffect(() => {
    setSuggestion(settings.suggestionPrompt ?? '');
    setMerge(settings.mergePrompt ?? '');
  }, [settings]);

  function handleSave() {
    update.mutate({
      suggestionPrompt: suggestion.trim() ? suggestion.trim() : null,
      mergePrompt: merge.trim() ? merge.trim() : null,
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="flex-row gap-3 border-l-4 border-l-primary bg-muted/30 px-4 py-3">
        <Info className="size-4 shrink-0 mt-0.5 text-primary" />
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">How it works: </span>
            when a matching issue is resolved (tagged <code className="text-[11px]">docs</code>,
            or a Feature/Bug/Story with a description), the AI decides whether the
            Knowledge Base needs updating. If so, it creates a linked doc-update issue
            carrying a draft — nothing is written to the article yet.
          </p>
          <p>
            <span className="font-medium text-foreground">Review: </span>
            move the doc-update issue to <span className="font-medium">Done</span> to
            apply the draft to the article. Moving it to Cancelled / Won&apos;t Do /
            Rejected discards it instead. This issue is the only approval step —
            there&apos;s no separate review inbox.
          </p>
          <p>
            <span className="font-medium text-foreground">Conflict handling: </span>
            if the target article changed after the draft was written, the AI
            three-way merges the two. Disjoint edits merge automatically; overlapping
            edits are left un-applied and the doc-update issue is reopened for manual
            review.
          </p>
          <p>
            <span className="font-medium text-foreground">Configuration: </span>
            the feature itself, the LLM provider (Anthropic or OpenAI-compatible/local),
            and API credentials are set via server environment variables
            (<code className="text-[11px]">AI_DOCS_ENABLED</code>,{' '}
            <code className="text-[11px]">AI_DOCS_PROVIDER</code>) — ask an infra admin
            if this project isn&apos;t receiving doc-update suggestions. The two prompts
            below are the only part configurable per project.
          </p>
        </div>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="suggestion-prompt">Suggestion prompt</Label>
        <p className="text-xs text-muted-foreground">
          Guides how the AI decides whether docs need updating and drafts the
          change. Leave empty to use the built-in default.
        </p>
        <Textarea
          id="suggestion-prompt"
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          placeholder={settings.defaults.suggestion}
          className="min-h-48 font-mono text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="merge-prompt">Merge prompt</Label>
        <p className="text-xs text-muted-foreground">
          Guides how the AI reconciles a draft with an article that changed after
          drafting. Leave empty to use the built-in default.
        </p>
        <Textarea
          id="merge-prompt"
          value={merge}
          onChange={(e) => setMerge(e.target.value)}
          placeholder={settings.defaults.merge}
          className="min-h-48 font-mono text-xs"
        />
      </div>

      <Button onClick={handleSave} disabled={update.isPending}>
        {update.isPending && <Loader2 className="size-4 animate-spin" />}
        Save prompts
      </Button>
    </div>
  );
}
