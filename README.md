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
- **Tasks:** decisions to make, with a name, description, optional deadline, and universal or custom priorities. Follow-up to-dos are a separate teammate-owned flow.
- **Setting Priorities:** account-wide and per-task weights; shared sliders rebalance to exactly 100 points; add, rename, describe, or remove factors (2–8); reset to recommended, save/discard, or revert a task to universal. Ranked candidate choices include a recommendation, reason, and main trade-off.
- **AI priorities:** describe your business, request suggested weights and explanations, review, apply to the draft, then explicitly save. Closing the assistant discards its pending response. Failures never silently replace your choices with invented AI output.
- **Decisions:** create, search, filter, view, edit, archive/restore, and set review dates. Each decision preserves its original priority snapshot.
- **Comparison:** score two options against saved priorities, see weighted scores, then carry your chosen option and reasoning into the decision form. This is a manual scoring tool, not an LLM recommendation.

Supabase is the source of truth for tasks (including completion and due dates), saved decisions (including review dates and original priority snapshots), options, and universal/task priorities. Only the Auth session and an optional legacy-import marker remain in local storage; unsaved form drafts are temporary. New tasks and any custom priorities are saved atomically before opening their priorities and suggested-choices screen. Account data refreshes on navigation, app foreground/browser focus, priority saves, and explicit refresh. Writes require a connection and report failures; there is no silent offline save. Review dates appear in Home; push notifications are not scheduled.

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

   The first migration creates priority tables and minimal task/option contracts, enables RLS, installs atomic priority saves, and seeds 30 Cost / 30 Quality / 10 Delivery / 20 Reliability / 10 Sustainability for new users and existing accounts with no priorities. The second adds task notes/dates/completion, the complete decisions table, snapshot validation, and an atomic account-bound save/import RPC. The third (`202611190001_task_priority_defaults.sql`) copies universal priorities on every task insert and adds atomic task creation with optional overrides. Existing projects with the first two migrations need only the third. All tables enforce account/owned-task isolation. All three migrations were applied successfully through SQL Editor to project `hexdjlxqcrodaugntwlw`. The live API recognizes the tables, and the signed-in web app loads the seeded universal priorities. Do not rerun the one-time setup on this project. The public app key cannot apply SQL migrations. SQL Editor setup does not record CLI migration history: if switching to CLI deployment afterward, use `supabase migration repair --status applied 202611180001 202611180002 202611190001` after linking the project.

3. Enable email/password Auth in Supabase and restart Expo. **The app opens at login before any tab, task, or decision can be accessed**, including through a deep link. Sign in or create an account, and confirm email if required. Session restoration persists across launches. Home’s Account icon opens refresh, sign-out, and optional import. Signing out removes protected route history and account state. No anonymous account or local-data fallback is created.

**Account data and existing records.** The repo originally stored tasks and decisions under `@claro/data/v1`. After signing in, **Home → Account → Import into this account** can copy those older tasks and decisions to Supabase. It previews counts, preserves existing cloud records and decision snapshots, leaves the original device copy untouched, and records a local completion marker. It does not overwrite universal priorities or silently attach device data to whichever user happens to sign in first. All new saves use Supabase directly.

**Contracts and scope.** Tables use text task/decision/option IDs to support the existing `uid()` format and UUID strings. `tasks` now contains `id, user_id, title, notes, due_date, done`; `decisions` stores the complete existing decision model, using snake_case database dates/timestamps. `options(id, task_id, name, ratings jsonb)` remains the candidate-generation team's contract. The existing task creation/edit/completion and decision save/edit/archive screens now call the account-backed store. LLM option generation and automatic decision confirmation are not added. The app's manual comparison reads cloud universal priorities and stores its result through the cloud decision form.

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

Use `<TaskPrioritiesEntry taskId={task.id} />` from `src/components/TaskPrioritiesEntry` on a task detail screen, or navigate to `/task/<id>/priorities`. The entry is already added to the existing task edit/detail screen. The add-task form also has a priorities sheet using the same compact editor. It starts from a copy of the universal weights and can save custom factors with the new task. New tasks open their priorities/choices page immediately after the cloud save. The task page displays the saved universal/custom mode and an **Update ranking** action. Saves invalidate all mounted priority/ranking hooks; returning to a screen also refreshes them. External changes on another device are read on refocus or explicit refresh (no Realtime publication is assumed).

**Task-creation integration.** A task represents the decision to make; `title` is its name and `notes` is its description. Use the exported API before starting the teammate-owned LLM job:

```ts
import { createTaskWithPriorities, getEffectivePriorities, rankOptions, invalidatePriorities } from './src/lib/priorities';

// Omit customFactors to follow universal; provide a complete 100-point set to customize.
const taskId = await createTaskWithPriorities(taskDraft, customFactors, session.user.id);
const factors = await getEffectivePriorities(taskId);
// Now your generator can use taskDraft.title, taskDraft.notes and factors,
// then insert candidates into options with this task_id and ratings keyed by factor ID.
invalidatePriorities(); // Call AFTER those candidate inserts finish.
const suggested = await rankOptions(taskId); // Up to 3; first is Recommended.
```

The generator and choice confirmation remain teammate-owned. They are not automatically invoked by the priorities feature. The confirmation flow should use the selected option and `getEffectivePriorities(taskId)` for its decision snapshot, and retain the originating task ID in its own contract.

**Calendar and post-decision tasks.** `/calendar` replaces the Decision tab; saved decision history remains at `/decisions`, accessible from Home. Ordinary `tasks` are decisions to make. Follow-ups live separately in `post_decision_tasks`, linked to a saved `decisions` row. Apply `supabase/migrations/202611190002_post_decision_tasks.sql` once to existing projects with the first three migrations; do not rerun the combined setup. This fourth migration was also applied successfully through SQL Editor to the configured project; include `202611190002` when repairing CLI history. The new table has RLS and a composite foreign key to enforce same-account decision ownership. Calendar supports month/day selection, dated follow-up creation, and completion/reopening. Home shows pending follow-ups and opens their calendar date.

After saving the confirmed decision, teammates can call `createPostDecisionTasks(savedDecisionId, [{ title: 'Contact the supplier', dueDate: '2026-12-01', notes: 'Confirm the delivery window' }], session.user.id)` from `src/lib/followups.ts`. This inserts a batch atomically and refreshes Home/Calendar. `usePostDecisionTasks(startDate?, endDate?)` supplies account-scoped reads, refresh, create, and completion updates. LLM next-step generation and automatic invocation from confirmation are still integration work; the Calendar also supports manual follow-ups.

Priority editors show a larger centered donut with “Universal” or the decision name in its center, above the vertical sliders. Saved previews keep two columns, short horizontal segment labels, percentages, and the decision name in the middle.

**Saved task priorities.** The history button at the top right of the Priorities tab opens `/saved-priorities`. It shows two tappable task chart cards per row, including completed tasks, with search and All / Custom / Completed filters. Cards omit legends and status text, and use an unboxed “View task priorities” caption. Each whole card links to the task editor. Donut charts have no center total. It displays the latest saved effective balance, not a revision history; universal tasks follow the current universal weights. `getSavedTaskPriorities()` and `useSavedTaskPriorities()` read account-scoped, paginated collections and reuse the same merge function. No new tables or migration are needed.

**Ratings contract.** `options.ratings` is a JSON object keyed by stable factor ID, e.g. `{"cost": 90, "quality": 70}`. Every rating uses **0–100, higher is better**, including cost (affordability/value, not raw currency). Missing/non-numeric ratings count as zero and are disclosed in the trade-off; numeric ratings clamp to the range. Renaming a factor keeps its ratings; a newly added factor requires new ratings from the options team. Scores use normalized effective weights; ties break by ascending option ID. Rank uses full precision; displayed scores round to two decimals. Exactly three results are returned, or all results if there are fewer than three. Only the first is recommended. Empty options return `[]`.

`rankOptions` reads all candidate pages and **returns results without mutating options**. Teammates can present them in their choice flow or persist them if they own the relevant columns. `mergePriorities` and `scoreOptions` are pure functions in `src/lib/priorities/logic.ts`; `createPriorityService(client)` exposes a typed, injectable data layer. Save complete 100-point sets through the exported functions/RPC, not direct table writes. The RPC checks Auth/ownership, validates the total and metadata, serializes account writes, and replaces the set atomically. A failed save retains the previous set. Concurrent complete saves use last committed save wins.

**Verification.** `npm test` includes pure scoring/allocation tests, typed Supabase client tests with mocked HTTP, and a real PostgreSQL engine (PGlite) test of the migration, signup defaults, RLS, forged ownership, atomic failure rollback, and revert. PGlite supplies a small test-only stand-in for Supabase's `auth.users` and `auth.uid()`. Account tests also cover task completion, decision archive/snapshot persistence, safe repeat imports, account switching, queued writes, pagination, and failed-save recovery. No unit test uses production credentials or writes to the remote project. Also run `npm run typecheck` and `npm run build`. For device QA after setup: sign in → edit/save universal weights → reopen → create a task → customize and update ranking → remove/rename/add a factor → reset → revert to universal → switch accounts and verify isolation. The Figma Priorities frame was inspected through the browser; the UI preserves its cream/green palette and existing Claro components. The editor uses a live donut chart with percentage labels above side-by-side vertical sliders. The vertical slider layout was checked at 393 × 852 in Chrome responsive mode before restoring the compact chart. Browser slider interaction was checked to rebalance to 100 without saving changes. Live verification confirmed the signed-in web app loads the default priorities after deployment; the full device save/ranking checklist remains to be exercised. `node --env-file=.env scripts/check-supabase.mjs` checks table contracts with zero rows and never prints keys.

References: [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Connect the free LLM API

**Provider: Groq, model: `openai/gpt-oss-20b`.** Groq currently offers a rate-limited free plan. Stay on that plan for this prototype; availability and quotas are controlled by Groq. GitHub Models was retired on July 30, 2026, so this app does not use the old GitHub inference endpoint.

1. Create your own key at [Groq Console](https://console.groq.com/keys). Do not paste it into chat or commit it.
2. Copy `.env.example` to `.env` and fill in `GROQ_API_KEY`.
3. Run the server in one terminal:

   ```sh
   npm run api
   ```

4. In another terminal, run `npm start` (phone) or `npm run web` (browser).
5. Open **Priorities → Help me set priorities**, describe the business, and request a suggestion. Review **Use this suggestion**, then **Update priorities**.

The key exists only in the Node server. Never name it `EXPO_PUBLIC_GROQ_API_KEY` or place it in app source. `EXPO_PUBLIC_API_URL` is just the public server address. Only the text entered into the assistant and current factors are sent to Groq; stored decisions and tasks are not sent. Provider responses are checked for matching factor IDs, valid weights, reasons, and a total of exactly 100 before the app displays them.

### On a physical phone

`localhost` on a phone means the phone, not your laptop. On trusted Wi-Fi:

```dotenv
API_HOST=0.0.0.0
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:8787
```

Restart both the API and Expo after changing `.env`. Keep the phone and laptop on the same Wi-Fi. For Android Emulator use `http://10.0.2.2:8787`; for iOS Simulator use `http://localhost:8787`. An Expo tunnel only tunnels Metro, not this separate API service.

The API defaults to loopback, accepts only configured browser origins, limits request sizes and per-IP requests, and times out provider calls. **It is a local development server, not a publicly deployable authenticated service.** Before sharing a hosted build, put the API behind real authentication and HTTPS, set a production API URL, and configure exact allowed browser origins. The app will not guess a localhost API in a production build.

### API troubleshooting

- `GET /health` reports server availability and whether a key is configured, without returning the key.
- A missing key produces a setup message; manual functionality still works.
- 401/403 from Groq: check the key and model permissions.
- 429: free quota/rate limit; wait and retry or edit manually.
- A connection error on a phone: check its API URL, Wi-Fi, and your local firewall.
- 30-second provider timeout and 35-second app timeout prevent a stuck spinner.

## Checks

```sh
npm run typecheck
npm test
npx expo install --check
npm run build
```

`npm test` covers exact priority allocation, zero-weight edge cases, date validation, saved-data validation/round trips, priority snapshots, request/response validation, provider failures, and the HTTP endpoint. Provider calls in tests are mocked; an actual Groq request requires your key. `npm run build` exports iOS, Android, and web JavaScript bundles; it is not a native device build.

Manual walkthrough: save a decision with a review date → reopen it → edit it → archive and restore it → change and save priorities → restart the app → check that the decision's original priorities remain unchanged. Then create/complete a task, edit factors, and try the AI assistant with and without a configured key.

## Code map

```text
src/app/(tabs)/       Home, Tasks, Priorities, Decisions
src/app/decision/     Save, edit, detail, and compare flows
src/app/task/         Add/edit task flow
src/components/      Shared interface and priority ring
src/lib/model.ts     Types, exact allocation, validation
src/lib/store.tsx    Account-scoped Supabase store and refresh lifecycle
src/lib/account-data.ts Typed task/decision reads and atomic writes
src/lib/account-controller.ts Serialized reads/writes and account invalidation
src/lib/ai.ts        Client for the local AI proxy
src/lib/priorities/  Pure merge/scoring, typed Supabase service, hooks
src/lib/supabase.ts  Environment-based typed client
src/lib/auth.tsx     Shared Supabase Auth session
supabase/migrations/ Priorities and account data schema, RLS, seed, atomic RPCs
supabase/setup.sql  Combined one-time SQL Editor setup
server/              Groq proxy (no third-party server dependencies)
tests/               Domain and API tests
```

## Sources

- [Figma prototype](https://www.figma.com/proto/f59g6mQpxCmEcYrHtvwsiw/Claro-Mid-fi?node-id=151-537&starting-point-node-id=151%3A537)
- [GitHub Models retirement](https://github.blog/changelog/2026-07-01-github-models-is-being-fully-retired-on-july-30-2026/)
- [Groq free-plan rate limits](https://console.groq.com/docs/rate-limits)
- [Groq structured outputs](https://console.groq.com/docs/structured-outputs)

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
