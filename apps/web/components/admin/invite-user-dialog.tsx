'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSendInvite } from '@/lib/hooks/use-users';
import { Loader2 } from 'lucide-react';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const [email, setEmail] = useState('');
  const sendInvite = useSendInvite();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendInvite.mutate({ email }, {
      onSuccess: () => {
        onOpenChange(false);
        setEmail('');
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>
            Send an invitation email to a new user.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={sendInvite.isPending}>
              {sendInvite.isPending && <Loader2 className="size-4 animate-spin" />}
              Send Invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
