'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { timerApi, type StartTimerRequest } from '@/lib/api/time-tracking.api';
import { useTimerStore } from '@/lib/stores/timer.store';

const timerKeys = {
  active: ['timer', 'active'] as const,
};

export function useActiveTimer() {
  const sync = useTimerStore((s) => s.sync);

  const query = useQuery({
    queryKey: timerKeys.active,
    queryFn: async () => {
      const { data } = await timerApi.get();
      return data;
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (query.data !== undefined) {
      sync(query.data);
    }
  }, [query.data, sync]);

  return query;
}

export function useStartTimer() {
  const qc = useQueryClient();
  const start = useTimerStore((s) => s.start);

  return useMutation({
    mutationFn: (data: StartTimerRequest & { issueKey: string }) =>
      timerApi.start({ issueId: data.issueId, description: data.description }),
    onSuccess: (_, vars) => {
      start(vars.issueId, vars.issueKey);
      qc.invalidateQueries({ queryKey: timerKeys.active });
      toast.success('Timer started');
    },

  });
}

export function useStopTimer() {
  const qc = useQueryClient();
  const stop = useTimerStore((s) => s.stop);

  return useMutation({
    mutationFn: (description?: string) => timerApi.stop(description ? { description } : undefined),
    onSuccess: () => {
      stop();
      qc.invalidateQueries({ queryKey: timerKeys.active });
      qc.invalidateQueries({ queryKey: ['timeLogs'] });
      toast.success('Timer stopped, time logged');
    },

  });
}

export function useDiscardTimer() {
  const qc = useQueryClient();
  const stop = useTimerStore((s) => s.stop);

  return useMutation({
    mutationFn: () => timerApi.discard(),
    onSuccess: () => {
      stop();
      qc.invalidateQueries({ queryKey: timerKeys.active });
      toast.success('Timer discarded');
    },

  });
}

export function useTimerTick() {
  const isRunning = useTimerStore((s) => s.isRunning);
  const tick = useTimerStore((s) => s.tick);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isRunning, tick]);
}
