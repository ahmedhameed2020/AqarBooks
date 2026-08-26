
-- Release B follow-up: request idempotency + self-service status read.
--
-- WHY THIS EXISTS
-- 1. A partial UNIQUE index is the database invariant a double-click, a
--    retry, or a replayed POST cannot get around: at most one row per
--    requester_user_id may sit in an "actionable" status at a time. A
--    second INSERT attempt while one is already DRAFT/PENDING_APPROVAL/
--    APPROVED/PROVISIONING hits a real unique_violation the action layer
--    turns into "here is your existing request", not a second row. ACTIVE,
--    REJECTED and FAILED are deliberately excluded -- once a request
--    reaches a terminal state, the same person may submit again for a
--    different entity (an approved customer requesting a second entity is
--    exactly the case this migration's sibling change in the app layer is
--    for).
-- 2. onboarding_requests previously had no SELECT policy for the requester
--    themselves -- only platform admins could read any row at all. The
--    dashboard's "no organization yet" branch needs to tell a pending
--    applicant they're pending (not silently show them nothing, and not
--    point them at the old create-a-workspace CTA which would just collide
--    with the new idempotency constraint). This grants exactly one thing:
--    a user may SELECT their own request rows. Never anyone else's.

create unique index if not exists onboarding_requests_one_actionable_per_requester
  on public.onboarding_requests (requester_user_id)
  where status in ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PROVISIONING');

create policy onboarding_requests_select_own
  on public.onboarding_requests for select
  using (requester_user_id = auth.uid());
