import { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, Mail, Shield, Trash2, UserPlus } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatIST } from '@/lib/time';

interface Member {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  email: string | null;
  full_name: string | null;
  is_you: boolean;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
}

interface WorkspaceState {
  organization: { id: string; name: string; created_at: string } | null;
  role?: 'owner' | 'admin' | 'member';
  members?: Member[];
  invites?: Invite[];
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

export default function Workspace() {
  const { toast } = useToast();
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [newName, setNewName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-organization', { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    try {
      setState(await call({ action: 'get' }));
    } catch (err) {
      toast({
        title: 'Could not load your workspace',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [call, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (body: Record<string, unknown>, success: string) => {
    setWorking(true);
    try {
      await call(body);
      await refresh();
      toast({ title: success });
      return true;
    } catch (err) {
      toast({
        title: 'That did not work',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setWorking(false);
    }
  };

  const isAdmin = state?.role === 'owner' || state?.role === 'admin';

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <header>
          <h1 className="mb-1 text-2xl font-semibold text-foreground">Workspace</h1>
          <p className="text-[13.5px] text-muted-foreground">
            Share meetings with colleagues and pool your plan's meeting-hours.
          </p>
        </header>

        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !state?.organization ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <Building2 className="h-4 w-4" style={{ color: 'var(--ink-mid)' }} />
              <h2 className="text-base font-semibold text-foreground">Create a workspace</h2>
            </div>
            <p className="mb-5 text-[13px] text-muted-foreground">
              Your meetings stay private. Nothing is shared with the workspace until you
              choose to share it, meeting by meeting.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Acme Sales"
                className="max-w-xs"
              />
              <Button
                disabled={working || newName.trim().length === 0}
                onClick={async () => {
                  if (await run({ action: 'create', name: newName.trim() }, 'Workspace created')) {
                    setNewName('');
                  }
                }}
              >
                {working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {state.organization.name}
                  </h2>
                  <p className="text-[12.5px] text-muted-foreground">
                    {state.members?.length ?? 0} member
                    {(state.members?.length ?? 0) === 1 ? '' : 's'} · you are{' '}
                    {ROLE_LABELS[state.role ?? 'member'].toLowerCase()}
                  </p>
                </div>
                {state.role !== 'owner' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={working}
                    onClick={() => run({ action: 'leave' }, 'You left the workspace')}
                  >
                    Leave workspace
                  </Button>
                )}
              </div>

              <ul className="space-y-2 p-0" style={{ listStyle: 'none' }}>
                {state.members?.map((member) => (
                  <li
                    key={member.user_id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[13.5px] font-medium text-foreground">
                        {member.full_name || member.email || 'Unknown'}
                        {member.is_you && (
                          <span className="ml-2 text-[12px] text-muted-foreground">you</span>
                        )}
                      </p>
                      <p className="m-0 truncate text-[12px] text-muted-foreground">
                        {member.email}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          background: 'var(--paper-raised)',
                          color: 'var(--ink-mid)',
                        }}
                      >
                        {member.role === 'owner' && <Shield size={11} />}
                        {ROLE_LABELS[member.role]}
                      </span>
                      {isAdmin && !member.is_you && (
                        <button
                          type="button"
                          disabled={working}
                          aria-label={`Remove ${member.email ?? 'member'}`}
                          onClick={() =>
                            run(
                              { action: 'remove_member', user_id: member.user_id },
                              'Member removed',
                            )
                          }
                          className="cursor-pointer border-none bg-transparent p-1 text-destructive hover:opacity-90 disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {isAdmin && (
              <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
                <div className="mb-1 flex items-center gap-2">
                  <UserPlus className="h-4 w-4" style={{ color: 'var(--ink-mid)' }} />
                  <h2 className="text-base font-semibold text-foreground">Invite someone</h2>
                </div>
                <p className="mb-4 text-[13px] text-muted-foreground">
                  They will get an email with a link that expires in 14 days. It only works
                  for the address you send it to.
                </p>
                <div className="mb-5 flex flex-wrap gap-2">
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="max-w-xs"
                  />
                  <Button
                    disabled={working || inviteEmail.trim().length === 0}
                    onClick={async () => {
                      if (
                        await run(
                          { action: 'invite', email: inviteEmail.trim() },
                          'Invitation sent',
                        )
                      ) {
                        setInviteEmail('');
                      }
                    }}
                  >
                    {working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Send invite
                  </Button>
                </div>

                {(state.invites?.length ?? 0) > 0 && (
                  <>
                    <p
                      className="mb-2 text-[11.5px] font-semibold uppercase"
                      style={{ color: 'var(--ink-soft)', letterSpacing: '0.08em' }}
                    >
                      Pending
                    </p>
                    <ul className="space-y-2 p-0" style={{ listStyle: 'none' }}>
                      {state.invites?.map((invite) => (
                        <li
                          key={invite.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Mail size={13} style={{ color: 'var(--ink-soft)' }} />
                            <span className="truncate text-[13px] text-foreground">
                              {invite.email}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="text-[11.5px] text-muted-foreground">
                              expires {formatIST(new Date(invite.expires_at), 'd MMM')}
                            </span>
                            <button
                              type="button"
                              disabled={working}
                              aria-label={`Revoke invite for ${invite.email}`}
                              onClick={() =>
                                run(
                                  { action: 'revoke_invite', invite_id: invite.id },
                                  'Invitation revoked',
                                )
                              }
                              className="cursor-pointer border-none bg-transparent p-1 text-destructive hover:opacity-90 disabled:opacity-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
