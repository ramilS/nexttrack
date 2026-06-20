'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
