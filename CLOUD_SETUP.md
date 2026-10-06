# Connect Google Cloud saving

Firebase Authentication provides Google sign-in and Cloud Firestore stores the shared card review. The site is deployed at [Journeys Builds](https://journeys-card-review-e1771.web.app) in project `journeys-card-review-e1771`. Its default database uses Standard edition and Native mode in **São Paulo (`southamerica-east1`)**. Google sign-in, Firestore rules, and indexes are deployed. The verified Google account `tharakzn@gmail.com` is already linked and enabled as an editor.

1. Open the deployed site and sign in with Google. Any Google account can create and save builds or create a copy of another build. Only the creator can edit/delete the original. Public visitors can read builds. The star buttons save personal favorites; order the list by Favorites, Hero, or Role. The **+** button opens a new build.
2. If browser-saved builds exist at this website address, a **Transfer browser-saved builds** button appears after sign-in. It uploads them as builds owned by that account. Browser originals remain untouched, and retries do not duplicate builds. Browser storage is separate for each website address. For existing card review edits, open **Edit cards** in the original browser and address after publishing the updated app there, sign in as an approved editor, and use **Upload browser edits**. Import/export controls are hidden from normal navigation; legacy JSON utilities remain for recovery.
3. To approve another editor, have them sign in, then find their UID in **Authentication → Users** in the [Firebase console](https://console.firebase.google.com/project/journeys-card-review-e1771/overview). In Firestore, create `editors/{uid}` with Boolean field `enabled: true`. Have them sign out and back in to refresh access. Signed-out visitors can read the shared card catalog but cannot write to it.
4. For later deployments, run these commands from this directory:

   ```sh
   npm ci
   npm test
   npm run test:rules
   firebase deploy --only hosting,firestore --project journeys-card-review-e1771
   ```

   This deployment replaces the project's Firestore rules. The included rules allow public card/build reads, restrict card writes to approved editors, restrict build edits/deletion to the creator, keep favorites private to each account, and deny client writes to the editor list. Rules tests require Java 21 and Firebase CLI. If the project has other Firestore collections, merge their rules before deployment.

The Hosting deployment runs `npm run build` automatically to bundle the Firebase SDK. Firebase CLI login is already configured on this machine. On another machine, install `firebase-tools` and run `firebase login` first. The GitHub Pages workflow also builds and publishes `dist/`. Authorized sign-in domains include the Firebase Hosting addresses, `tharak.github.io`, `localhost`, and `127.0.0.1`; add custom domains in Authentication settings when needed. The Firebase web configuration in `dist/cloud-config.json` is public configuration. Administrator credentials stay outside the website.

The upload preserves a browser backup at `journeys-cloud-browser-backup-journeys-card-review-e1771-v1` until upload succeeds. Pending changes are stored at `journeys-cloud-pending-journeys-card-review-e1771-v1`, survive reloads, and can be retried with **Retry cloud save**. Failed writes never show as successful cloud saves.

Each document at `cardReviews/{cardId}` contains only reviewed fields: `categories`, `subcategories`, `orders`, `cardTexts`, `titles`, and `deleted`. A null field resets the corresponding value to the published catalog, except `orders`: `orders: null` means explicitly unassigned and `orders: "published"` restores the published Order. Images, source metadata, and unedited card records remain in `dist/`. Different fields and cards merge independently; concurrent writes to the same field use the last successful write. Saved builds live at `builds/{buildId}`. Their owner ID/name, creation timestamp, and source-build ID cannot change. Saves use server timestamps and increment a revision; stale drafts must be reloaded or copied. Personal favorites live at `users/{uid}/favorites/{buildId}` and contain only a creation timestamp. Local drafts are keyed by account and build, and transfers record a per-account ledger. No account emails or administrator credentials are stored in public builds.

Verify the connection with two browsers: update a card's Order in an approved editor session, wait for the connected status, then check that the same Order appears in the other browser and the dedicated build creator. Check that signed-out visitors cannot edit cards or save builds, and that another signed-in user can copy a build but cannot edit/delete its original. Disconnect the editor browser, make another edit, reconnect, and check that pending edits save. Legacy JSON compatibility remains available for administrative recovery.

Implementation tests cover review compatibility, migration, reset values, concurrent edits, failed writes, retry, optimistic snapshots, highlighted-item summaries, personal favorites, and list ordering. The Firestore emulator tests exercise public reading, owner-only writes/deletion, independent copying, immutable ownership, schema validation, stale saves, private favorites, and protection against editor self-escalation. Run `npm test` and `npm run test:rules`. Browser verification uses an isolated emulator configuration; test accounts and test data do not enter the live project.

The rules are a tested prototype and should be reviewed before broad sharing.

References: [Firebase web setup](https://firebase.google.com/docs/web/alt-setup), [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin), [Firestore rules](https://firebase.google.com/docs/firestore/security/get-started), and [Firestore live updates](https://firebase.google.com/docs/firestore/query-data/listen).
