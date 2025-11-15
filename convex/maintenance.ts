import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";

function pickCanonical(users: Array<any>) {
  if (users.length === 0) return null;
  const withClerk = users.filter((u) => Boolean(u.clerkId));
  const pool = withClerk.length ? withClerk : users;
  pool.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return pool[0];
}

export const dedupeUsersAndRepairOwnership = mutation({
  args: {},
  async handler(ctx) {
    const users = await ctx.db.query('users').collect();
    const byEmail = new Map<string, Array<any>>();
    for (const u of users) {
      const key = (u.email || '').toLowerCase();
      if (!key) continue;
      const arr = byEmail.get(key) ?? [];
      arr.push(u);
      byEmail.set(key, arr);
    }

    for (const [email, list] of byEmail.entries()) {
      if (list.length <= 1) continue;
      const canonical = pickCanonical(list);
      if (!canonical) continue;
      const dupes = list.filter((u) => u._id !== canonical._id);

      // Patch references across tables from each dupe to canonical
      for (const dupe of dupes) {
        const from = dupe._id as Id<'users'>;
        const to = canonical._id as Id<'users'>;

        // projects.ownerId
        const projOwned = await ctx.db.query('projects').withIndex('byOwner', (q) => q.eq('ownerId', from)).collect();
        await Promise.all(projOwned.map((p) => ctx.db.patch(p._id, { ownerId: to })));

        // videos.ownerId
        const vidOwned = await ctx.db.query('videos').withIndex('byOwner', (q) => q.eq('ownerId', from)).collect();
        await Promise.all(vidOwned.map((v) => ctx.db.patch(v._id, { ownerId: to })));

        // annotations.authorId
        const anns = await ctx.db.query('annotations').collect();
        await Promise.all(anns.filter((a: any) => a.authorId === from).map((a: any) => ctx.db.patch(a._id, { authorId: to })));

        // comments.authorId
        const comments = await ctx.db.query('comments').collect();
        await Promise.all(comments.filter((c: any) => c.authorId === from).map((c: any) => ctx.db.patch(c._id, { authorId: to })));

        // shareGroups.ownerId
        const sgs = await ctx.db.query('shareGroups').withIndex('byOwner', (q) => q.eq('ownerId', from)).collect();
        await Promise.all(sgs.map((g) => ctx.db.patch(g._id, { ownerId: to })));

        // shareGroupMembers.userId
        const sgm = await ctx.db.query('shareGroupMembers').withIndex('byEmail', (q) => q.eq('email', email)).collect();
        await Promise.all(sgm.filter((m: any) => m.userId === from).map((m: any) => ctx.db.patch(m._id, { userId: to })));

        // contentShares.ownerId
        const shares = await ctx.db.query('contentShares').withIndex('byOwner', (q) => q.eq('ownerId', from)).collect();
        await Promise.all(shares.map((s) => ctx.db.patch(s._id, { ownerId: to })));

        // friends: ownerId and contactUserId
        const friendsOwned = await ctx.db.query('friends').withIndex('byOwner', (q) => q.eq('ownerId', from)).collect();
        // Move owned friends; skip duplicates by email
        for (const fr of friendsOwned) {
          const exists = await ctx.db
            .query('friends')
            .withIndex('byOwner', (q) => q.eq('ownerId', to))
            .filter((q) => q.eq(q.field('contactEmail'), fr.contactEmail))
            .first();
          if (exists) {
            await ctx.db.delete(fr._id);
          } else {
            await ctx.db.patch(fr._id, { ownerId: to });
          }
        }
        const friendsContact = await ctx.db.query('friends').collect();
        await Promise.all(
          friendsContact
            .filter((f: any) => f.contactUserId === from)
            .map((f: any) => ctx.db.patch(f._id, { contactUserId: to }))
        );

        // notifications.userId and fromUserId
        const notes = await ctx.db.query('notifications').collect();
        await Promise.all(notes.filter((n: any) => n.userId === from).map((n: any) => ctx.db.patch(n._id, { userId: to })));
        await Promise.all(notes.filter((n: any) => n.fromUserId === from).map((n: any) => ctx.db.patch(n._id, { fromUserId: to })));

        // userSettings: merge or move
        const dupeSettings = await ctx.db.query('userSettings').withIndex('byUser', (q) => q.eq('userId', from)).collect();
        const canonicalSettings = await ctx.db.query('userSettings').withIndex('byUser', (q) => q.eq('userId', to)).first();
        for (const s of dupeSettings) {
          if (canonicalSettings) {
            // Merge autoShareGroupIds (set-union)
            const mergedAuto = Array.from(new Set([...
              (canonicalSettings.workspace?.autoShareGroupIds ?? []),
              ...(s.workspace?.autoShareGroupIds ?? []),
            ]));
            await ctx.db.patch(canonicalSettings._id, {
              workspace: {
                ...canonicalSettings.workspace,
                autoShareGroupIds: mergedAuto,
                defaultProjectId: canonicalSettings.workspace?.defaultProjectId ?? s.workspace?.defaultProjectId,
                theme: canonicalSettings.workspace?.theme ?? s.workspace?.theme ?? 'system',
              },
              // Keep other top-level fields from canonical
            } as any);
            await ctx.db.delete(s._id);
          } else {
            await ctx.db.patch(s._id, { userId: to });
          }
        }

        // Finally delete the duplicate user row
        await ctx.db.delete(from);
      }
    }

    return { fixedEmails: Array.from(byEmail.entries()).filter(([, arr]) => arr.length > 1).map(([e]) => e) };
  },
});

export const relinkUserIds = mutation({
  args: {
    fromUserId: v.id('users'),
    toUserId: v.id('users'),
    setCreatedAt: v.optional(v.number()),
  },
  async handler(ctx, { fromUserId, toUserId, setCreatedAt }) {
    if (fromUserId === toUserId) {
      return { updated: 0 };
    }

    const now = Date.now();
    let updated = 0;

    // Optionally set createdAt on destination user
    if (setCreatedAt !== undefined) {
      const to = await ctx.db.get(toUserId);
      if (to) {
        await ctx.db.patch(toUserId, { createdAt: setCreatedAt, updatedAt: now });
      }
    }

    // projects.ownerId
    const projOwned = await ctx.db.query('projects').withIndex('byOwner', (q) => q.eq('ownerId', fromUserId)).collect();
    await Promise.all(projOwned.map((p) => ctx.db.patch(p._id, { ownerId: toUserId }))); updated += projOwned.length;

    // videos.ownerId
    const vidOwned = await ctx.db.query('videos').withIndex('byOwner', (q) => q.eq('ownerId', fromUserId)).collect();
    await Promise.all(vidOwned.map((v) => ctx.db.patch(v._id, { ownerId: toUserId }))); updated += vidOwned.length;

    // annotations.authorId
    const anns = await ctx.db.query('annotations').collect();
    const annsHit = anns.filter((a: any) => a.authorId === fromUserId);
    await Promise.all(annsHit.map((a: any) => ctx.db.patch(a._id, { authorId: toUserId }))); updated += annsHit.length;

    // comments.authorId
    const comments = await ctx.db.query('comments').collect();
    const commentsHit = comments.filter((c: any) => c.authorId === fromUserId);
    await Promise.all(commentsHit.map((c: any) => ctx.db.patch(c._id, { authorId: toUserId }))); updated += commentsHit.length;

    // shareGroups.ownerId
    const sgs = await ctx.db.query('shareGroups').withIndex('byOwner', (q) => q.eq('ownerId', fromUserId)).collect();
    await Promise.all(sgs.map((g) => ctx.db.patch(g._id, { ownerId: toUserId }))); updated += sgs.length;

    // shareGroupMembers.userId
    const sgm = await ctx.db.query('shareGroupMembers').collect();
    const sgmHit = sgm.filter((m: any) => m.userId === fromUserId);
    await Promise.all(sgmHit.map((m: any) => ctx.db.patch(m._id, { userId: toUserId }))); updated += sgmHit.length;

    // contentShares.ownerId
    const shares = await ctx.db.query('contentShares').withIndex('byOwner', (q) => q.eq('ownerId', fromUserId)).collect();
    await Promise.all(shares.map((s) => ctx.db.patch(s._id, { ownerId: toUserId }))); updated += shares.length;

    // friends.ownerId
    const friendsOwned = await ctx.db.query('friends').withIndex('byOwner', (q) => q.eq('ownerId', fromUserId)).collect();
    for (const fr of friendsOwned) {
      const exists = await ctx.db
        .query('friends')
        .withIndex('byOwner', (q) => q.eq('ownerId', toUserId))
        .filter((q) => q.eq(q.field('contactEmail'), fr.contactEmail))
        .first();
      if (exists) {
        await ctx.db.delete(fr._id);
      } else {
        await ctx.db.patch(fr._id, { ownerId: toUserId }); updated++;
      }
    }
    // friends.contactUserId
    const friendsAll = await ctx.db.query('friends').collect();
    const friendsHit = friendsAll.filter((f: any) => f.contactUserId === fromUserId);
    await Promise.all(friendsHit.map((f: any) => ctx.db.patch(f._id, { contactUserId: toUserId }))); updated += friendsHit.length;

    // notifications
    const notes = await ctx.db.query('notifications').collect();
    const notesUser = notes.filter((n: any) => n.userId === fromUserId);
    const notesFrom = notes.filter((n: any) => n.fromUserId === fromUserId);
    await Promise.all(notesUser.map((n: any) => ctx.db.patch(n._id, { userId: toUserId }))); updated += notesUser.length;
    await Promise.all(notesFrom.map((n: any) => ctx.db.patch(n._id, { fromUserId: toUserId }))); updated += notesFrom.length;

    // userSettings
    const dupeSettings = await ctx.db.query('userSettings').withIndex('byUser', (q) => q.eq('userId', fromUserId)).collect();
    const canonicalSettings = await ctx.db.query('userSettings').withIndex('byUser', (q) => q.eq('userId', toUserId)).first();
    for (const s of dupeSettings) {
      if (canonicalSettings) {
        const mergedAuto = Array.from(new Set([
          ...(canonicalSettings.workspace?.autoShareGroupIds ?? []),
          ...(s.workspace?.autoShareGroupIds ?? []),
        ]));
        await ctx.db.patch(canonicalSettings._id, {
          workspace: {
            ...canonicalSettings.workspace,
            autoShareGroupIds: mergedAuto,
            defaultProjectId: canonicalSettings.workspace?.defaultProjectId ?? s.workspace?.defaultProjectId,
            theme: canonicalSettings.workspace?.theme ?? s.workspace?.theme ?? 'system',
          },
        } as any);
        await ctx.db.delete(s._id); updated++;
      } else {
        await ctx.db.patch(s._id, { userId: toUserId }); updated++;
      }
    }

    return { updated };
  },
});

export const rewritePublicUrls = mutation({
  args: {
    fromBase: v.string(),
    toBase: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  async handler(ctx, { fromBase, toBase, dryRun }) {
    const from = fromBase.replace(/\/$/, "");
    const to = toBase.replace(/\/$/, "");

    const replaceUrl = (url: any): string | null => {
      if (typeof url !== 'string' || url.length === 0) return null;
      if (url === to || url.startsWith(to + '/')) return null; // already correct base
      if (url === from) return to;
      if (url.startsWith(from + '/')) {
        return to + url.slice(from.length);
      }
      return null;
    };

    let updatedVideos = 0;
    let updatedUsers = 0;
    let updatedAnnotations = 0;
    let updatedNotifications = 0;

    // videos: src, thumbnailUrl
    const videos = await ctx.db.query('videos').collect();
    for (const vdoc of videos) {
      const nextSrc = replaceUrl((vdoc as any).src);
      const nextThumb = replaceUrl((vdoc as any).thumbnailUrl ?? null);
      if (nextSrc || nextThumb) {
        updatedVideos++;
        if (!dryRun) {
          await ctx.db.patch(vdoc._id, {
            src: nextSrc ? nextSrc : vdoc.src,
            thumbnailUrl: nextThumb ? nextThumb : vdoc.thumbnailUrl,
          } as any);
        }
      }
    }

    // users: avatar
    const users = await ctx.db.query('users').collect();
    for (const u of users) {
      const nextAvatar = replaceUrl((u as any).avatar ?? null);
      if (nextAvatar) {
        updatedUsers++;
        if (!dryRun) {
          await ctx.db.patch(u._id as Id<'users'>, { avatar: nextAvatar } as any);
        }
      }
    }

    // annotations: data.src in media payloads
    const anns = await ctx.db.query('annotations').collect();
    for (const a of anns) {
      const data: any = (a as any).data;
      if (data && typeof data === 'object' && typeof (data as any).src === 'string') {
        const next = replaceUrl((data as any).src);
        if (next) {
          updatedAnnotations++;
          if (!dryRun) {
            const nextData = { ...(data as any), src: next };
            await ctx.db.patch(a._id as Id<'annotations'>, { data: nextData } as any);
          }
        }
      }
    }

    // notifications: previewUrl
    const notes = await ctx.db.query('notifications').collect();
    for (const n of notes) {
      const nextPrev = replaceUrl((n as any).previewUrl ?? null);
      if (nextPrev) {
        updatedNotifications++;
        if (!dryRun) {
          await ctx.db.patch(n._id as Id<'notifications'>, { previewUrl: nextPrev } as any);
        }
      }
    }

    return {
      dryRun: !!dryRun,
      from,
      to,
      updated: {
        videos: updatedVideos,
        users: updatedUsers,
        annotations: updatedAnnotations,
        notifications: updatedNotifications,
      },
    };
  },
});

export const scanPublicUrlPrefixes = query({
  args: {},
  async handler(ctx) {
    const prefixes = (url: any): string | null => {
      if (typeof url !== 'string' || url.length === 0) return null;
      try {
        const u = new URL(url);
        // origin + first path segment (bucket name in path-style addressing)
        const first = u.pathname.split('/').filter(Boolean)[0] ?? '';
        if (!first) return u.origin;
        return `${u.origin}/${first}`;
      } catch {
        return null;
      }
    };

    const add = (map: Record<string, number>, key: string | null) => {
      if (!key) return;
      map[key] = (map[key] ?? 0) + 1;
    };

    const videos = await ctx.db.query('videos').collect();
    const users = await ctx.db.query('users').collect();
    const anns = await ctx.db.query('annotations').collect();
    const notes = await ctx.db.query('notifications').collect();

    const out = {
      videos: { src: {} as Record<string, number>, thumbnailUrl: {} as Record<string, number> },
      users: { avatar: {} as Record<string, number> },
      annotations: { dataSrc: {} as Record<string, number> },
      notifications: { previewUrl: {} as Record<string, number> },
      samples: {
        videos: [] as Array<{ id: Id<'videos'>; src?: string; thumbnailUrl?: string }>,
        users: [] as Array<{ id: Id<'users'>; avatar?: string }>,
        annotations: [] as Array<{ id: Id<'annotations'>; src?: string }>,
        notifications: [] as Array<{ id: Id<'notifications'>; previewUrl?: string }>,
      },
    };

    for (const vdoc of videos) {
      add(out.videos.src, prefixes((vdoc as any).src));
      add(out.videos.thumbnailUrl, prefixes((vdoc as any).thumbnailUrl ?? null));
    }
    for (const u of users) {
      add(out.users.avatar, prefixes((u as any).avatar ?? null));
    }
    for (const a of anns) {
      const data: any = (a as any).data;
      const src = data && typeof data === 'object' ? (data as any).src : undefined;
      if (typeof src === 'string') add(out.annotations.dataSrc, prefixes(src));
    }
    for (const n of notes) {
      add(out.notifications.previewUrl, prefixes((n as any).previewUrl ?? null));
    }

    // add up to a few samples for convenience
    out.samples.videos = videos.slice(0, 5).map((v: any) => ({ id: v._id, src: v.src, thumbnailUrl: v.thumbnailUrl }));
    out.samples.users = users.slice(0, 5).map((u: any) => ({ id: u._id, avatar: u.avatar }));
    out.samples.annotations = anns
      .filter((a: any) => a?.data && typeof a.data === 'object' && typeof a.data.src === 'string')
      .slice(0, 5)
      .map((a: any) => ({ id: a._id, src: a.data.src }));
    out.samples.notifications = notes.slice(0, 5).map((n: any) => ({ id: n._id, previewUrl: (n as any).previewUrl }));

    return out;
  },
});
