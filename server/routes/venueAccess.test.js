const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

require.cache[require.resolve('../db/schema')] = {
  exports: {
    getDb() {
      throw new Error('getDb should not be called by venueAccess unit tests');
    },
  },
};
require.cache[require.resolve('./auth')] = {
  exports: {
    requireAuth(_req, _res, next) {
      return next();
    },
    isAdminUser() {
      return false;
    },
    hasFeatureAccess() {
      return false;
    },
  },
};

const {
  checkUserVenueAccess,
  reconcileExpiredVenueSubscriptions,
} = require('./venueAccess');

function isoDateFromToday(offsetDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function createDb() {
  const state = {
    groups: [{ id: 'dojo-member', name: 'Pump Dojo', description: 'Members' }],
    groupMembers: [],
    subscriptions: [],
    dayPasses: [],
  };

  const findGroup = (name) => state.groups.find((g) =>
    String(g.name).toLowerCase() === String(name).toLowerCase()
  ) || null;
  const userHasGroup = (userId, groupName) => {
    const group = findGroup(groupName);
    return !!group && state.groupMembers.some((m) => m.group_id === group.id && m.user_id === userId);
  };

  return {
    state,
    hasGroup: userHasGroup,
    prepare(sql) {
      const compact = String(sql).replace(/\s+/g, ' ').trim();

      if (compact.startsWith('SELECT id FROM admin_user_groups WHERE name = ?')) {
        return {
          get(name) {
            const group = findGroup(name);
            return group ? { id: group.id } : undefined;
          },
        };
      }

      if (compact.includes('SELECT 1 FROM admin_user_group_members gm')
        && compact.includes('JOIN admin_user_groups g')) {
        return {
          get(userId, groupName) {
            return userHasGroup(userId, groupName) ? { 1: 1 } : undefined;
          },
        };
      }

      if (compact.startsWith('INSERT INTO admin_user_groups')) {
        return {
          run(id, name, description) {
            if (!findGroup(name)) {
              state.groups.push({ id, name, description });
              return { changes: 1 };
            }
            return { changes: 0 };
          },
        };
      }

      if (compact.startsWith('INSERT OR IGNORE INTO admin_user_group_members')) {
        return {
          run(groupId, userId) {
            const exists = state.groupMembers.some((m) => m.group_id === groupId && m.user_id === userId);
            if (!exists) {
              state.groupMembers.push({ group_id: groupId, user_id: userId });
              return { changes: 1 };
            }
            return { changes: 0 };
          },
        };
      }

      if (compact.startsWith('INSERT OR IGNORE INTO admin_user_group_feature_permissions')) {
        return { run: () => ({ changes: 1 }) };
      }

      if (compact.startsWith('DELETE FROM admin_user_group_members')) {
        return {
          run(userId, groupName) {
            const group = findGroup(groupName);
            if (!group) return { changes: 0 };
            const before = state.groupMembers.length;
            state.groupMembers = state.groupMembers.filter((m) =>
              !(m.user_id === userId && m.group_id === group.id)
            );
            return { changes: before - state.groupMembers.length };
          },
        };
      }

      if (compact.startsWith('UPDATE venue_subscriptions')) {
        return {
          run(userId, venueId, today) {
            let changes = 0;
            for (const sub of state.subscriptions) {
              const oneTime = !String(sub.square_subscription_id || '').trim();
              const elapsed = !!sub.current_period_end && sub.current_period_end < today;
              if (sub.user_id === userId
                && sub.venue_id === venueId
                && ['active', 'past_due'].includes(sub.status)
                && oneTime
                && elapsed) {
                sub.status = 'expired';
                sub.cancelled_at ||= 'now';
                sub.updated_at = 'now';
                changes += 1;
              }
            }
            return { changes };
          },
        };
      }

      if (compact.includes('FROM venue_subscriptions')
        && compact.includes("status = 'active'")
        && compact.includes('current_period_start <= ?')
        && compact.includes('current_period_end >= ?')) {
        return {
          get(userId, venueId, startToday, endToday) {
            const sub = state.subscriptions.find((row) =>
              row.user_id === userId
              && row.venue_id === venueId
              && row.status === 'active'
              && row.current_period_start <= startToday
              && row.current_period_end >= endToday
            );
            if (!sub) return undefined;
            return compact.startsWith('SELECT 1') ? { 1: 1 } : {
              id: sub.id,
              plan_id: sub.plan_id,
              current_period_start: sub.current_period_start,
              current_period_end: sub.current_period_end,
            };
          },
        };
      }

      if (compact.includes('FROM venue_day_passes')) {
        return {
          get(userId, venueId, passDate) {
            const pass = state.dayPasses.find((row) =>
              row.user_id === userId
              && row.venue_id === venueId
              && row.pass_date === passDate
              && ['active', 'used'].includes(row.status)
            );
            return pass ? { id: pass.id, plan_id: pass.plan_id, pass_date: pass.pass_date } : undefined;
          },
        };
      }

      throw new Error(`Unexpected SQL in test: ${compact}`);
    },
  };
}

function addDojoMember(db, userId) {
  db.state.groupMembers.push({ group_id: 'dojo-member', user_id: userId });
}

function hasGroup(db, userId, groupName) {
  return db.hasGroup(userId, groupName);
}

describe('venue access subscription expiry', () => {
  it('expires elapsed one-time monthly access and moves the user back to Dojo Visitor', () => {
    const db = createDb();
    addDojoMember(db, 'user-1');
    db.state.subscriptions.push({
      id: 'sub-1',
      user_id: 'user-1',
      venue_id: 'venue-1',
      plan_id: 'plan-1',
      status: 'active',
      square_subscription_id: '',
      current_period_start: isoDateFromToday(-35),
      current_period_end: isoDateFromToday(-1),
    });

    const result = reconcileExpiredVenueSubscriptions(db, 'user-1', 'venue-1');
    const sub = db.state.subscriptions.find((row) => row.id === 'sub-1');

    assert.equal(result.expired_subscriptions, 1);
    assert.equal(result.moved_to_visitor, true);
    assert.equal(sub.status, 'expired');
    assert.ok(sub.cancelled_at);
    assert.equal(hasGroup(db, 'user-1', 'Pump Dojo'), false);
    assert.equal(hasGroup(db, 'user-1', 'Dojo Visitor'), true);
  });

  it('does not grant group-member access after an elapsed one-time subscription', () => {
    const db = createDb();
    addDojoMember(db, 'user-1');
    db.state.subscriptions.push({
      id: 'sub-1',
      user_id: 'user-1',
      venue_id: 'venue-1',
      plan_id: 'plan-1',
      status: 'active',
      square_subscription_id: null,
      current_period_start: isoDateFromToday(-35),
      current_period_end: isoDateFromToday(-1),
    });

    const access = checkUserVenueAccess(db, 'user-1', 'venue-1');

    assert.equal(access.hasAccess, false);
    assert.equal(access.accessType, null);
    assert.equal(hasGroup(db, 'user-1', 'Pump Dojo'), false);
    assert.equal(hasGroup(db, 'user-1', 'Dojo Visitor'), true);
  });

  it('keeps current monthly members in Pump Dojo', () => {
    const db = createDb();
    addDojoMember(db, 'user-1');
    db.state.subscriptions.push({
      id: 'sub-1',
      user_id: 'user-1',
      venue_id: 'venue-1',
      plan_id: 'plan-1',
      status: 'active',
      square_subscription_id: '',
      current_period_start: isoDateFromToday(-1),
      current_period_end: isoDateFromToday(30),
    });

    const access = checkUserVenueAccess(db, 'user-1', 'venue-1');
    const sub = db.state.subscriptions.find((row) => row.id === 'sub-1');

    assert.equal(access.hasAccess, true);
    assert.equal(access.accessType, 'monthly');
    assert.equal(sub.status, 'active');
    assert.equal(hasGroup(db, 'user-1', 'Pump Dojo'), true);
    assert.equal(hasGroup(db, 'user-1', 'Dojo Visitor'), false);
  });
});
