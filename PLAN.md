# Communities Feature - Implementation Plan

## Overview

Add a Communities feature to Pump Shinsa where players can form groups, differentiate themselves with badges/tags, post content, and moderate membership. Communities are accessible at `/c/:communityName`.

---

## Phase 1: Database Schema

Add the following tables to `server/db/schema.js`:

### `communities`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL UNIQUE | URL-safe community name (used in `/c/:name`) |
| display_name | TEXT NOT NULL | Displayed name (can have spaces/caps) |
| description | TEXT | Community description |
| avatar | TEXT | Avatar image (base64 data URL, same pattern as users) |
| banner | TEXT | Banner image (base64 data URL) |
| owner_id | TEXT NOT NULL | FK → users.id |
| is_invite_only | INT DEFAULT 0 | 0 = open, 1 = invite only |
| badge_text | TEXT | Short affiliation badge text (e.g. "KR", "PIU") |
| badge_color | TEXT | Badge background color hex (e.g. "#ff3366") |
| badge_text_color | TEXT DEFAULT '#ffffff' | Badge text color hex |
| created_at | TEXT | datetime default |

### `community_members`
| Column | Type | Notes |
|--------|------|-------|
| community_id | TEXT | FK → communities.id |
| user_id | TEXT | FK → users.id |
| role | TEXT DEFAULT 'member' | 'owner' / 'moderator' / 'member' |
| joined_at | TEXT | datetime default |
| PRIMARY KEY | (community_id, user_id) | |

### `community_tags`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| community_id | TEXT | FK → communities.id |
| name | TEXT NOT NULL | Tag display text |
| color | TEXT | Background color hex |
| text_color | TEXT DEFAULT '#ffffff' | Text color hex |
| created_at | TEXT | datetime default |

### `community_member_tags`
| Column | Type | Notes |
|--------|------|-------|
| community_id | TEXT | FK → communities.id |
| user_id | TEXT | FK → users.id |
| tag_id | TEXT | FK → community_tags.id |
| PRIMARY KEY | (community_id, user_id, tag_id) | |

### `community_posts`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| community_id | TEXT | FK → communities.id |
| user_id | TEXT | FK → users.id (author) |
| content | TEXT | Post text content |
| images | TEXT DEFAULT '[]' | JSON array of base64 data URLs |
| youtube_url | TEXT | Optional YouTube embed |
| is_pinned | INT DEFAULT 0 | Pinned by moderator/owner |
| comments_disabled | INT DEFAULT 0 | |
| created_at | TEXT | datetime default |
| updated_at | TEXT | datetime default |

### `community_post_pumps`
| Column | Type | Notes |
|--------|------|-------|
| post_id | TEXT | FK → community_posts.id |
| user_id | TEXT | FK → users.id |
| created_at | TEXT | datetime default |
| PRIMARY KEY | (post_id, user_id) | |

### `community_post_comments`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| post_id | TEXT | FK → community_posts.id |
| user_id | TEXT | FK → users.id |
| parent_id | TEXT | FK → self (for nested replies) |
| content | TEXT | |
| created_at | TEXT | datetime default |

### `community_comment_pumps`
| Column | Type | Notes |
|--------|------|-------|
| comment_id | TEXT | FK → community_post_comments.id |
| user_id | TEXT | FK → users.id |
| created_at | TEXT | datetime default |
| PRIMARY KEY | (comment_id, user_id) | |

### `community_join_requests`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| community_id | TEXT | FK → communities.id |
| user_id | TEXT | FK → users.id |
| status | TEXT DEFAULT 'pending' | 'pending' / 'accepted' / 'declined' |
| created_at | TEXT | datetime default |

---

## Phase 2: Backend API Routes

Create `server/routes/communities.js` and mount at `/api/communities`.

### Community CRUD
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/` | requireAuth | Create community (creator becomes owner) |
| GET | `/` | none | List communities (paginated, for home page & browse) |
| GET | `/featured` | none | Get 3 featured/popular communities (for home page) |
| GET | `/name/:name` | optionalAuth | Get community by URL name (main community page) |
| PUT | `/:id` | requireAuth | Update community (owner/moderator: name, description, avatar, banner, badge, invite_only) |
| DELETE | `/:id` | requireAuth | Delete community (owner only) |

### Membership
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/:id/join` | requireAuth | Join community (or submit join request if invite-only) |
| DELETE | `/:id/leave` | requireAuth | Leave community |
| GET | `/:id/members` | none | List members (supports `?sort=pumbility` or `?sort=joined`) |
| PUT | `/:id/members/:userId/role` | requireAuth | Change member role (owner only for moderator promotion; owner/mod for other changes) |
| DELETE | `/:id/members/:userId` | requireAuth | Remove member (moderator/owner) |

### Join Requests (invite-only communities)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/:id/requests` | requireAuth | List pending join requests (moderator/owner) |
| PUT | `/:id/requests/:requestId` | requireAuth | Accept/decline request (moderator/owner) |

### Tags
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/:id/tags` | none | List community tags |
| POST | `/:id/tags` | requireAuth | Create tag (owner/moderator) |
| PUT | `/:id/tags/:tagId` | requireAuth | Update tag (owner/moderator) |
| DELETE | `/:id/tags/:tagId` | requireAuth | Delete tag (owner/moderator) |
| POST | `/:id/tags/:tagId/assign/:userId` | requireAuth | Assign tag to member (owner/moderator) |
| DELETE | `/:id/tags/:tagId/assign/:userId` | requireAuth | Remove tag from member (owner/moderator) |

### Community Posts
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/:id/posts` | requireAuth | Create post (members only) |
| GET | `/:id/posts` | optionalAuth | List posts (`?sort=new` or `?sort=activity`). Non-members of open communities can view but not interact. |
| PUT | `/:id/posts/:postId` | requireAuth | Edit post (author only) |
| DELETE | `/:id/posts/:postId` | requireAuth | Delete post (author or moderator/owner) |
| PUT | `/:id/posts/:postId/pin` | requireAuth | Pin/unpin post (moderator/owner) |

### Community Post Interactions
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/:id/posts/:postId/pump` | requireAuth | Pump post (members only) |
| DELETE | `/:id/posts/:postId/pump` | requireAuth | Un-pump post |
| GET | `/:id/posts/:postId/comments` | optionalAuth | Get comments |
| POST | `/:id/posts/:postId/comments` | requireAuth | Add comment (members only) |
| DELETE | `/:id/posts/:postId/comments/:commentId` | requireAuth | Delete comment (author or mod/owner) |
| POST | `/comments/:commentId/pump` | requireAuth | Pump comment (members only) |

---

## Phase 3: Frontend - API Utility Functions

Add to `client/src/utils/api.js`:

- `createCommunity(data)` — POST `/api/communities`
- `getCommunities(params)` — GET `/api/communities`
- `getFeaturedCommunities()` — GET `/api/communities/featured`
- `getCommunityByName(name)` — GET `/api/communities/name/:name`
- `updateCommunity(id, data)` — PUT `/api/communities/:id`
- `deleteCommunity(id)` — DELETE `/api/communities/:id`
- `joinCommunity(id)` — POST `/api/communities/:id/join`
- `leaveCommunity(id)` — DELETE `/api/communities/:id/leave`
- `getCommunityMembers(id, params)` — GET `/api/communities/:id/members`
- `updateMemberRole(communityId, userId, role)` — PUT
- `removeMember(communityId, userId)` — DELETE
- `getJoinRequests(id)` — GET
- `respondToJoinRequest(communityId, requestId, status)` — PUT
- `getCommunityTags(id)` — GET
- `createCommunityTag(id, data)` — POST
- `updateCommunityTag(id, tagId, data)` — PUT
- `deleteCommunityTag(id, tagId)` — DELETE
- `assignTag(communityId, tagId, userId)` — POST
- `removeTag(communityId, tagId, userId)` — DELETE
- `createCommunityPost(communityId, data)` — POST (multipart/form-data for images)
- `getCommunityPosts(communityId, params)` — GET
- `updateCommunityPost(communityId, postId, data)` — PUT
- `deleteCommunityPost(communityId, postId)` — DELETE
- `pinCommunityPost(communityId, postId)` — PUT
- `pumpCommunityPost(communityId, postId)` — POST
- `unpumpCommunityPost(communityId, postId)` — DELETE
- `getCommunityPostComments(communityId, postId)` — GET
- `addCommunityPostComment(communityId, postId, data)` — POST
- `deleteCommunityPostComment(communityId, postId, commentId)` — DELETE
- `pumpCommunityComment(commentId)` — POST

---

## Phase 4: Frontend - Pages & Components

### New Pages

#### 1. `CommunityPage.jsx` — `/c/:communityName`
The main community page. Sections:

- **Banner area**: Full-width banner image (if set), overlaid with avatar and community name/description. If no banner, a gradient fallback. Banner should be constrained height (e.g., max-h-48) so it doesn't dominate the page.
- **Community header**: Avatar (left), display name, description, owner info, member count, badge preview.
- **Action bar**: Join/Leave button, or "Pending" if request is submitted. Settings gear icon for owner/moderator.
- **Tabs/sections**:
  - **Posts** (default): Community posts feed with sort toggle (New Posts / Recent Activity). Pinned posts shown at top with a pin indicator. Non-members of open communities see posts but interaction buttons are disabled with "Join to interact" tooltip.
  - **Members**: Member list with avatar, username, role badge (Owner/Mod), community tags, pumbility. Sortable by pumbility or join date.
- **Post composer** (members only): Inline at top of posts tab, similar to existing `PostsPage` but scoped to community.

#### 2. `CommunitySetupPage.jsx` — `/community/new`
Create community form:
- Community name (URL-safe, auto-slugified from display name, editable)
- Display name
- Description (textarea)
- Avatar picker (reuse `AvatarPicker` component)
- Banner upload
- Open vs. Invite-only toggle
- Badge configuration: badge text, badge background color, badge text color (with live preview)

#### 3. `CommunitySettingsPage.jsx` — `/c/:communityName/settings`
Management page for owner/moderators:
- **General tab**: Edit display name, description, avatar, banner, open/invite-only, badge config
- **Members tab**: List members with role management (promote to moderator, demote, remove). Pending join requests (if invite-only).
- **Tags tab**: Create/edit/delete tags. Assign/remove tags from members.

### Modified Pages

#### 4. `Dashboard.jsx` — Add Communities Section
After the existing sections (Notices, Tournaments, etc.), add a "Communities" section:
- Section header: "Communities" with a right-arrow "See all" link
- Show 3 community cards in a horizontal row (responsive: stack on mobile)
- Each card: avatar, display name, truncated description, owner name
- Cards link to `/c/:communityName`

#### 5. `App.jsx` — Add Routes
Add new routes:
- `/c/:communityName` → `CommunityPage`
- `/community/new` → `CommunitySetupPage`
- `/c/:communityName/settings` → `CommunitySettingsPage`

Add "Communities" link in header nav (between Feed and search).

### New/Modified Components

#### 6. `CommunityBadge.jsx` (new component)
Small inline badge component showing community affiliation:
- Props: `text`, `bgColor`, `textColor`
- Renders a small pill/chip (e.g., `<span>` with dynamic background)
- Used beside usernames in community contexts and optionally across the app (profile, posts, etc.)

#### 7. `CommunityTag.jsx` (new component)
Similar to badge but for community-specific member tags:
- Props: `name`, `color`, `textColor`
- Renders as a small colored tag next to the user's name within community contexts only

#### 8. `CommunityPostCard.jsx` (new component, or extend existing `PostCard.jsx`)
Reuse the existing `PostCard` pattern but adapted for community posts:
- Shows author with their community tag(s) next to their name
- Pin indicator for pinned posts
- Pump and comment functionality scoped to community membership
- Same image gallery, YouTube embed, text formatting as existing posts

---

## Phase 5: Affiliation Badges Across the App

Community affiliation badges should be visible alongside usernames in key places:
- **Community posts**: Show the user's tag(s) for that community next to their name
- **Community member list**: Show tags assigned within the community
- **User profile page** (`ProfilePage.jsx`): Show a "Communities" section listing communities the user belongs to, with their badge from each

The badge is set at the **community level** (all members share the same badge design). Tags are **per-member** within a community.

---

## Phase 6: Implementation Order

The recommended order of implementation:

1. **Database schema** — Add all new tables to `schema.js`
2. **Backend routes** — `communities.js` with full CRUD, membership, tags, posts, interactions
3. **API utility functions** — Add all community API calls to `api.js`
4. **Community setup page** — Create community form
5. **Community page** — Main community view with posts, members, banner, badge
6. **Community settings page** — Management for owner/moderators
7. **Dashboard integration** — Add communities section to home page
8. **App routing** — Register all new routes, add nav links
9. **Affiliation badges & tags** — Badge/tag components, integrate into community contexts
10. **Profile integration** — Show user's communities on their profile

---

## Key Design Decisions

- **URL structure**: `/c/:communityName` as requested (e.g., `/c/korean-pumpers`)
- **Community name**: Stored as a URL-safe slug (lowercase, hyphens). Display name is separate and can be anything.
- **Images**: Follow existing pattern — base64 data URLs stored in SQLite, compressed with Sharp on upload.
- **Banner design**: Constrained to max-height with object-cover, so it fills the space without overwhelming the layout. Falls back to a gradient if unset.
- **Tags are community-scoped**: A user's tag in Community A does NOT show in Community B. Tags only appear within the community where they were assigned.
- **Badges are community-level**: The community sets one badge design (text + colors) that represents the community. All members share this badge.
- **Post sorting**: "New Posts" = ORDER BY created_at DESC. "Recent Activity" = ORDER BY last_activity DESC (computed from latest comment or post creation).
- **Open communities**: Anyone can view posts, but only members can post/comment/pump. Invite-only communities: non-members see a "This community is invite-only" message.
- **Moderation**: Owner can promote members to moderator. Moderators can accept/decline join requests, remove members (not other mods or owner), pin posts, and manage tags. Owner can do everything plus delete community and manage moderator roles.
