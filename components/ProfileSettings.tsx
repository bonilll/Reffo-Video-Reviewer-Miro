import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClerk, useUser } from '@clerk/clerk-react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Project, ShareGroup, UserSettings } from '../types';
import {
  ArrowLeft,
  Bell,
  Camera,
  Lock,
  Layers,
  ExternalLink,
  ShieldCheck,
  Users,
  KeyRound,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useThemePreference } from '../useTheme';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

interface ProfileSettingsProps {
  user: {
    name?: string | null;
    email: string;
    // Effective avatar URL (custom vs auth) from `api.users.current`.
    avatar?: string | null;
    // Auth-provider image (Clerk).
    authAvatar?: string | null;
    // Uploaded custom avatar (may exist even when avatarSource is "auth").
    customAvatar?: string | null;
    avatarSource?: 'auth' | 'custom' | null;
  };
  projects: Project[];
  onBack: () => void;
}

type GoogleKeyMetadata = {
  keyId: string;
  mode: 'session' | 'persistent';
  provider: string;
  label?: string | null;
  status: string;
  last4: string;
  lastUsedAt?: number | null;
  lastTestAt?: number | null;
  createdAt?: number;
  expiresAt?: number | null;
  pauseReason?: string | null;
};

const ProfileSettings: React.FC<ProfileSettingsProps> = ({ user, projects, onBack }) => {
  const { signOut } = useClerk();
  const { user: clerkUser } = useUser();
  const settingsDoc = useQuery(api.settings.getOrNull, {});
  const shareGroups = useQuery(api.shareGroups.list, {});
  const getSlackStatus = useAction(api.slack.status);

  const updateSettings = useMutation(api.settings.update);
  const ensureSettings = useMutation(api.settings.ensure);
  const updateProfile = useMutation(api.users.updateProfile);
  const generateAvatarUpload = useAction(api.storage.generateProfileImageUploadUrl);
  const getSlackAuthUrl = useAction(api.slack.getAuthUrl);
  const exchangeSlackCode = useAction(api.slack.exchangeCode);
  const disconnectSlack = useAction(api.slack.disconnect);
  const testSlackDm = useAction(api.slack.testDm);
  const friends = useQuery(api.friends.list, {});
  const monthlyAiSpend = useQuery(api.aiCosts.getUserMonthlySpend, {});
  const addFriend = useMutation(api.friends.add);
  const removeFriend = useMutation(api.friends.remove);
  const deleteAccount = useMutation(api.users.deleteAccount);

  const [displayName, setDisplayName] = useState(user.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar ?? '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const savedProfileRef = useRef<{ name: string }>({
    name: user.name ?? '',
  });
  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [googleKeys, setGoogleKeys] = useState<GoogleKeyMetadata[]>([]);
  const [googleKeysLoading, setGoogleKeysLoading] = useState(false);
  const [googleKeysError, setGoogleKeysError] = useState<string | null>(null);
  const [googleKeyInput, setGoogleKeyInput] = useState('');
  const [googleKeyLabel, setGoogleKeyLabel] = useState('');
  const [googleKeyMode, setGoogleKeyMode] = useState<'session' | 'persistent'>('session');
  const [googleStepUpConfirmation, setGoogleStepUpConfirmation] = useState('');
  const [googleStepUpLoading, setGoogleStepUpLoading] = useState(false);
  const [googleProofs, setGoogleProofs] = useState<Record<string, { token: string; expiresAt: number }>>({});
  const [googleActionLoading, setGoogleActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (uploadingAvatar) return;
    setAvatarUrl(user.avatar ?? '');
  }, [user.avatar, uploadingAvatar]);

  useEffect(() => {
    const next = user.name ?? '';
    const prevSaved = savedProfileRef.current.name;
    setDisplayName((current) => (current === prevSaved ? next : current));
    savedProfileRef.current.name = next;
  }, [user.name]);

  useThemePreference(localSettings?.workspace.theme ?? 'system');

  useEffect(() => {
    // If the user is authenticated but doesn't have settings yet, create them.
    // When unauthenticated, settingsDoc will be undefined (query not issued) or null;
    // avoid firing the creation mutation in that case.
    if (settingsDoc === null && user?.email) {
      void ensureSettings({});
      return;
    }
    if (!settingsDoc) return;
    setLocalSettings({
      id: settingsDoc._id,
      notifications: settingsDoc.notifications,
      security: settingsDoc.security,
      workspace: settingsDoc.workspace,
      integrations: settingsDoc.integrations,
      billing: settingsDoc.billing,
      createdAt: new Date(settingsDoc.createdAt).toISOString(),
      updatedAt: new Date(settingsDoc.updatedAt).toISOString(),
    });
  }, [settingsDoc, ensureSettings, user?.email]);

  const [slackStatus, setSlackStatus] = useState<Array<{ teamId: string; teamName: string }> | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const s = await getSlackStatus({});
        setSlackStatus(Array.isArray(s) ? s : (s ? [s] : []));
      } catch {}
    })();
  }, [getSlackStatus]);

  // Handle Slack OAuth code if Slack redirected back to /profile
  useEffect(() => {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    if (!search) return;
    const params = new URLSearchParams(search);
    const code = params.get('code');
    const state = params.get('state');
    const source = params.get('source');
    if (code && source === 'slack') {
      (async () => {
        try {
          await (exchangeSlackCode as any)({ code, redirectUri: window.location.origin + '/profile?source=slack', state: state || undefined });
          try {
            const s = await getSlackStatus({});
            setSlackStatus(Array.isArray(s) ? s : (s ? [s] : []));
          } catch {}
        } catch (err) {
          console.error('Slack OAuth exchange failed', err);
        } finally {
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('code');
            url.searchParams.delete('state');
            url.searchParams.delete('source');
            window.history.replaceState({}, '', url.toString());
          } catch {}
        }
      })();
    }
  }, [exchangeSlackCode, getSlackStatus]);

  const persistSettings = async (next: UserSettings) => {
    setIsSaving(true);
    await updateSettings({
      notifications: next.notifications,
      security: {
        ...next.security,
        backupEmail: next.security.backupEmail ?? undefined,
      },
      workspace: {
        defaultProjectId: next.workspace.defaultProjectId ?? undefined,
        autoShareGroupIds: next.workspace.autoShareGroupIds as any,
        theme: next.workspace.theme,
      },
      integrations: {
        slackWebhook: next.integrations.slackWebhook ?? undefined,
        notionWorkspaceUrl: next.integrations.notionWorkspaceUrl ?? undefined,
        frameIoAccount: next.integrations.frameIoAccount ?? undefined,
      },
      billing: next.billing,
    });
    setIsSaving(false);
  };

  const handleSettingsChange = (updater: (current: UserSettings) => UserSettings) => {
    setLocalSettings((current) => {
      if (!current) return current;
      const next = updater(current);
      void persistSettings(next);
      return next;
    });
  };

  const handleSaveProfile = async () => {
    if (profileSaving) return;
    const nextName = displayName.trim();
    if (savedProfileRef.current.name === nextName) return;
    setProfileSaving(true);
    try {
      await updateProfile({
        name: nextName || undefined,
      });
      savedProfileRef.current = { name: nextName };
    } finally {
      setProfileSaving(false);
    }
  };

  const uploadAvatarFile = useCallback(
    async (file: File) => {
      setUploadingAvatar(true);
      try {
        // Resize client-side to max 512px
        const blob = await resizeImage(file, 512, 0.85);
        const meta = await generateAvatarUpload({ contentType: 'image/jpeg', fileName: file.name });
        await uploadBlob(meta.uploadUrl, blob, 'image/jpeg');
        const nextAvatar = meta.publicUrl;
        setAvatarUrl(nextAvatar);
        await updateProfile({ avatar: nextAvatar, avatarSource: 'custom' } as any);
      } catch (err) {
        console.error('Avatar upload failed', err);
      } finally {
        setUploadingAvatar(false);
      }
    },
    [generateAvatarUpload, updateProfile],
  );

  const handleSaveSettings = async () => {
    if (!localSettings) return;
    setIsSaving(true);
    await updateSettings({
      notifications: localSettings.notifications,
      security: {
        ...localSettings.security,
        backupEmail: localSettings.security.backupEmail ?? undefined,
      },
      workspace: {
        ...localSettings.workspace,
        defaultProjectId: localSettings.workspace.defaultProjectId ?? undefined,
        autoShareGroupIds: localSettings.workspace.autoShareGroupIds,
        theme: localSettings.workspace.theme,
      },
      integrations: {
        slackWebhook: localSettings.integrations.slackWebhook ?? undefined,
        notionWorkspaceUrl: localSettings.integrations.notionWorkspaceUrl ?? undefined,
        frameIoAccount: localSettings.integrations.frameIoAccount ?? undefined,
      },
      billing: localSettings.billing,
    });
    setIsSaving(false);
  };

  const handleDeleteAccount = useCallback(async () => {
    if (deletingAccount) return;
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm account removal.');
      return;
    }

    setDeletingAccount(true);
    setDeleteError(null);

    try {
      await deleteAccount({ confirm: true });

      try {
        const deleteClerkUser = (clerkUser as any)?.delete;
        if (typeof deleteClerkUser === 'function') {
          await deleteClerkUser.call(clerkUser);
        }
      } catch (error) {
        console.warn('Failed to delete Clerk user, continuing with sign-out.', error);
      }

      try {
        await signOut({ redirectUrl: '/' } as any);
        return;
      } catch {
        window.location.assign('/');
      }
    } catch (error) {
      console.error('Failed to delete account', error);
      setDeleteError(
        'Unable to delete your account right now. Please try again in a few moments.',
      );
    } finally {
      setDeletingAccount(false);
    }
  }, [clerkUser, deleteAccount, deleteConfirmText, deletingAccount, signOut]);

  const getConvexBearerToken = useCallback(async () => {
    const token = await (clerkUser as any)?.getToken?.({ template: 'convex' });
    if (!token) {
      throw new Error('Authentication expired. Please sign in again.');
    }
    return token as string;
  }, [clerkUser]);

  const aiGatewayRequest = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const token = await getConvexBearerToken();
      const response = await fetch(path, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof json?.details === 'string'
            ? json.details
            : typeof json?.error === 'string'
              ? json.error
              : 'Request failed';
        throw new Error(message);
      }

      return json as T;
    },
    [getConvexBearerToken],
  );

  const fetchGoogleKeys = useCallback(async () => {
    setGoogleKeysLoading(true);
    setGoogleKeysError(null);
    try {
      const result = await aiGatewayRequest<{ keys: GoogleKeyMetadata[] }>('/api/keys/google/list', {
        method: 'GET',
      });
      setGoogleKeys(result.keys ?? []);
    } catch (error) {
      setGoogleKeysError(error instanceof Error ? error.message : 'Failed to load keys');
    } finally {
      setGoogleKeysLoading(false);
    }
  }, [aiGatewayRequest]);

  useEffect(() => {
    void fetchGoogleKeys();
  }, [fetchGoogleKeys]);

  const requestStepUpProof = useCallback(
    async (action: 'key:add' | 'key:test' | 'key:delete') => {
      const cached = googleProofs[action];
      if (cached && cached.expiresAt > Date.now() + 5_000) {
        return cached.token;
      }

      setGoogleStepUpLoading(true);
      try {
        const result = await aiGatewayRequest<{ proofToken: string; expiresAt: number }>(
          '/api/security/step-up/validate',
          {
            method: 'POST',
            body: JSON.stringify({
              action,
              confirmation: googleStepUpConfirmation.trim(),
            }),
          },
        );

        setGoogleProofs((current) => ({
          ...current,
          [action]: {
            token: result.proofToken,
            expiresAt: result.expiresAt,
          },
        }));

        return result.proofToken;
      } finally {
        setGoogleStepUpLoading(false);
      }
    },
    [aiGatewayRequest, googleProofs, googleStepUpConfirmation],
  );

  const handleValidateStepUp = useCallback(async () => {
    try {
      await requestStepUpProof('key:add');
      await requestStepUpProof('key:test');
      await requestStepUpProof('key:delete');
    } catch (error) {
      setGoogleKeysError(error instanceof Error ? error.message : 'Step-up validation failed');
    }
  }, [requestStepUpProof]);

  const clerkAvatarUrl = clerkUser?.imageUrl ?? null;
  const authAvatarUrl = user.authAvatar ?? clerkAvatarUrl ?? null;
  const customAvatarUrl = user.customAvatar ?? null;
  const currentAvatarSource =
    user.avatarSource ?? (customAvatarUrl ? ('custom' as const) : ('auth' as const));

  const resolvedAvatarUrl = useMemo(() => {
    if (avatarUrl) return avatarUrl;
    if (currentAvatarSource === 'custom') return customAvatarUrl ?? '';
    return authAvatarUrl ?? '';
  }, [authAvatarUrl, avatarUrl, currentAvatarSource, customAvatarUrl]);

  const renderAvatar = () => {
    if (resolvedAvatarUrl) {
      return (
        <img
          src={resolvedAvatarUrl}
          alt={displayName || user.email}
          className="h-14 w-14 rounded-full object-cover"
          onError={() => setAvatarUrl('')}
        />
      );
    }
    const letters = (displayName || user.email).slice(0, 2).toUpperCase();
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-lg font-semibold text-gray-700">
        {letters}
      </div>
    );
  };

  const renderAvatarFor = (url: string | null | undefined, size: 'sm' | 'md' = 'md') => {
    const sizeClass = size === 'sm' ? 'h-10 w-10' : 'h-14 w-14';
    if (url) {
      return (
        <img
          src={url}
          alt={displayName || user.email}
          className={`${sizeClass} rounded-full object-cover`}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      );
    }
    const letters = (displayName || user.email).slice(0, 2).toUpperCase();
    return (
      <div className={`flex ${sizeClass} items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700`}>
        {letters}
      </div>
    );
  };

  const activeGroups = useMemo<ShareGroup[]>(() => shareGroups ?? [], [shareGroups]);

  if (!localSettings) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={44} className="animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8 library-skin">
      <header className="flex flex-wrap items-center justify-between gap-4 library-panel p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="rounded-full border border-gray-200 bg-white p-2 text-gray-600 hover:text-gray-900"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-4">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                await uploadAvatarFile(file);
                setAvatarModalOpen(false);
                e.currentTarget.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => setAvatarModalOpen(true)}
              // `library-skin` applies aggressive button/child backgrounds; opt out so the avatar isn't covered.
              className="library-unstyled group relative rounded-full overflow-hidden"
              aria-label="Change profile image"
            >
              {renderAvatar()}
              <span className="pointer-events-none absolute inset-0 rounded-full bg-black/0 transition group-hover:bg-black/10" />
              <span className="pointer-events-none absolute bottom-0 right-0 inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm">
                {uploadingAvatar ? <Loader2 className="animate-spin" size={14} /> : <Camera size={14} />}
              </span>
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{displayName || 'Your workspace'}</h1>
              <p className="text-sm text-gray-600">{user.email}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSaving && (
            <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs text-gray-600">
              <Loader2 className="animate-spin" size={14} /> Saving…
            </span>
          )}
          {profileSaving && (
            <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs text-gray-600">
              <Loader2 className="animate-spin" size={14} /> Saving profile…
            </span>
          )}
        </div>
      </header>

      <Dialog
        open={avatarModalOpen}
        onOpenChange={(open) => {
          if (uploadingAvatar) return;
          setAvatarModalOpen(open);
        }}
      >
        <DialogContent className="bg-white text-gray-900 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Profile image</DialogTitle>
            <DialogDescription>Choose your default (sign-in) image or use a custom upload.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={profileSaving || uploadingAvatar}
              onClick={async () => {
                setProfileSaving(true);
                try {
                  await updateProfile({ avatarSource: 'auth' } as any);
                  setAvatarUrl(authAvatarUrl ?? '');
                  setAvatarModalOpen(false);
                } finally {
                  setProfileSaving(false);
                }
              }}
              className={`rounded-2xl border p-4 text-left transition ${
                currentAvatarSource === 'auth' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {renderAvatarFor(authAvatarUrl, 'sm')}
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">Default</div>
                  <div className="text-xs text-gray-600 truncate">From your sign-in profile (Clerk)</div>
                </div>
              </div>
              {currentAvatarSource === 'auth' && (
                <div className="mt-3 inline-flex rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-slate-50">
                  Active
                </div>
              )}
            </button>

            <button
              type="button"
              disabled={profileSaving || uploadingAvatar}
              onClick={async () => {
                if (!customAvatarUrl) {
                  avatarInputRef.current?.click();
                  return;
                }
                setProfileSaving(true);
                try {
                  await updateProfile({ avatarSource: 'custom' } as any);
                  setAvatarUrl(customAvatarUrl ?? '');
                  setAvatarModalOpen(false);
                } finally {
                  setProfileSaving(false);
                }
              }}
              className={`rounded-2xl border p-4 text-left transition ${
                currentAvatarSource === 'custom' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {customAvatarUrl ? (
                  renderAvatarFor(customAvatarUrl, 'sm')
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-gray-300 bg-gray-50 text-xs font-semibold text-gray-600">
                    +
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">Custom</div>
                  <div className="text-xs text-gray-600 truncate">
                    {customAvatarUrl ? 'Use your uploaded image' : 'Upload an image to use'}
                  </div>
                </div>
              </div>
              {currentAvatarSource === 'custom' && (
                <div className="mt-3 inline-flex rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-slate-50">
                  Active
                </div>
              )}
            </button>
          </div>

          <DialogFooter className="flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {customAvatarUrl ? (
                <button
                  type="button"
                  disabled={profileSaving || uploadingAvatar}
                  className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:text-gray-900 disabled:opacity-40"
                  onClick={async () => {
                    setProfileSaving(true);
                    try {
                      await updateProfile({ avatar: '', avatarSource: 'auth' } as any);
                      setAvatarUrl(authAvatarUrl ?? '');
                      setAvatarModalOpen(false);
                    } finally {
                      setProfileSaving(false);
                    }
                  }}
                >
                  Remove custom
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={profileSaving || uploadingAvatar}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:text-gray-900 disabled:opacity-40"
                onClick={() => setAvatarModalOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                disabled={profileSaving || uploadingAvatar}
                className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-slate-50 hover:bg-black/90 disabled:opacity-40"
                onClick={() => avatarInputRef.current?.click()}
              >
                {uploadingAvatar ? 'Uploading…' : 'Upload custom'}
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deletingAccount) return;
          setDeleteDialogOpen(open);
          if (!open) {
            setDeleteConfirmText('');
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="bg-white text-gray-900 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete account permanently</DialogTitle>
            <DialogDescription>
              This action immediately removes your account data. Shared content ownership will be reassigned to an account already involved in sharing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase text-gray-500">
              Type DELETE to confirm
            </label>
            <input
              value={deleteConfirmText}
              onChange={(event) => {
                setDeleteConfirmText(event.target.value);
                setDeleteError(null);
              }}
              placeholder="DELETE"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
            {deleteError ? (
              <p className="text-xs font-medium text-red-600">{deleteError}</p>
            ) : null}
          </div>

          <DialogFooter className="flex flex-row items-center justify-end gap-2">
            <button
              type="button"
              disabled={deletingAccount}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:text-gray-900 disabled:opacity-40"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deletingAccount || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
              className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              onClick={() => void handleDeleteAccount()}
            >
              {deletingAccount ? <Loader2 size={14} className="animate-spin" /> : null}
              Delete account
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          <article className="library-panel p-4 sm:p-6">
            <div className="flex items-center gap-3 text-gray-900">
              <ShieldCheck size={18} />
              <h2 className="text-lg font-semibold">Account</h2>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Update how teammates will see you across the platform.
            </p>
            <div className="mt-4 space-y-4 text-sm text-gray-700">
              <label className="block text-xs font-semibold uppercase text-gray-500">Display name</label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                onBlur={() => void handleSaveProfile()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    (event.currentTarget as HTMLInputElement).blur();
                  }
                }}
                placeholder="Add your name"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />

              <div className="pt-2">
                <div className="flex items-center gap-3 text-gray-900">
                  <Users size={18} />
                  <h3 className="text-base font-semibold">Friends</h3>
                </div>
                <p className="mt-1 text-sm text-gray-600">People you collaborate with across your teams. Mentions use this list.</p>
                <div className="mt-3 space-y-3 text-sm text-gray-700">
                  <FriendsManager
                    friends={friends ?? []}
                    onAdd={async (email, name) => {
                      await addFriend({ email, name: name || undefined });
                    }}
                    onRemove={async (id) => {
                      await removeFriend({ friendId: id as any });
                    }}
                  />
                </div>
              </div>
            </div>
      </article>

      <article className="library-panel p-4 sm:p-6">
        <div className="flex items-center gap-3 text-gray-900">
          <ExternalLink size={18} />
          <h2 className="text-lg font-semibold">Connections</h2>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Connect external apps to receive notifications and streamline your workflow.
        </p>
        <div className="mt-4 space-y-4">
          <div className="library-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Slack</div>
                <div className="text-xs text-gray-600">
                  {slackStatus && slackStatus.length > 0
                    ? (
                      <>Connected to {slackStatus.map(s => <span key={s.teamId} className="font-semibold">{s.teamName}</span>).reduce((prev, curr) => [prev, <span key={Math.random()}> , </span>, curr])}</>
                    ) : (
                      <>Not connected</>
                    )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!slackStatus || slackStatus.length === 0 ? (
                  <button
                    onClick={async () => {
                      try {
                        const redirectUri = window.location.origin + '/profile?source=slack';
                        const url = await getSlackAuthUrl({ redirectUri });
                        window.location.assign(url);
                      } catch (err) {
                        console.error('Failed to start Slack OAuth', err);
                      }
                    }}
                    className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-slate-50 hover:bg-black/90"
                  >
                    Connect Slack
                  </button>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={async () => {
                        try { await testSlackDm({}); } catch (err) { console.error('Failed to send test DM', err); }
                      }}
                      className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
                    >
                      Send test DM
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const redirectUri = window.location.origin + '/profile?source=slack';
                          const url = await getSlackAuthUrl({ redirectUri });
                          window.location.assign(url);
                        } catch (err) {
                          console.error('Failed to start Slack OAuth', err);
                        }
                      }}
                      className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
                    >
                      Connect another workspace
                    </button>
                    {slackStatus?.map((s) => (
                      <button
                        key={s.teamId}
                        onClick={async () => {
                          try { await disconnectSlack({ teamId: s.teamId });
                            const next = await getSlackStatus({});
                            setSlackStatus(Array.isArray(next) ? next : (next ? [next] : []));
                          } catch (err) { console.error('Failed to disconnect Slack', err); }
                        }}
                        className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900"
                        title={`Disconnect ${s.teamName}`}
                      >
                        Disconnect {s.teamName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="library-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <KeyRound size={16} className="text-gray-700" />
                <div>
                  <div className="text-sm font-semibold text-gray-900">Google API keys (BYOK)</div>
                  <div className="text-xs text-gray-600">
                    Keys are encrypted at rest, never revealed after save, and protected by step-up proof.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void fetchGoogleKeys()}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <label className="text-xs font-semibold uppercase text-gray-500">Step-up confirmation</label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={googleStepUpConfirmation}
                  onChange={(event) => setGoogleStepUpConfirmation(event.target.value)}
                  placeholder="Type CONFIRM"
                  className="min-w-[180px] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <button
                  type="button"
                  disabled={googleStepUpLoading}
                  onClick={() => void handleValidateStepUp()}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-40"
                >
                  {googleStepUpLoading ? 'Validating...' : 'Validate step-up'}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                Required for add, test, and delete. Proof tokens expire in 5 minutes.
              </p>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px]">
              <input
                value={googleKeyLabel}
                onChange={(event) => setGoogleKeyLabel(event.target.value)}
                placeholder="Label (optional)"
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
              <select
                value={googleKeyMode}
                onChange={(event) => setGoogleKeyMode(event.target.value as 'session' | 'persistent')}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <option value="session">Session key (8h)</option>
                <option value="persistent">Persistent key</option>
              </select>
            </div>
            <div className="mt-2">
              <input
                value={googleKeyInput}
                onChange={(event) => setGoogleKeyInput(event.target.value)}
                placeholder="Paste Google API key"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!googleKeyInput.trim() || googleActionLoading === 'save'}
                onClick={async () => {
                  setGoogleKeysError(null);
                  try {
                    setGoogleActionLoading('save');
                    const proofToken = await requestStepUpProof('key:add');
                    await aiGatewayRequest(
                      googleKeyMode === 'session' ? '/api/keys/google/session' : '/api/keys/google/persistent',
                      {
                        method: 'POST',
                        body: JSON.stringify({
                          apiKey: googleKeyInput,
                          label: googleKeyLabel || undefined,
                          proofToken,
                        }),
                      },
                    );
                    setGoogleKeyInput('');
                    await fetchGoogleKeys();
                  } catch (error) {
                    setGoogleKeysError(error instanceof Error ? error.message : 'Failed to save key');
                  } finally {
                    setGoogleActionLoading(null);
                  }
                }}
                className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {googleActionLoading === 'save' ? 'Saving...' : 'Save key'}
              </button>
            </div>

            {googleKeysError ? <p className="mt-2 text-xs font-medium text-red-600">{googleKeysError}</p> : null}

            <div className="mt-3 space-y-2">
              {googleKeysLoading ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">Loading keys...</div>
              ) : googleKeys.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500">
                  No Google keys configured.
                </div>
              ) : (
                googleKeys.map((key) => (
                  <div key={key.keyId} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-gray-900">
                          {key.label || `Google key ••••${key.last4}`}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {key.mode === 'session' ? 'Session' : 'Persistent'} · {key.status}
                          {key.expiresAt ? ` · expires ${new Date(key.expiresAt).toLocaleString()}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={async () => {
                            setGoogleKeysError(null);
                            try {
                              setGoogleActionLoading(`test:${key.keyId}`);
                              const proofToken = await requestStepUpProof('key:test');
                              await aiGatewayRequest('/api/keys/google/test', {
                                method: 'POST',
                                body: JSON.stringify({
                                  mode: key.mode,
                                  keyId: key.keyId,
                                  proofToken,
                                }),
                              });
                              await fetchGoogleKeys();
                            } catch (error) {
                              setGoogleKeysError(error instanceof Error ? error.message : 'Key test failed');
                            } finally {
                              setGoogleActionLoading(null);
                            }
                          }}
                          className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900"
                        >
                          {googleActionLoading === `test:${key.keyId}` ? 'Testing...' : 'Test'}
                        </button>
                        {key.status === 'paused' ? (
                          <button
                            type="button"
                            onClick={async () => {
                              setGoogleKeysError(null);
                              try {
                                setGoogleActionLoading(`resume:${key.keyId}`);
                                await aiGatewayRequest('/api/keys/google/resume', {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    mode: key.mode,
                                    keyId: key.keyId,
                                  }),
                                });
                                await fetchGoogleKeys();
                              } catch (error) {
                                setGoogleKeysError(error instanceof Error ? error.message : 'Resume failed');
                              } finally {
                                setGoogleActionLoading(null);
                              }
                            }}
                            className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900"
                          >
                            Resume
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              setGoogleKeysError(null);
                              try {
                                setGoogleActionLoading(`pause:${key.keyId}`);
                                await aiGatewayRequest('/api/keys/google/pause', {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    mode: key.mode,
                                    keyId: key.keyId,
                                    reason: 'manual',
                                  }),
                                });
                                await fetchGoogleKeys();
                              } catch (error) {
                                setGoogleKeysError(error instanceof Error ? error.message : 'Pause failed');
                              } finally {
                                setGoogleActionLoading(null);
                              }
                            }}
                            className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900"
                          >
                            Pause
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            setGoogleKeysError(null);
                            try {
                              setGoogleActionLoading(`delete:${key.keyId}`);
                              const proofToken = await requestStepUpProof('key:delete');
                              await aiGatewayRequest(`/api/keys/google/${key.keyId}`, {
                                method: 'DELETE',
                                body: JSON.stringify({
                                  mode: key.mode,
                                  proofToken,
                                }),
                              });
                              await fetchGoogleKeys();
                            } catch (error) {
                              setGoogleKeysError(error instanceof Error ? error.message : 'Delete failed');
                            } finally {
                              setGoogleActionLoading(null);
                            }
                          }}
                          className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </article>

      {/* Notifications panel hidden */}
          {false && (
          <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3 text-white">
              <Bell size={18} />
              <h2 className="text-lg font-semibold">Notifications</h2>
            </div>
            <p className="mt-2 text-sm text-white/60">
              Choose how you are notified about reviews, comments, and product updates.
            </p>
            <div className="mt-4 space-y-3 text-sm text-white/70">
              <ToggleRow
                label="Review updates"
                description="Email me when reviewers submit feedback."
                enabled={localSettings?.notifications.reviewUpdates ?? true}
                onToggle={() =>
                  handleSettingsChange((current) => ({
                    ...current,
                    notifications: {
                      ...current.notifications,
                      reviewUpdates: !current.notifications.reviewUpdates,
                    },
                  }))
                }
              />
              <ToggleRow
                label="Comment mentions"
                description="Send alerts when someone mentions me."
                enabled={localSettings?.notifications.commentMentions ?? true}
                onToggle={() =>
                  handleSettingsChange((current) => ({
                    ...current,
                    notifications: {
                      ...current.notifications,
                      commentMentions: !current.notifications.commentMentions,
                    },
                  }))
                }
              />
              <ToggleRow
                label="Weekly digest"
                description="Summary of progress every Monday."
                enabled={localSettings?.notifications.weeklyDigest ?? true}
                onToggle={() =>
                  handleSettingsChange((current) => ({
                    ...current,
                    notifications: {
                      ...current.notifications,
                      weeklyDigest: !current.notifications.weeklyDigest,
                    },
                  }))
                }
              />
              <ToggleRow
                label="Product updates"
                description="Occasional emails about new features."
                enabled={localSettings?.notifications.productUpdates ?? false}
                onToggle={() =>
                  handleSettingsChange((current) => ({
                    ...current,
                    notifications: {
                      ...current.notifications,
                      productUpdates: !current.notifications.productUpdates,
                    },
                  }))
                }
              />
            </div>
          </article>
          )}

          {/* Security panel hidden */}
          {false && (
          <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3 text-white">
              <Lock size={18} />
              <h2 className="text-lg font-semibold">Security</h2>
            </div>
            <p className="mt-2 text-sm text-white/60">
              Keep your account secure with two-factor authentication and login alerts.
            </p>
            <div className="mt-4 space-y-3 text-sm text-white/70">
              <ToggleRow
                label="Two-factor authentication"
                description="Require a security code on sign-in."
                enabled={localSettings?.security.twoFactorEnabled ?? false}
                onToggle={() =>
                  handleSettingsChange((current) => ({
                    ...current,
                    security: {
                      ...current.security,
                      twoFactorEnabled: !current.security.twoFactorEnabled,
                    },
                  }))
                }
              />
              <ToggleRow
                label="Login alerts"
                description="Notify me when someone signs in from a new device."
                enabled={localSettings?.security.loginAlerts ?? true}
                onToggle={() =>
                  handleSettingsChange((current) => ({
                    ...current,
                    security: {
                      ...current.security,
                      loginAlerts: !current.security.loginAlerts,
                    },
                  }))
                }
              />
              <div>
                <label className="text-xs font-semibold uppercase text-white/40">Backup email</label>
                <input
                  value={localSettings?.security.backupEmail ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    handleSettingsChange((current) => ({
                      ...current,
                      security: {
                        ...current.security,
                        backupEmail: value || null,
                      },
                    }));
                  }}
                  placeholder="Provide an email for recovery"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/60"
              />
              </div>
            </div>
          </article>
          )}
        </div>

        <aside className="space-y-6">
          {/* Integrations panel hidden */}
          {false && (
          <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3 text-white">
              <Layers size={18} />
              <h2 className="text-lg font-semibold">Integrations</h2>
            </div>
            <p className="mt-2 text-sm text-white/60">
              Connect the tools you already use for production tracking.
            </p>
            <div className="mt-4 space-y-3 text-sm text-white/70">
              <IntegrationField
                label="Slack webhook"
                placeholder="https://hooks.slack.com/..."
                value={localSettings?.integrations.slackWebhook ?? ''}
                onChange={(value) =>
                  handleSettingsChange((current) => ({
                    ...current,
                    integrations: { ...current.integrations, slackWebhook: value || null },
                  }))
                }
              />
              <IntegrationField
                label="Notion workspace"
                placeholder="https://www.notion.so/your-workspace"
                value={localSettings?.integrations.notionWorkspaceUrl ?? ''}
                onChange={(value) =>
                  handleSettingsChange((current) => ({
                    ...current,
                    integrations: { ...current.integrations, notionWorkspaceUrl: value || null },
                  }))
                }
              />
              <IntegrationField
                label="Frame.io account"
                placeholder="workflow@frame.io"
                value={localSettings?.integrations.frameIoAccount ?? ''}
                onChange={(value) =>
                  handleSettingsChange((current) => ({
                    ...current,
                    integrations: { ...current.integrations, frameIoAccount: value || null },
                  }))
                }
              />
            </div>
          </article>
          )}

          <article className="library-panel p-4 sm:p-6">
            <div className="flex items-center gap-3 text-gray-900">
              <ExternalLink size={18} />
              <h2 className="text-lg font-semibold">Billing</h2>
            </div>
            <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              <p className="text-base font-semibold text-gray-900">Beta program</p>
              <p className="mt-1">Reffo is currently in beta testing and free to use.</p>
              <p className="mt-1">Pricing will be announced later, and you’ll be notified well in advance.</p>
            </div>
            <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">AI usage (monthly)</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                ${Number(monthlyAiSpend?.totalUsd ?? 0).toFixed(4)}
              </p>
              <p className="text-xs text-gray-500">
                {monthlyAiSpend?.monthKey ?? 'Current month'} · {monthlyAiSpend?.entriesCount ?? 0} ledger entries
              </p>
            </div>
          </article>

          <article className="library-panel border border-red-200 p-4 sm:p-6">
            <div className="flex items-center gap-3 text-red-700">
              <AlertTriangle size={18} />
              <h2 className="text-lg font-semibold">Delete account</h2>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Permanently delete your account and related data. Shared resources are reassigned to an account already included in your sharing setup.
            </p>
            <button
              type="button"
              className="mt-4 rounded-full border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
              onClick={() => {
                setDeleteConfirmText('');
                setDeleteError(null);
                setDeleteDialogOpen(true);
              }}
            >
              Delete account
            </button>
          </article>
        </aside>
      </section>
    </div>
  );
};

interface ToggleRowProps {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, enabled, onToggle }) => (
  <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
    <div>
      <p className="font-semibold text-gray-900">{label}</p>
      <p className="text-xs text-gray-500">{description}</p>
    </div>
    <label className="inline-flex items-center">
      <input
        type="checkbox"
        checked={enabled}
        onChange={onToggle}
        className="h-4 w-4 rounded border-gray-300 bg-white"
      />
    </label>
  </div>
);

interface IntegrationFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

const IntegrationField: React.FC<IntegrationFieldProps> = ({ label, placeholder, value, onChange }) => (
  <div>
    <label className="text-xs font-semibold uppercase text-gray-500">{label}</label>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
    />
  </div>
);

export default ProfileSettings;

// Helpers
async function resizeImage(file: File, maxSize: number, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const targetW = Math.round(bitmap.width * ratio);
  const targetH = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', quality));
}

async function uploadBlob(url: string, blob: Blob, contentType: string): Promise<void> {
  await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  }).then((r) => {
    if (!r.ok) throw new Error('Upload failed');
  });
}

interface FriendsManagerProps {
  friends: Array<{ id: string; contactEmail: string; contactName: string | null }>;
  onAdd: (email: string, name?: string) => Promise<void> | void;
  onRemove: (id: string) => Promise<void> | void;
}

const FriendsManager: React.FC<FriendsManagerProps> = ({ friends, onAdd, onRemove }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@studio.com"
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <button
          disabled={!email.trim() || saving}
          onClick={async () => {
            setSaving(true);
            await onAdd(email.trim(), name.trim() || undefined);
            setSaving(false);
            setEmail('');
            setName('');
          }}
          className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-slate-50 enabled:hover:bg-black/90 disabled:opacity-40"
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>
      <ul className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
        {friends.map((f) => (
          <li key={f.id} className="flex items-center justify-between px-4 py-2 text-sm text-gray-700">
            <div>
              <p className="font-semibold text-gray-900">{f.contactName ?? f.contactEmail}</p>
              <p className="text-gray-500">{f.contactEmail}</p>
            </div>
            <button
              onClick={() => onRemove(f.id)}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:text-gray-900"
            >
              Remove
            </button>
          </li>
        ))}
        {friends.length === 0 && (
          <li className="px-4 py-6 text-center text-gray-500 text-sm">No friends yet</li>
        )}
      </ul>
    </div>
  );
};
