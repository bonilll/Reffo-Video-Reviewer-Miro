import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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

