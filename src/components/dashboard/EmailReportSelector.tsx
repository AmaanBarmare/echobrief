import { useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface EmailReportSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingTitle: string;
  userEmail?: string;
  onSend: (email: string) => Promise<void>;
}

export function EmailReportSelector({
  open,
  onOpenChange,
  meetingTitle,
  userEmail,
  onSend,
}: EmailReportSelectorProps) {
  const [email, setEmail] = useState(userEmail || '');
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!email.trim()) {
      toast({ title: 'Error', description: 'Please enter an email address', variant: 'destructive' });
      return;
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: 'Error', description: 'Please enter a valid email address', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      await onSend(email);
      toast({ title: 'Sent', description: `Meeting report sent to ${email}` });
      setEmail(userEmail || '');
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to send', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail size={20} style={{ color: '#FB923C' }} />
            Email Report
          </DialogTitle>
          <DialogDescription>
            Send the meeting report "{meetingTitle}" via email
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <label className="block text-sm font-medium mb-2" style={{ color: '#FAFAF9' }}>
            Recipient Email
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="recipient@example.com"
            disabled={sending}
            style={{
              background: '#1C1917',
              border: '1px solid #292524',
              color: '#FAFAF9',
            }}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSend();
              }
            }}
          />
          <p className="text-xs mt-2" style={{ color: '#78716C' }}>
            The report includes summary, key points, decisions, and action items
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
            style={{ color: '#A8A29E' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending}
            style={{
              background: '#FB923C',
              color: '#fff',
            }}
          >
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Send Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
