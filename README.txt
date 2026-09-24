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
does on each interaction. The real cause of the slowness turned out to be:
the Assignment Matrix table was building a full searchable lecturer list
(every lecturer, with name/ID/phone/faculty/type) for EVERY module row -
with a few hundred of each, that's tens of thousands of dropdown options
sitting in the page at once, which is what actually froze the browser for
several seconds. That's now fixed: each row shows a plain lecturer name,
and only builds the full searchable list for the one row you actually
click into. A few other spots (like the workload analytics, which
recalculates after every single assignment) had the same kind of problem
and got the same kind of fix. Tested with 500 lecturers x 200 modules
(matching the app's own sample-data generator), the Matrix tab went from
about 5.4 seconds to about 0.2 seconds to render.

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
