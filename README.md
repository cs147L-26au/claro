# Claro

An Expo SDK 58 app for small-business decisions, built from the Claro mid-fi prototype's cream, teal, and muted factor palette.

## Run the app

Use **Node 22.23.3** (`nvm use`), then:

```sh
npm ci
npm start
```

Scan the QR code using an SDK 58-compatible Expo Go app. For a browser preview, run `npm run web`. Sign in once to access the app. Tasks, saved decisions, and priorities use your Supabase account and the configuration below.

## What works

- **Home:** upcoming decision reviews, due-item count, task shortcuts, and decision-set navigation. Starts with an honest empty state; no seeded records.
- **Tasks:** describe the decision, review task-specific priorities on one page, then continue to a researched recommendation. Accepted plans stay linked to their original tasks so the recommendation, contacts, specifications, and daily actions can be reopened.
- **Setting Priorities:** account-wide and per-task weights; shared sliders rebalance to exactly 100 points; add, rename, describe, or remove factors (2–8); reset to recommended; saved-task edits save automatically, while universal edits use an explicit save.
- **AI priorities:** new tasks receive 3–6 criteria tailored to their decision, with a summary and reasons. The separate **Priorities → Help me set priorities** assistant still suggests weights for the existing business-wide factors. Both flows require a configured model-provider key; failures never silently replace your choices with invented AI output.
- **Decisions:** a clear recommended supplier or option, an official learn-more link, sourced contact information, and a practical daily action plan. Missing essential details prompt short clarification questions. Accepting a plan saves a decision with its priority snapshot and adds its actions to Calendar. Manual decision creation, search, filtering, editing, archiving, and review dates remain available.
- **Calendar:** dated action items with the details, contacts, and links needed to complete them. **Add plan to calendar** opens the calendar with a confirmation banner; actions can be completed or reopened there.
- **Comparison:** score two options against saved priorities, see weighted scores, then carry your chosen option and reasoning into the decision form. This is a manual scoring tool, not an LLM recommendation.

Supabase is the source of truth for tasks, decisions and their original priority snapshots, saved recommendation plans, calendar actions, options, and universal/task priorities. Only the Auth session and an optional legacy-import marker remain in local storage; unsaved form drafts are temporary. The initial priority request does not create a task. **Continue to decision** saves the new task and its reviewed custom priorities together before opening the recommendation page. A ready recommendation saves as a draft; calendar actions are created only when the user accepts it. Account data refreshes on navigation, app foreground/browser focus, saves, and explicit refresh. Writes require a connection and report failures. Review dates appear in Home; push notifications are not scheduled.

## Add a task: details → priorities → decision → calendar

1. Open **Tasks → Add task**. Enter a decision name (1–120 characters), a description of the goals, choices, or constraints (15–2,000 characters), and an optional real date in `YYYY-MM-DD` format.
2. Tap **Help me make a decision**. The app sends those details to `POST /api/decision-priorities` on the local AI server. A loading state prevents duplicate submissions; **Cancel** stops waiting without saving a task. Errors keep the entered details available to retry.
3. **Set priorities** shows the suggested balance and sliders, with each rationale available through its own **Why?** button. Customer-facing copy uses Claro's voice ("Our suggested balance" and "Our suggestion"). The summary and duplicate chart legend are hidden. Move the sliders to set your own balance; the total remains exactly 100%. **Reset to recommended** restores the proposed weights. **Edit details** opens the entered details: **Back** cancels those edits and restores the existing priorities; **Save** requests a fresh suggestion and returns to priorities on success. The original details and balance remain available if that request fails or is canceled. The Why? links align along the bottom of each row. **Add factors** inside the white slider card opens a compact name/percentage list. Add a custom factor or choose **Add from universal priorities**; each **Add** immediately copies that factor into this task and rebalances the other shares. Duplicate IDs/names are blocked, 2–8 factors are supported, and the universal set is unchanged.
4. Tap **Continue to decision**. The task and reviewed factors save together in Supabase, then `/task/<id>/decision` requests a recommendation when no matching saved plan exists. Back returns to the prior priorities page. Continuing again updates the existing task instead of creating another. Opening the decision page directly shows a **Get my recommendation** action when generation is needed.
5. Review the specific choice, official **Learn more** link, contact information, and expandable specifications/rationale. Each day lists practical actions with relevant details and links. The plan chooses the shortest realistic duration from **1–30 days**, rather than always assuming seven, and must fit the task deadline. If location, requirements, or other essential details are missing, answer the short clarification questions before requesting the recommendation again.
6. Tap **Add plan to calendar** when satisfied. One Supabase transaction creates the decision and every dated action, then marks the saved plan accepted. The calendar opens on the start date with a “task has been added” banner. Repeated taps or a retry return the same receipt without duplicating actions. The original task stays in Tasks; reopening it shows the accepted recommendation, specifications, contacts, and schedule.

The recommendation request uses two model calls: OpenAI web research followed by structured plan formatting. Calls begin only after an explicit **Continue to decision**, **Get my recommendation**, clarification submission, or retry. Reopening a matching saved plan, adjusting its start date, retrying its Supabase save, and accepting it do not call the model. The database rejects acceptance if the task details or effective priorities changed, or if the selected start date would push the schedule past its deadline.

## Supabase setup: login, tasks, decisions, and priorities

1. Copy `.env.example` to `.env` (or add these entries to your existing `.env`):

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://hexdjlxqcrodaugntwlw.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-project-anon-or-publishable-key
   ```

   Only the public client key belongs in Expo. Never use a service-role/secret key. The key is deliberately absent from source control. Restart Expo after changing environment variables.

2. Apply migrations in filename order. For a new, empty project, paste the entire **`supabase/setup.sql`** into its SQL Editor and click **Run** once. This generated file wraps all migrations in one transaction. Regenerate it with `node scripts/prepare-supabase.mjs` after schema edits. Alternatively, use the Supabase CLI:

   ```sh
   npx supabase init  # only if you have not initialized CLI config locally
   npx supabase login
   npx supabase link --project-ref hexdjlxqcrodaugntwlw
   npx supabase db push
   ```

   The first migration creates priority tables and minimal task/option contracts, enables RLS, installs atomic priority saves, and seeds default universal priorities. The second adds task notes/dates/completion, decisions, snapshot validation, and an account-bound save/import RPC. The third (`202611190001_task_priority_defaults.sql`) adds task priority defaults and atomic task creation. The fourth (`202611190002_post_decision_tasks.sql`) adds dated calendar actions. Those first four migrations were previously applied through SQL Editor to project `hexdjlxqcrodaugntwlw`.

   **Decision-plan migration applied:** the project member confirmed running `supabase/migrations/202611200001_task_decision_plans.sql` in the configured project. A subsequent read-only, zero-row API request recognized the plan table and returned the expected anonymous-access denial (`42501`). This migration adds `task_decision_plans`, draft persistence, and atomic plan acceptance; do not rerun it or the combined one-time setup on this project. It requires all four earlier migrations. Signed-in plan generation and acceptance remain untested. The public app key cannot apply SQL. SQL Editor setup does not record CLI migration history: if switching to CLI deployment, repair only migrations confirmed as already applied before using `db push`.

3. Enable email/password Auth in Supabase and restart Expo. **The app opens at login before any tab, task, or decision can be accessed**, including through a deep link. Sign in or create an account, and confirm email if required. Session restoration persists across launches. Home’s Account icon opens refresh, sign-out, and optional import. Signing out removes protected route history and account state. No anonymous account or local-data fallback is created.

**Account data and existing records.** The repo originally stored tasks and decisions under `@claro/data/v1`. After signing in, **Home → Account → Import into this account** can copy those older tasks and decisions to Supabase. It previews counts, preserves existing cloud records and decision snapshots, leaves the original device copy untouched, and records a local completion marker. It does not overwrite universal priorities or silently attach device data to whichever user happens to sign in first. All new saves use Supabase directly.

**Contracts and scope.** Tables use text task/decision/option IDs to support the existing `uid()` format and UUID strings. `tasks` contains `id, user_id, title, notes, due_date, done`; `decisions` stores the decision model with snake_case dates/timestamps. `task_decision_plans` stores the input snapshot, exact priorities, complete recommendation, and acceptance receipt for an originating task. Owner-only reads and RPC-only writes protect this record; accepted plans cannot be overwritten with a new draft. `options(id, task_id, name, ratings jsonb)` remains available for independently supplied candidates and manual scoring. The researched decision flow does not need prepopulated options. The manual comparison still reads cloud universal priorities and saves through the decision form.

`factor` is the stable factor ID (`cost`, `quality`, etc.), not its editable name. Priority tables also store `name`, `description`, `color`, and order to preserve edits across devices. Task priority rows include `excluded` for removed factors and `inherited` for the starting copy of universal factors. A database trigger stores that copy on every new task, including plain inserts from teammate code. Inherited rows are not overrides: the effective set still follows current universal values. Saving custom priorities replaces the copy with explicit overrides. Reverting removes overrides and resumes universal inheritance; an empty set also means universal. Task custom saves store the displayed set with explicit exclusions, so its weights win for those factors; new universal factors fall back and the merged set is renormalized to 100. The shared store loads universal factors from Supabase for the existing manual comparison and new decision snapshots. Task recommendation consumers should call `getEffectivePriorities(taskId)` to include task-specific overrides.

```tsx
import { supabase } from './src/lib/supabase';
import { useUniversalPriorities, useTaskPriorities, useRankedOptions } from './src/lib/priorities/hooks';
import { getEffectivePriorities, rankOptions, invalidatePriorities } from './src/lib/priorities';

// In screens beneath AuthProvider and Expo Router:
const universal = useUniversalPriorities(); // priorities, save(Factor[]), loading, error, refresh
const task = useTaskPriorities(taskId);     // priorities = effective Factor[], mode, save, revertToUniversal
const ranking = useRankedOptions(taskId);   // data = RankedOption[], loading, error, refresh

// From task / options integration code:
const factors = await getEffectivePriorities(taskId);
const choices = await rankOptions(taskId);
// choices: { id, name, ratings, score, rank, is_recommended, reason, trade_off }[]
// After the options team persists new candidates/ratings:
invalidatePriorities();
```

Use `<TaskPrioritiesEntry taskId={task.id} />` from `src/components/TaskPrioritiesEntry` on a task detail screen, or navigate to `/task/<id>/priorities`. New and saved tasks use the same `TaskPriorityCard`, factor picker, and 0–100 scale. **Continue to decision** opens the recommendation page without a second priority editor. Saved task sliders and factor-list edits save automatically after a short pause. Reset restores the task balance loaded when the editor opened. Back waits for pending saves; failed writes stay visible with a retry action. Saves invalidate mounted priority hooks; returning to a screen also refreshes them. External changes are read on refocus or explicit refresh (no Realtime publication is assumed).

**Task-creation integration.** A task represents the decision to make; `title` is its name and `notes` is its description. The new-task UI passes the reviewed factors to the atomic-save API. Other callers can omit custom factors to inherit universal priorities:

```ts
import { createTaskWithPriorities, getEffectivePriorities } from './src/lib/priorities';

// Omit customFactors to follow universal; provide a complete 100-point set to customize.
const taskId = await createTaskWithPriorities(taskDraft, customFactors, session.user.id);
const factors = await getEffectivePriorities(taskId);
// The decision page uses the saved details and factors for its explicit request.
```

`generateTaskDecisionPlan` in `src/lib/ai.ts` calls the research/plan endpoint. `saveDecisionPlan` and `acceptDecisionPlan` in `src/lib/decision-plans.ts` persist the draft and accept it through account-bound Supabase RPCs. The saved input key allows reopening an unchanged plan without repeating research. Acceptance uses the saved priority snapshot, keeps the originating task linked, and never replaces its description with the plan JSON.

**Calendar and post-decision tasks.** `/calendar` replaces the Decision tab; saved decision history remains at `/decisions`, accessible from Home. Ordinary `tasks` are decisions to make. Follow-ups live separately in `post_decision_tasks`, linked to a saved `decisions` row. Apply `supabase/migrations/202611190002_post_decision_tasks.sql` once to existing projects with the first three migrations; do not rerun the combined setup. This fourth migration was also applied successfully through SQL Editor to the configured project; include `202611190002` when repairing CLI history. The new table has RLS and a composite foreign key to enforce same-account decision ownership. Calendar supports month/day selection, dated follow-up creation, and completion/reopening. Home shows pending follow-ups and opens their calendar date.

The decision flow's acceptance RPC writes the decision and all `post_decision_tasks` together. Action dates use the selected local start date plus the plan's day offset. Every action keeps its full details and resource information; oversized action notes are rejected rather than truncated. The plan retains the complete recommendation, specifications, assumptions, and sources. Home and Calendar refresh after acceptance. `usePostDecisionTasks(startDate?, endDate?)` supplies account-scoped reads and completion updates. Manual follow-up creation is still supported through Calendar and `createPostDecisionTasks` in `src/lib/followups.ts`.

Priority editors show a larger centered donut with “Universal” or the decision name in its center, above the vertical sliders. Saved previews keep two columns, short horizontal segment labels, percentages, and the decision name in the middle.

**Saved task priorities.** The history button at the top right of the Priorities tab opens `/saved-priorities`. It shows two tappable task chart cards per row, including completed tasks, with search and All / Custom / Completed filters. Cards omit legends and status text, and use an unboxed “View task priorities” caption. Each whole card links to the task editor. Donut charts have no center total. It displays the latest saved effective balance, not a revision history; universal tasks follow the current universal weights. `getSavedTaskPriorities()` and `useSavedTaskPriorities()` read account-scoped, paginated collections and reuse the same merge function. No new tables or migration are needed.

**Ratings contract.** `options.ratings` is a JSON object keyed by stable factor ID, e.g. `{"cost": 90, "quality": 70}`. Every rating uses **0–100, higher is better**, including cost (affordability/value, not raw currency). Missing/non-numeric ratings count as zero and are disclosed in the trade-off; numeric ratings clamp to the range. Renaming a factor keeps its ratings; a newly added factor requires new ratings from the options team. Scores use normalized effective weights; ties break by ascending option ID. Rank uses full precision; displayed scores round to two decimals. Exactly three results are returned, or all results if there are fewer than three. Only the first is recommended. Empty options return `[]`.

`rankOptions` reads all candidate pages and **returns results without mutating options**. Teammates can present them in their choice flow or persist them if they own the relevant columns. `mergePriorities` and `scoreOptions` are pure functions in `src/lib/priorities/logic.ts`; `createPriorityService(client)` exposes a typed, injectable data layer. Save complete 100-point sets through the exported functions/RPC, not direct table writes. The RPC checks Auth/ownership, validates the total and metadata, serializes account writes, and replaces the set atomically. A failed save retains the previous set. Concurrent complete saves use last committed save wins.

**Verification.** `npm test` includes pure scoring/allocation tests, typed Supabase client tests with mocked HTTP, and a real PostgreSQL engine (PGlite) test of the migration, signup defaults, RLS, forged ownership, atomic failure rollback, and revert. PGlite supplies a small test-only stand-in for Supabase's `auth.users` and `auth.uid()`. Account tests also cover task completion, decision archive/snapshot persistence, safe repeat imports, account switching, queued writes, pagination, and failed-save recovery. No unit test uses production credentials or writes to the remote project. Also run `npm run typecheck` and `npm run build`. For device QA after setup: sign in → edit/save universal weights → reopen → create a task → customize and update ranking → remove/rename/add a factor → reset → revert to universal → switch accounts and verify isolation. The Figma Priorities frame was inspected through the browser; the UI preserves its cream/green palette and existing Claro components. The editor uses a live donut chart with percentage labels above side-by-side vertical sliders. The vertical slider layout was checked at 393 × 852 in Chrome responsive mode before restoring the compact chart. Browser slider interaction was checked to rebalance to 100 without saving changes. Live verification confirmed the signed-in web app loads the default priorities after deployment; the full device save/ranking checklist remains to be exercised. `node --env-file=.env scripts/check-supabase.mjs` checks table contracts with zero rows and never prints keys.

References: [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Connect the LLM API

**Provider selection:** task-specific and universal priority suggestions use OpenAI with `OPENAI_MODEL=gpt-4.1-mini` when `OPENAI_API_KEY` is set. Otherwise those priority routes use `GROQ_API_KEY` with `GROQ_MODEL=openai/gpt-oss-20b`. When both keys are present, OpenAI wins; provider errors do not trigger a silent fallback. The researched decision-plan route requires OpenAI. It first uses `OPENAI_RESEARCH_MODEL=gpt-4.1-mini` with the Responses API's web-search tool, then `OPENAI_MODEL` to format and validate the recommendation and schedule. These model settings are server-only.

**Supabase and AI use separate keys.** The Supabase project URL and anon/publishable key connect the app to authentication and stored data; they do not authorize model requests. Provider keys stay on the Node server. Supabase [Edge Functions can call a model provider](https://supabase.com/docs/guides/ai/examples/openai) with a server-side provider key, but this repo has not deployed an Edge Function for this flow. The connection is **Expo app → local Node API → model provider**, with tasks, priorities, recommendation drafts, and accepted plans persisted separately in Supabase.

1. Use your own OpenAI API key for the complete decision flow. A [Groq Console](https://console.groq.com/keys) key supports the priority-suggestion routes only. Keep provider keys in the ignored local environment file and out of source control.
2. Add `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4.1-mini`, and `OPENAI_RESEARCH_MODEL=gpt-4.1-mini` to your existing `.env`, using `.env.example` as a guide. If starting fresh, copy the example first. Preserve your Supabase configuration. The OpenAI project needs access to the chosen models and web search, with available usage quota. Apply the decision-plan migration before using saved recommendations and acceptance.
3. Run the server in one terminal:

   ```sh
   npm run api
   ```

4. In another terminal, run `npm start` (phone) or `npm run web` (browser).
5. Open **Tasks → Add task**, enter the decision details, and tap **Help me make a decision**. Review the priorities, then tap **Continue to decision** to request the recommendation. Review the choice and schedule, then **Add plan to calendar** to accept it.
6. For business-wide suggestions, the existing **Priorities → Help me set priorities** assistant remains available: describe the business, request a suggestion, review **Use this suggestion**, then **Update priorities**.

Provider keys exist only in the Node server. Never prefix a provider key or research-model setting with `EXPO_PUBLIC_`, or place credentials in app source. `EXPO_PUBLIC_API_URL` is just the public server address. The initial priority request sends the decision name, description, and optional deadline. Decision research additionally sends the selected factors and weights, start date, and any clarification answers. The universal-priorities assistant sends its entered business context and current factors. These routes do not send the account's task or decision history.

`POST /api/decision-priorities` accepts `{ title, description, dueDate }` (`dueDate` is an empty string when omitted in the form) and returns `{ summary, factors: [{ id, name, description, weight, reason }] }`. The server and client validate 3–6 unique criteria, bounded text, integer weights, and a total of exactly 100 before displaying them. Colors come from the app palette. The existing `POST /api/priorities` route continues to validate matching supplied factor IDs. AI summaries and reasons stay in the unsaved review state; the confirmed task and factor names, descriptions, colors, and weights are persisted through the existing Supabase contract.

`POST /api/decision-plan` accepts `{ title, description, dueDate, startDate, factors, context }`. It performs one web-research call and one structured-formatting call, returning either a ready recommendation with a 1–30-day schedule or up to three clarification questions. Links must come from retrieved sources; email and phone contacts must appear in the research or user-supplied details. The shared parser validates every plan field, source relationship, consecutive day, and action-note size. It rejects an incomplete or unsupported result rather than replacing it with a sample supplier. Customer-facing text uses Claro's voice, including “Our recommendation.”

Provider responses in existing automated tests are mocked. A real priority-suggestion request was verified during earlier work; this does not validate the new researched decision flow. **No tests, builds, typechecks, or live model requests were run for this decision-page change.** `GET /health` reports the selected priority provider/model and whether a key is configured; it does not validate the key, research access, or reveal credentials.

### On a physical phone

`localhost` on a phone means the phone, not your laptop. On trusted Wi-Fi:

```dotenv
API_HOST=0.0.0.0
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:8787
```

Restart both the API and Expo after changing `.env`. Keep the phone and laptop on the same Wi-Fi. For Android Emulator use `http://10.0.2.2:8787`; for iOS Simulator use `http://localhost:8787`. An Expo tunnel only tunnels Metro, not this separate API service.

The API defaults to loopback, accepts only configured browser origins, limits request sizes and per-IP requests, and times out provider calls. **It is a local development server, not a publicly deployable authenticated service.** Before sharing a hosted build, put the API behind real authentication and HTTPS, set a production API URL, and configure exact allowed browser origins. The app will not guess a localhost API in a production build.

### API troubleshooting

- `GET /health` reports server availability, active provider/model, and whether a key is configured, without returning the key.
- A missing key produces a setup message and leaves the new-task details unsaved for retry. Existing task editing and manual priority controls remain available.
- 401/403 from the provider: check the selected provider's key and model permissions.
- 429: provider quota or rate limit; wait and retry. No substitute AI output is generated.
- A connection error on a phone: check its API URL, Wi-Fi, and your local firewall.
- Priority suggestions have a 30-second provider timeout and 35-second app timeout. Decision research has a 65-second limit, the combined server request is bounded at 100 seconds, and the app stops waiting after 120 seconds. Cancellation preserves the task details.

## Checks

```sh
npm run typecheck
npm test
npx expo install --check
npm run build
```

The existing tests cover priority allocation, zero-weight edge cases, date validation, saved-data round trips, priority snapshots, the two priority-suggestion request/response contracts, provider selection/failures, and their HTTP endpoints. Their OpenAI and Groq calls are mocked. The new researched decision flow has not been tested in this change. `npm run build` exports iOS, Android, and web JavaScript bundles; it is not a native device build.

Manual walkthrough, when model usage is authorized: **Tasks → Add task → details → Help me make a decision → Why? → adjust sliders → Continue to decision → review choice/contact/specifications/daily actions → Add plan to calendar → confirmation banner → Tasks → reopen the saved plan**. Also check clarification questions, cancellation, retry, a changed deadline, editing details before acceptance, and duplicate acceptance. Reopening an unchanged plan and accepting it should not repeat model requests. This new-flow walkthrough remains unrun.

## Code map

```text
src/app/(tabs)/       Home, Tasks, Priorities, Calendar
src/app/decision/     Save, edit, detail, and compare flows
src/app/task/         Add/edit task flow, priorities, researched decision page
src/components/      Shared interface and priority ring
src/components/NewTaskForm.tsx Decision details, AI review, and confirmed task creation
src/lib/model.ts     Types, exact allocation, validation
src/lib/store.tsx    Account-scoped Supabase store and refresh lifecycle
src/lib/account-data.ts Typed task/decision reads and atomic writes
src/lib/account-controller.ts Serialized reads/writes and account invalidation
src/lib/ai.ts        Client for the local AI proxy
src/lib/decision-ai.ts Decision-analysis request/response validation and cancellable requests
src/lib/decision-plan.ts Shared recommendation/schedule contract and validation
src/lib/decision-plan-client.ts Cancellable decision-plan request
src/lib/decision-plan-service.ts Supabase draft persistence and atomic acceptance
src/lib/decision-plans.ts Account-scoped plan hooks and cache invalidation
src/lib/priorities/  Pure merge/scoring, typed Supabase service, hooks
src/lib/supabase.ts  Environment-based typed client
src/lib/auth.tsx     Shared Supabase Auth session
supabase/migrations/ Priorities and account data schema, RLS, seed, atomic RPCs
supabase/setup.sql  Combined one-time SQL Editor setup
server/              Priority suggestions, OpenAI web research, structured decision plans
tests/               Domain and API tests
```

## Sources

- [Figma prototype](https://www.figma.com/proto/f59g6mQpxCmEcYrHtvwsiw/Claro-Mid-fi?node-id=151-537&starting-point-node-id=151%3A537)
- [GitHub Models retirement](https://github.blog/changelog/2026-07-01-github-models-is-being-fully-retired-on-july-30-2026/)
- [Groq free-plan rate limits](https://console.groq.com/docs/rate-limits)
- [Groq structured outputs](https://console.groq.com/docs/structured-outputs)
- [Supabase Edge Functions with a model provider](https://supabase.com/docs/guides/ai/examples/openai)

---

## Move to your group's development build

**Before shared or EAS builds, the teaching team must configure your group.**
The `com.example.cs147lfinalstarter` identifiers in `app.json` are placeholders
for local native builds. The teaching team will push a commit that replaces both `ios.bundleIdentifier` and
`android.package` with your group's unique identifiers and sets the Expo owner,
EAS project ID (`extra.eas.projectId`), slug, and URL scheme. Do not register the
placeholder identifiers for your group's app.

After that configuration, one build leader installs the development client:

```sh
npx expo install expo-dev-client
```

Commit both `package.json` and `package-lock.json`. Teammates pull those changes
and run `npm ci`. Build and install the matching development app as described
below, then start its server:

```sh
npm run start:dev
```

Scan the QR code to open your installed development app. 

## For build leaders: generate builds

After the teaching team configures your EAS project and you have installed
`expo-dev-client`, sign in with **your own invited Expo account**:

```sh
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest project:info
```

Confirm that the owner and project are your assigned group. Run only the command
for the platform and kind of build you need:

```sh
# Development app for a physical device; loads code from a development server.
npx eas-cli@latest build --profile development --platform ios
npx eas-cli@latest build --profile development --platform android

# Standalone preview; bundles the current code for independent testing.
npx eas-cli@latest build --profile preview --platform ios
npx eas-cli@latest build --profile preview --platform android
```

Share the resulting installation link. Physical iOS devices must be registered
in the class Apple Developer account's provisioning profile, which the teaching team will contact you about.

**One app identity:** The profiles use the same app identifiers. Installing a
preview replaces the development app on that device. Reinstall the development
app before returning to `npm run start:dev`.

### Development builds for simulators

An iPhone build cannot run in an iOS Simulator. For a simulator development app,
use the separate profile, then install the completed simulator build:

```sh
npx eas-cli@latest build --profile development-simulator --platform ios
npx eas-cli@latest build:run --platform ios
```

Select the simulator build when prompted, then use `npm run start:dev` and press
`i`. For Android, install the development APK on your emulator and press `a`.

Alternatively, with the native development tools installed and your group's
configuration ready, build and install locally:

```sh
npx expo run:ios
npx expo run:android
```

These commands compile native apps. They differ from `npm run ios` and
`npm run android`, which open Expo Go. Rebuild your development app after adding
native libraries or changing native configuration.

## Replace the placeholder branding

Change `expo.name` in `app.json`. Replace `assets/icon.png`,
`assets/adaptive-icon.png`, and `assets/splash-icon.png` with your own PNGs. The
included images are all 1024 x 1024; the app icon is opaque and the adaptive/splash
images have transparent backgrounds. Adjust the splash plugin's background color
and image width in `app.json` as needed.

Verify the installed icon and splash screen in a **preview build**. Rebuild after
changing these native assets.

## Checks and credentials

```sh
npm run typecheck
npx expo install --check
npx expo-doctor@latest
```

Keep passwords, signing files, and server-side keys out of the repository.

## Reference

- [Expo CLI launch targets](https://docs.expo.dev/more/expo-cli/)
- [Start developing and Expo Go sign-in](https://docs.expo.dev/get-started/start-developing/)
- [SDK 58 release notes and tunnels](https://expo.dev/changelog/sdk-58)
- [Expo Router setup](https://docs.expo.dev/router/installation/)
- [Development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Build profiles](https://docs.expo.dev/build/eas-json/)
- [iOS Simulator builds](https://docs.expo.dev/build-reference/simulators/)
- [Internal distribution](https://docs.expo.dev/build/internal-distribution/)
- [Splash screen and app icon](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/)
- [Environment variables](https://docs.expo.dev/guides/environment-variables/)
