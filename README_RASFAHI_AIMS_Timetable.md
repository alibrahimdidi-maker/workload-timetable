# RASFAHI AIMS — Academic Institution Management System
### Timetable Studio (Lecture + Examination timetables) — update notes

## Files
| File | What to do |
|---|---|
| `index.html` + `app.js` | Upload both to the website (GitHub Pages), replacing the old ones. |
| `index_single_file.html` | Same app in one file (use this **or** the two files above). |
| `firestore.rules` | Portal-only Firebase project → Firebase Console → Firestore → Rules → paste → **Publish**. |
| `firestore_MERGED.rules` | If RASFAHI course-outline app + portal share one project → paste this one instead. |

> ⚠️ **Publish the new rules first.** They add the `aims_timetable` collection. Without them the Timetable Studio shows a yellow warning and cannot save.

## ބޭނުންކުރާނެ ގޮތް (5 ފިޔަވަޅު)
1. **⏱️ Sessions & Times** – ފެކަލްޓީން ސެޝަންތައް ސެޓްކުރުން (މިސާލު: Morning 08:10–12:00, Afternoon 13:00–18:00, Night 18:00–23:00) + ކްލާސްގެ މިނިޓް/ބްރޭކް + އެގްޒާމް ސްލޮޓްތައް.
2. **🏫 Classrooms / Venues** – ކޮންމެ ކްލާސްރޫމެއްގެ ގޮނޑި އަދަދު، އެގްޒާމް ގޮނޑި، 🌐 Online / 🔀 Hybrid ފާހަގަކުރުން.
3. **📥 Excel Data** – ޓެމްޕްލޭޓް ޑައުންލޯޑްކޮށް (Courses, Modules, Lecturers, Students, StudentModules, Venues, Sessions, ExamSlots) ފުރިހަމަކޮށް އަޕްލޯޑް → ސޮފްޓްވެއަރ އަށް ހުރިހާ މަޢުލޫމާތެއް ސެޓްވޭ. (ނުވަތަ **📚 Modules & Lecturers** / **👩‍🎓 Individual Students** އިން ސީދާ ލިޔެވޭ.)
4. **＋ New** → **🧩 Builder** – މޮޑިއުލެއް ޗޫސްކުރީމާ ލެވިދާނެ ތަންތަން 🟩 ފެހިކުލައިން ފެނޭ (🟨 ވޯނިންގ، 🟥 ކްލޭޝް). ކްލިކް/ޑްރެގް ކުރީމާ ރޫމް ރެކޮމެންޑްކޮށްދޭ. ⚡ Auto އިން މުޅި ޓޭބަލް ކްލޭޝްނުވާ ގޮތަށް ހެދޭ.
5. **📢 Publish** – ވާޝަން، ފަހުން އެމެންޑްކުރި ތާރީޚް، އެޕްލައިވާ ތާރީޚް ސެޓްވެ، ލެކްޗަރަރުން/ކޯޑިނޭޓަރުން/ދަރިވަރުންނަށް ލައިވްކޮށް ފެނޭ.

## What the software checks (clash engine)
- Lecturer double-booking (also across faculties), venue double-booking, batch (course + batch) clashes.
- **Individual students** (repeat / failed / carry-over / skip) — their personal timetable is checked; for each clash the software suggests *another batch of the same module* or *a free slot to move the class to* (one-click **Move**).
- Warnings: room too small, online module in a physical room / F2F in online room / hybrid room needed, more hours than WCH, outside preferred session.
- Exams: batch & student clashes, same-day exams, invigilator clashes, hall exam-seat capacity; colour code per course (or batch) + **🚪 Hall door sheets**.

## Downloads
📕 PDF (one page per batch / course / lecturer / venue / hall), 🌐 HTML (for the website – one file, with a filter box), 📗 Excel (sheet per item + all entries), 🖨 Print.
Every page shows semester, year, course / batch, version, **last amended** and **effective from** dates.

## Lecturer / coordinator dashboard
“🗓️ My Timetable · LIVE” — My week · My exams & invigilation · My courses · My coordination team, with PDF/HTML/Excel, and a banner + pop-up the moment an amendment is published.
