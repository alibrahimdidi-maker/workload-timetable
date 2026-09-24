Presidential Executive Workload & Timetable Portal
====================================================

FOLDER LAYOUT
  index.html        - the page shell (HTML + styles)
  js/app.js          - all of the application logic (was inline before, now its own file)
  firestore.rules    - recommended Firestore Security Rules for this project (see below)

Keep these together in the same relative layout when you host/upload them -
index.html loads the script via a relative path (js/app.js).

WHY THE SPLIT HELPS, AND WHY IT ISN'T WHAT FIXED THE SLOWNESS
Separating the script into its own file is good practice - the browser can
cache it independently between visits, and it's easier to find your way
around. But splitting files does NOT by itself make a page respond faster
while you're using it - that only comes from fixing what the code actually
does on each interaction. Two rounds of real fixes so far:
1. The Assignment Matrix table was building a full searchable lecturer
   list (name/ID/phone/faculty/type for every lecturer) for EVERY module
   row - with a few hundred of each, that's tens of thousands of dropdown
   options sitting in the page at once. Each row now shows a plain
   lecturer name, and only builds the full searchable list for the one
   row you actually click into. Workload analytics (which recalculates
   after every single assignment) had the same kind of problem and got
   the same kind of fix. Tested with 500 lecturers x 200 modules
   (matching the app's own sample-data generator), the Matrix tab went
   from about 5.4 seconds to about 0.2 seconds to render.
2. On login (and after any bulk change), the app was rendering all 12
   tabs' content - timetables, exam tracking, requests, reports, and so
   on - even though only one tab is visible at a time and the other 11
   are sitting hidden. Now only the tab you're actually looking at (plus
   the always-visible header stats) renders immediately; the rest render
   a moment later in the background, so the page feels ready sooner
   without losing any of that content - it's all still there the instant
   you switch tabs.

COLORS
Every accent color that wasn't part of the royal green/blue/purple/gold
palette (Coordinators' pink, Events' indigo, Weekly Reports' teal,
various orange/amber warning tones) has been remapped into that palette -
pink and orange became purple, indigo and teal became blue and green
respectively - so the whole app reads as one consistent royal theme
rather than a mix of tab-specific colors.

FIRESTORE SECURITY RULES
Open Firebase Console -> Firestore Database -> Rules for the
'timetableworkload' project, and paste in the contents of firestore.rules.
This requires anyone reading or writing the shared workload_data record to
be signed in first (blocking fully anonymous access) - it matches the
trust level the app already has today, where any signed-in role can
write, and the UI itself decides what each role is allowed to click.
Restricting WRITES more precisely by role (e.g. a Lecturer or Student
account should not be able to overwrite lecturer/module master data, only
an Admin should) would need a bigger change - splitting the one shared
document into separate collections per concern, with field-level rules,
or gating writes through a Cloud Function - happy to build that out if
you'd like it next.
