import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
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
  Loader2,
} from 'lucide-react';
import { useThemePreference } from '../useTheme';
import lottieLoaderRaw from '../assets/animations/Loader.json?raw';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
const lottieLoader = `data:application/json;charset=utf-8,${encodeURIComponent(lottieLoaderRaw as unknown as string)}`;

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

const ProfileSettings: React.FC<ProfileSettingsProps> = ({ user, projects, onBack }) => {
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
  const addFriend = useMutation(api.friends.add);
  const removeFriend = useMutation(api.friends.remove);

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
        <lottie-player
          src={lottieLoader}
          autoplay
          loop
          style={{ width: '160px', height: '160px' }}
        ></lottie-player>
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
