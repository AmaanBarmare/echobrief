/**
 * Password, two-factor enrolment, data export and account deletion.
 *
 * Deletion is the one irreversible control in the app, which is why it asks the
 * user to type DELETE and hands the work to the delete-account edge function
 * rather than trying to clean up from the browser.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Lock, LogOut, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { checkPwnedPassword } from '@/lib/pwned';
import { ExportDataCard } from './ExportDataCard';
import { SecurityCard } from './SecurityCard';

export function SecurityPanel() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Security handlers
  const handleChangePassword = async () => {
    if (!newPassword || !confirmNewPassword) {
      toast({ title: 'Error', description: 'Please fill in both fields.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: 'Error', description: 'Passwords do not match.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 10) {
      toast({ title: 'Error', description: 'Use at least 10 characters with letters and numbers.', variant: 'destructive' });
      return;
    }
    setChangingPassword(true);
    try {
      const pwned = await checkPwnedPassword(newPassword);
      if (pwned.breached) {
        toast({
          title: 'Choose a different password',
          description: `This password has appeared in ${pwned.count.toLocaleString()} known data breaches. Please choose a different one.`,
          variant: 'destructive',
        });
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Password updated', description: 'Your password has been changed successfully.' });
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast({ title: 'Signed out', description: 'You have been signed out.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      toast({ title: 'Error', description: 'Please type DELETE to confirm', variant: 'destructive' });
      return;
    }

    setDeletingAccount(true);
    try {
      // The delete-account edge function derives the user from the JWT and
      // removes the account plus all of its data server-side. (The old
      // supabase.auth.admin.deleteUser call could never work from the browser
      // — admin methods need the service role key.)
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { confirm: 'DELETE' },
      });
      if (error) {
        let message = error.message || 'Failed to delete account';
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          } catch {
            // keep the generic message
          }
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);

      await supabase.auth.signOut();
      toast({ title: 'Account deleted', description: 'Your account has been permanently deleted.' });
      navigate('/');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Change Password */}
      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="mb-4 text-[15px] font-semibold text-foreground">Change Password</h3>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-2 block text-[13px] font-medium text-foreground">New Password</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={10}
              className="border-border bg-background text-foreground"
            />
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              At least 10 characters with letters and numbers
            </p>
          </div>
          <div>
            <label className="mb-2 block text-[13px] font-medium text-foreground">Confirm Password</label>
            <Input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="border-border bg-background text-foreground"
            />
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={changingPassword}
            className="bg-ember text-white hover:bg-ember-deep"
          >
            {changingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Update Password
          </Button>
        </div>
      </div>

      {/* Sign Out */}
      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="mb-2 text-[15px] font-semibold text-foreground">Sign Out</h3>
        <p className="mb-4 text-[13px] text-muted-foreground">Sign out of your account on this device</p>
        <Button variant="outline" onClick={handleSignOut} className="border-border text-foreground hover:bg-muted">
          <LogOut size={14} className="mr-2" />
          Sign Out
        </Button>
      </div>

      <SecurityCard />

      {/* Export — the DPDP portability right the privacy policy promises. */}
      <ExportDataCard />

      {/* Delete Account */}
      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="mb-2 text-[15px] font-semibold text-foreground">Delete Account</h3>
        <p className="mb-4 text-[13px] text-muted-foreground">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <Button
          variant="outline"
          onClick={() => setDeleteDialogOpen(true)}
          className="border-destructive text-destructive hover:bg-destructive/10"
        >
          <Trash2 size={14} className="mr-2" />
          Delete Account
        </Button>
      </div>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Account</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This will permanently delete your account, all meetings, transcripts, and data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="my-5">
            <p className="mb-2 text-[13px] text-foreground">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <Input
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="Type DELETE"
              className="border-border bg-background text-foreground"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteConfirmation('');
              }}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteAccount}
              disabled={deletingAccount || deleteConfirmation !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {deletingAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
