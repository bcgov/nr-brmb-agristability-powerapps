# BC Permanent Pacific Time (PCT, UTC-7): Impact Report for nr-brmb-agristability-powerapps

| | |
|---|---|
| **Prepared** | 2026-10-07 |
| **Repo state** | public GitHub `dhlevi/nr-brmb-agristability-powerapps`, branch `main` @ `612da67` (2026-09-25, "Merge pull request #122 from bcgov/melinda-dev"). This commit is identical to `main` in the upstream `bcgov/nr-brmb-agristability-powerapps` repository. |
| **Components** | Two Power Apps code apps (React 19, TypeScript 5.9, Vite, `@microsoft/power-apps` SDK) on Dataverse: **enrollment app** (enrolment worklists, 45-day letter counter, notices, supervisor approval) and **benefit app** (shell only, 20 source files). The enrollment app calls five Power Automate flows (`Generate45DayLetter`, `GenerateBulkEnrolmentNotices`, `BulkUpdateEnrolmentRecords`, `ProcessEnrolmentAction`, `SendEmailwithTemplate`) and the FARMS API. No date libraries (`moment`, `date-fns` and similar); all date handling uses the browser `Date` and `Intl` APIs. |
| **Deadline** | **Sunday 2026-11-01, 02:00 local (09:00 UTC)**, about 3.5 weeks away |
| **Bottom line** | **Low risk in this code; the platform risk sits in Dataverse and Power Automate.** The browser code follows the user's own browser time zone, which current browsers update automatically. The one hard-coded offset, `Date.now() - 7 * 60 * 60 * 1000` in the 45-day counter (A2), was correct only in summer under the old rules and **becomes correct all year** after the change; it must not be changed to 8 hours. Several defaults take today's date in UTC rather than BC time, so after 17:00 local they show tomorrow (D1 to D3); this is pre-existing and does not get worse. **The item to confirm is outside the repository:** Dataverse user time zone settings and the Power Automate flows use Microsoft's Windows time zone definitions, and BC users are normally set to "Pacific Time (US & Canada)", which keeps changing clocks in the United States (A1). |

---

## 1. What changed (same basis as the earlier reports)

- **Government rule.** BC stopped changing clocks after 2026-03-08. On **2026-11-01 clocks do not fall back.** BC stays at **UTC-7** all year, named *Pacific time (PCT)*.
- **IANA tzdata 2026b** models `America/Vancouver` as permanent UTC-7 from 2026-11-01 02:00. Browsers (Chrome, Edge, Firefox, Safari) ship their own copy of this data and update it automatically.
- **Microsoft platforms (Windows, Dataverse, Power Automate) use Windows time zone IDs**, not IANA data. "Pacific Standard Time", shown as "(GMT-08:00) Pacific Time (US & Canada)", follows the United States rule and will still fall back on 2026-11-01. Whether Microsoft has published a separate zone for BC, and when it reaches Dataverse, could not be confirmed during this review (web search was not available in this session) and must be checked with Microsoft or the platform team.

---

## 2. Summary of findings

| # | Area | Severity | Fails on Nov 1? | Fix |
|---|---|---|---|---|
| A1 | Dataverse user time zone settings and Power Automate flows use Windows zones; BC users set to "Pacific Time (US & Canada)" | **Medium (to confirm)** | **Possibly**: "User Local" date and time values shown or computed one hour off in model-driven views, flows and server-side logic; date-only results can shift a day near midnight | R1, R2 |
| A2 | Hard-coded 7-hour offset in the 45-day counter (`renderCell.tsx` line 77, `SupervisorApprovalPage.tsx` line 1279) | Low | **No; becomes correct all year.** Under the old rules the count rolled over at 23:00 in winter | R3 |
| A3 | 45-day start date written as browser local midnight (`EnrolmentDetailsPage.tsx` lines 424-426) | Low | No; writes `07:00Z` all year instead of alternating `07:00Z` / `08:00Z` | R3 |
| A4 | Display with `toLocaleDateString` / `toLocaleString` (`createdon`, `changedDate`, pause and start dates) | Low | Only for users whose browser or operating system has outdated time zone data | R4 |
| A5 | Benefit app | None | No; only cache expiry with `Date.now()` | n/a |
| D1 | "Today" defaults computed as the UTC date (`new Date().toISOString().slice(0, 10)`) in `BulkNoticesModal.tsx` line 17 and `Send45DayLetterModal.tsx` line 18 (pre-existing) | **Medium** | Not caused by the change: from 17:00 local the default sent date is tomorrow (the window moves from 16:00 in winter to 17:00 all year) | R5 |
| D2 | `toDateInputValue` / `formatDateOnlyForDisplay` take the UTC date part of full timestamps such as `modifiedon` and `workedOnRaw` (pre-existing) | Low | Not caused by the change: records changed after 17:00 local show the next day's date | R5 |
| D3 | `getDaysUntilDate` uses today's UTC date (pre-existing) | Low | Not caused by the change: from 17:00 local the count is one day short | R5 |
| D4 | 45-day counter computed two different ways (list and supervisor pages subtract 7 hours; details and calculation pages do not) (pre-existing) | Low | Not caused by the change: pages can show different day counts for part of each day | R3 |

---

## 3. Overview

Both apps run in the Power Apps host inside the user's browser and read and write Dataverse through the `@microsoft/power-apps` SDK. Dataverse returns date and time columns as ISO-8601 strings: "User Local" and "Time Zone Independent" columns as full timestamps, and "Date Only" columns as `YYYY-MM-DD`. The schemas in `.power/schemas/dataverse` record the columns as `DateTimeType` but not their behaviour, so the behaviour of each column (for example `vsi_fortyfivedayletterstartdate`) must be confirmed in the Dataverse solution.

The code itself contains no fixed `PDT` or `PST` labels and no `America/Vancouver` references. Its only explicit offset is the 7-hour adjustment in A2.

---

## 4. Areas of Concern

### A1. Dataverse and Power Automate time zones: MEDIUM (to confirm)

This repository does not contain the Dataverse solution or the flow definitions, but the apps depend on both:

- **Dataverse personal settings.** Each user has a time zone setting (Settings, Personalization, Time Zone). BC users are normally set to "(GMT-08:00) Pacific Time (US & Canada)". Model-driven forms and views, Excel exports, rollup and calculated columns, business rules and classic workflows convert "User Local" columns with that setting. If it keeps the United States rule, every "User Local" value displays one hour early from 2026-11-01, and logic that derives a date from a timestamp can shift a day for times between 23:00 and midnight.
- **Power Automate flows.** The five flows listed above run in the cloud. Expressions such as `convertTimeZone(..., 'Pacific Standard Time')`, `formatDateTime` with a time zone, `utcNow()` with an offset, or recurrence triggers set to Pacific time all use Windows zone definitions. The 45-day letter, bulk notices and email templates may print dates computed this way.
- **This app's own screens are not affected**, because they use the browser's time zone (A4), so the code app and a model-driven view of the same record could disagree by one hour.

### A2. Hard-coded 7-hour offset in the 45-day counter: LOW

```ts
const referenceDate = paused && pauseDate ? new Date(pauseDate).getTime() : Date.now() - 7 * 60 * 60 * 1000;
const days = startDate ? Math.floor((referenceDate - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) : null;
```

(`components/renderCell.tsx` lines 77-78; `pages/SupervisorApprovalPage.tsx` lines 1279-1280.)

If `vsi_fortyfivedayletterstartdate` is read back as a date at UTC midnight (a "Date Only" column), subtracting 7 hours makes the count roll over at local midnight in UTC-7. Under the old rules this was right only in summer; in winter (UTC-8) the count rolled over at 23:00. From 2026-11-01 BC is UTC-7 all year, so the constant becomes correct all year. **Do not change it to 8.**

If the column is "User Local" instead, the start value is a full timestamp at local midnight (`07:00Z`, see A3), and subtracting 7 hours makes the count roll over at 07:00 local. The right formula therefore depends on the column behaviour; see D4 and R3.

### A3. Start date written as browser local midnight: LOW

`pages/EnrolmentDetailsPage.tsx` lines 424-426 set the start date to `today.setHours(0, 0, 0, 0)` and send `today.toISOString()`. In BC this sends `07:00Z` (PDT) or `08:00Z` (PST) under the old rules, and `07:00Z` all year after the change. A "Date Only" column keeps the correct date in either case. `EnrolmentCalculationPage.tsx` line 1230 (resume) sends `Date.now()` minus whole days, which keeps the current time of day.

### A4. Browser-local display: LOW

`toLocaleDateString` and `toLocaleString` (for example `EnrolmentDetailsPage.tsx` lines 1732, 2101, 2160 and 2308) format in the browser's time zone using the browser's own data. Browsers update their time zone data with their regular releases, so only users on unsupported browsers or devices with outdated time zone data would see times one hour off.

### A5. Benefit app: none

`benefit app/src/app/useCurrentUser.ts` lines 55, 97 and 104 use `Date.now()` only for a cache time-to-live.

---

## 5. Areas of Failure

No failure was found in this code on 2026-11-01. The one possible failure is on the platform side:

- **F1 (from A1):** If Dataverse users or flows use "Pacific Time (US & Canada)" after 2026-11-01, "User Local" dates and times shown in model-driven apps, exports, generated letters and emails will be one hour early, and dates derived from timestamps near midnight may be one day early.

---

## 6. Pre-existing Defects Found (independent of this change)

- **D1.** `components/BulkNoticesModal.tsx` line 17 and `components/Send45DayLetterModal.tsx` line 18 default "today" to `new Date().toISOString().slice(0, 10)`, which is the **UTC** date. From 17:00 local (16:00 in winter under the old rules), the default sent date is tomorrow, and the letters or notices generated by the flows may carry that date unless the user corrects it. The month-end default on `BulkNoticesModal.tsx` line 20 happens to produce the right date in BC because local midnight is still the same day in UTC.
- **D2.** `utils/date.ts` lines 1-11, `toDateInputValue`, takes the first 10 characters of any ISO string. For a full UTC timestamp such as `modifiedon` (`renderCell.tsx` line 187) or `workedOnRaw` (`SupervisorApprovalPage.tsx` lines 172 and 674), this is the UTC date, so a record changed at 18:00 local displays the next day.
- **D3.** `utils/date.ts` lines 42-52, `getDaysUntilDate`, compares the target date with today's UTC date, so from 17:00 local the remaining days are one short.
- **D4.** The 45-day counter subtracts 7 hours on the worklist and supervisor pages (A2) but not on `EnrolmentDetailsPage.tsx` lines 1721-1723 or `EnrolmentCalculationPage.tsx` lines 1460-1462. For a "Date Only" start date, the details and calculation pages roll over at 17:00 local while the lists roll over at midnight, so the same enrolment can show two different counts between 17:00 and midnight.

---

## 7. Potential Resolutions

| # | Action | Owner | Priority |
|---|--------|-------|----------|
| R1 | Confirm with Microsoft or the Power Platform team which Windows time zone BC users and flows should use after 2026-11-01, and when that definition reaches the Dataverse environments. Update each user's Dataverse time zone setting (and the organization default) once a BC zone is available. | Platform | Before 2026-11-01 |
| R2 | Review the five flows for `convertTimeZone`, `formatDateTime`, `addHours` with fixed offsets and recurrence time zones, and change any that use "Pacific Standard Time" for BC users. | Development | Before 2026-11-01 |
| R3 | Confirm the behaviour of `vsi_fortyfivedayletterstartdate` and `vsi_fortyfivedaypausedate` ("Date Only" or "User Local"), then compute the 45-day count in one shared helper that compares BC calendar dates (for example with `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' })`) instead of a fixed offset. Until then, keep the 7-hour constant (A2). | Development | Optional; recommended |
| R4 | Ask users to keep browsers current; no code change. | Support | Routine |
| R5 | Replace UTC "today" calculations (D1 to D3) with the BC calendar date, for example `new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' }).format(new Date())`, and format full timestamps through `Date` rather than by slicing the string. | Development | Independent |

---

## 8. Verification Checklist

1. In each Dataverse environment, confirm the time zone setting of BC users and the organization default after Microsoft's update.
2. On or after 2026-11-01, compare a record's `modifiedon` in the enrollment app and in a model-driven view; the times should match.
3. Open the Bulk Notices and 45-day letter dialogs after 17:00 local and confirm that the default date is today (after R5).
4. Confirm that the 45-day count on the worklist, supervisor, details and calculation pages matches for the same enrolment at 18:00 local (after R3).

---

## 9. Cross-References

- **nr-brmb-common** and **nr-brmb-pit-claim** reports: Java services in the same BRMB suite. The FARMS API that this app calls is not in this repository and needs its own review.
