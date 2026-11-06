# Behavior and limitations

This document describes the behavior of Quiet Tabs v0.2.0.

## Recommendations mode

New installations and migrations from v0.1 start in **Recommendations** mode. It never switches to Automatic on its own. Manual close requests are allowed; automatic close operations are rejected by the extension engine.

The journal retains the latest 500 suggestions. Each entry captures the time, reason, attention statistics, visit threshold and user feedback. Repeated evaluations do not duplicate the same suggestion. A new qualified visit, changed retention settings or the end of a snooze can start a new suggestion.

**Agree & close** saves a recovery link, closes the matching current suggestion and records agreement after successful closing. Missing, outdated or protected suggestions cannot close a tab. **Needed** records feedback and protects the matching tab if it is still open. **Tomorrow** postpones it for one day. Feedback on a historical entry does not affect a different page, even if Chrome has reused the same tab ID. Agreement recorded in an earlier version never triggers closing by itself after an update.

Opening or closing a page from Suggestions, All or Journal holds the displayed cards in place, including periodic updates. Their status continues to update, and the counters reflect current browser state. New journal entries are recorded without displacing the entry being inspected. A selected or otherwise protected tab retains a disabled close button; closing becomes available only if the same suggestion is still current after switching away. A closed or navigated page leaves an inactive card instead of handing its position and actions to another tab, including after a successful manual close. Reopening the list, searching, sorting, saving settings or successfully keeping or snoozing a tab refreshes its membership and order.

Feedback is intended for manual evaluation and tuning. The algorithm does not learn from it. Journal counters cover the entries still retained; unrated suggestions are not evidence that the rules are accurate.

## Attention tracking

Time is counted for the selected tab in the focused Chrome window while the computer has not been idle for more than one minute. The default continuous-visit threshold is 15 seconds, configurable from 5 to 120 seconds.

Short visits contribute to total visible time but not qualified attention. They do not update the last-qualified-visit time. Once a visit reaches the threshold, its entire duration counts, including the initial seconds, without double counting.

Normal Chrome service worker suspension preserves continuity through persisted intermediate state. Switching tabs or windows, computer sleep, clock rollback and long sampling gaps break a visit. Time spent in a long sampling gap is not credited.

The extension observes browser state, not human attention. Reading without input may be undercounted. Interacting with the side panel or other controls in the same Chrome window may count as time on the selected page.

## Retention and navigation

Default retention is 24, 48 and 120 hours for pages with less than one minute, one to under ten minutes, and at least ten minutes of qualified attention, respectively. Existing installations keep their saved retention settings when updated.

Time is measured from the last qualified visit. If there has not been one, it is measured from the first observation of that page. Retention settings range from 1 to 2160 hours and must be in ascending order.

Navigating to a different exact URL starts a new record. This includes query parameters and URL fragments. Sites that frequently change their address without a page reload may split attention across several records.

## Protection

Suggestions exclude selected tabs in every window, pinned tabs, audible tabs, loading pages, split-view tabs and tabs for which Chrome has disabled automatic discarding. Protection also covers Keep, Needed feedback, snoozing, excluded domains and a one-hour grace period after session restoration.

Domain exclusions include subdomains: `example.com` protects `docs.example.com`, but not `notexample.com`. Protection for an individual tab applies to its current page. Use a domain exclusion for ongoing site protection.

Chrome internal pages, local files and incognito tabs are not tracked.

## Closing modes

There are two modes: **Recommendations** and **Automatic**. Manual closing is available in both. **Automatic** mode requires an explicit selection and acknowledgment of the archive limitation. It starts closing no earlier than one hour after being enabled, with a limit of five tabs per 15 minutes.

The link is persisted **before** the close command. Protection is checked again after saving. If saving fails or the archive is full, the tab stays open. A failure between saving and closing leaves an archive entry marked as not confirmed closed.

Chrome does not provide an atomic operation to check tab state and close it. A short interval remains between the last check and the close command. Pin important forms, editors and meeting tabs, or exclude their domains in advance.

## Archive

Only tabs closed through Quiet Tabs are archived. Tabs closed directly through Chrome are not added.

New archive entries also save the qualified attention measured before closing. Older entries without this measurement remain readable and restorable, and appear last when sorting in either direction.

The archive stores URLs and titles, not page state. Forms, drafts, navigation history and scroll position cannot be restored. Restoring a link opens it in the background and protects the new tab for one day.

The archive holds 500 links and does not automatically evict older entries. When full, further closing stops. Entries can be deleted manually.

## Restart and migration

Statistics for restored tabs are matched by exact URL during the first five minutes of a new session. Matched tabs receive one hour of protection. Multiple tabs with identical URLs may exchange statistics between instances; tabs restored later are treated as new.

Migration from v0.1 preserves the archive and protection, but enables Recommendations mode. Earlier accumulated time remains visible time only: v0.1 did not distinguish short scans from meaningful visits.

Saved v0.2 Trial and Suggest settings both load as Recommendations, preserving the journal, archive, attention, protection, language and retention periods. An existing Automatic selection and its timers are preserved. Migration never closes tabs by itself or applies old agreement ratings as new close requests.

## Local data

The interface supports English and Russian through the EN / RU control. Language is stored locally and defaults to English on a new installation. Changing it does not alter the operating mode, retention rules, current visit or suggestion history. Browser-provided diagnostic messages may remain in their original language.

Tab URLs, titles, statistics, settings, the journal and the archive are stored in the local Chrome profile. The extension makes no network requests, uses no analytics, loads no external fonts or favicons, and does not read page contents.

Data persists between browser sessions and is deleted when the extension is removed. Copying the source folder or installation ZIP does not transfer browsing data to another computer. Synchronization and export are not implemented.

The Qualified button sorts every panel list by qualified attention, ascending by default, and toggles between ascending and descending order. The choice is saved locally. Journal entries use the measurement at suggestion time; archive entries use the measurement at archive time. Equal values retain their existing order. Sorting affects presentation only, not retention, protection or the order of automatic closing.

[Project overview](../README.md) · [Installation](../INSTALL.md)
