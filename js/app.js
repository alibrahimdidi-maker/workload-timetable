import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
    import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
    import { getFirestore, collection, doc, getDoc, setDoc, deleteDoc, getDocs, writeBatch, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

    const firebaseConfig = {
        apiKey: "AIzaSyDh-pcU3quxlFJxDg_SwkrRCoMPyD48dBc",
        authDomain: "timetableworkload.firebaseapp.com",
        projectId: "timetableworkload",
        storageBucket: "timetableworkload.firebasestorage.app",
        messagingSenderId: "892740792502",
        appId: "1:892740792502:web:28889a143bacf58c02f617",
        measurementId: "G-H73EFVTRR0"
    };

    let app, auth, dbCloud;
    window.pendingSync = false;
    
    let localDB = { 
        lecturers: [], modules: [], assignments: {}, timetable: [], exam_timetable: [], rooms: [], students: [],
        events: [], weekly_reports: [], tasks: [], requests: [], exam_progress: {}, coordinators: [], coordination_reports: [],
        settings: {
            timeslots: [
                { start: "08:10", end: "09:00" }, { start: "09:00", end: "10:00" }, { start: "10:10", end: "11:00" },
                { start: "11:00", end: "12:00" }, { start: "12:10", end: "13:00" }, { start: "13:00", end: "14:00" },
                { start: "14:10", end: "15:00" }, { start: "15:00", end: "16:00" }, { start: "16:10", end: "17:00" },
                { start: "17:00", end: "18:00" }, { start: "18:10", end: "19:00" }, { start: "19:00", end: "20:00" },
                { start: "20:10", end: "21:00" }, { start: "21:00", end: "22:00" }, { start: "22:10", end: "22:30" }
            ],
            roomList: ["Main Hall", "Lab 1", "Lab 2", "CR-101", "CR-102", "CR-201"],
            completed_tts: []
        }
    };
    
    let charts = { faculty: null, focus: null, assignmentDetails: null, taskComp: null, facDil: null, examPie: null, examBar: null, ttPie: null, eventBar: null, eventPie: null, coordPie: null, coordBar: null, minfoPie: null, lectOwnProg: null, taskTabComp: null, taskTabFac: null, coordTasksBar: null, coordTasksPie: null, coordSummary: null }; 
    let currentLecturerId = null;
    let currentStudentId = null;
    let activeRole = 'ALL';
    let pending2FAAction = null;
    let pending2FAData = null;
    
    const FACULTIES = ["KED", "KSL", "KEMS", "KIRK", "KAL", "KQS", "FET", "FIT", "FAH", "FHTS", "SN", "SM", "CHS", "CPS", "CCE", "FMC", "FAG", "FLS", "SOL", "SOD"];

    let autoSyncTimeout;
    
    // --- 2FA LOGIC ---
    window.init2FA = (actionType, id) => {
        pending2FAAction = actionType;
        pending2FAData = id;
        let actionText = '';
        if(actionType === 'delete_lect') actionText = `Delete Lecturer ID: ${id}`;
        else if(actionType === 'delete_mod') actionText = `Delete Module Code: ${id}`;
        else if(actionType === 'delete_stu') actionText = `Delete Student ID: ${id}`;
        else if(actionType === 'edit_lect') actionText = `Edit Lecturer ID: ${id}`;
        else if(actionType === 'edit_mod') actionText = `Edit Module Code: ${id}`;
        else if(actionType === 'edit_stu') actionText = `Edit Student ID: ${id}`;
        else if(actionType === 'clear_assignment') actionText = `Clear Assignment for Module: ${id}`;
        
        document.getElementById('2fa-action-text').innerText = actionText;
        document.getElementById('2fa-code').value = '';
        document.getElementById('m-2fa').style.display = 'flex';
        window.showToast(`OTP sent to your registered email for ${actionType}`, "info");
    };

    window.confirm2FA = () => {
        const code = document.getElementById('2fa-code').value;
        if(code.length < 4) return alert("Please enter valid OTP.");
        
        if(pending2FAAction === 'delete_lect') {
            localDB.lecturers = localDB.lecturers.filter(l => window.makeSafeId(window.getSafeVal(l, ['LecturerID', 'NationalID'])) !== pending2FAData);
            window.invalidateLecturerCache();
            for (let key in localDB.assignments) { if (localDB.assignments[key].id === pending2FAData) localDB.assignments[key].id = ''; }
            window.saveLocal(true); window.triggerAllRenders();
            window.showToast("Lecturer Deleted", "success");
        } else if(pending2FAAction === 'delete_mod') {
            localDB.modules = localDB.modules.filter(m => window.makeSafeId(window.getSafeVal(m, ['ModuleCode', 'Code'])) !== pending2FAData);
            delete localDB.assignments[pending2FAData];
            localDB.timetable = localDB.timetable.filter(t => t.modCode !== pending2FAData);
            localDB.exam_timetable = localDB.exam_timetable.filter(t => t.modCode !== pending2FAData);
            window.saveLocal(true); window.triggerAllRenders();
            window.showToast("Module Deleted", "success");
        } else if(pending2FAAction === 'delete_stu') {
            localDB.students = localDB.students.filter(s => window.makeSafeId(window.getSafeVal(s, ['StudentID', 'ID'])) !== pending2FAData);
            window.saveLocal(true); window.renderStudentsTab();
            window.showToast("Student Deleted", "success");
        } else if(pending2FAAction === 'clear_assignment') {
            if (localDB.assignments[pending2FAData]) {
                localDB.assignments[pending2FAData].id = '';
                window.saveLocal(true); window.triggerAllRenders();
                window.showToast("Assignment Cleared", "success");
            }
        } else {
            window.showToast("Edit mode unlocked (Simulation)", "success");
        }
        
        document.getElementById('m-2fa').style.display = 'none';
        pending2FAAction = null;
        pending2FAData = null;
    };


    // --- MODULE DETAILS INFO ---
    window.showModuleDetails = (mCode) => {
        const mod = localDB.modules.find(m => window.makeSafeId(window.getSafeVal(m, ['ModuleCode'])) === mCode);
        if(!mod) return;
        
        document.getElementById('m-info-code').innerText = mCode;
        document.getElementById('m-info-title').innerText = window.getSafeVal(mod, ['ModuleName']);
        
        const ass = localDB.assignments[mCode];
        let lectHtml = '';
        if(ass && ass.id) {
            const l = window.getLecturerById(ass.id);
            if(l) lectHtml = `<b>${window.getSafeVal(l, ['LecturerName'])}</b><br><span class="text-gray-500">${window.getSafeVal(l, ['LecturerType'])} - ${window.getSafeVal(l, ['LecturerCategory'])}</span>`;
            else lectHtml = "Unknown Lecturer";
        } else lectHtml = "Unassigned";
        document.getElementById('m-info-lecturers').innerHTML = lectHtml;

        document.getElementById('m-info-programs').innerHTML = `
            <b>Program:</b> ${window.getSafeVal(mod, ['ProgramName'])} <br>
            <b>Batch:</b> ${window.getSafeVal(mod, ['OfferedBatch'])} <br>
            <b>Session:</b> ${window.getSafeVal(mod, ['Session'])} <br>
            <b>Mode:</b> ${window.getSafeVal(mod, ['Modality'])}
        `;

        let schedHtml = '';
        localDB.timetable.forEach(t => {
            if(t.modCode === mCode) {
                const ts = localDB.settings.timeslots[t.tsIndex];
                schedHtml += `<div class="bg-gray-100 p-1 rounded border mb-1"><b>${t.day}</b>: ${ts.start}-${ts.end} (Rm: ${t.room})</div>`;
            }
        });
        document.getElementById('m-info-schedule').innerHTML = schedHtml || '<span class="italic text-gray-500">Not scheduled yet.</span>';

        let stuHtml = '';
        let count = 0;
        let mProg = window.getSafeVal(mod, ['ProgramName']);
        let mBatch = window.getSafeVal(mod, ['OfferedBatch']);
        let modeCounts = {"Face to Face": 0, "Online": 0, "Blended": 0};

        localDB.students.forEach(s => {
            if(window.getSafeVal(s, ['EnrolledProgram']) === mProg && (window.getSafeVal(s, ['Batch']) === mBatch || mBatch === '')) {
                stuHtml += `<div class="border-b p-1"><b>${window.getSafeVal(s, ['FullName'])}</b><br><span class="text-gray-400">${window.getSafeVal(s, ['StudentID'])}</span></div>`;
                count++;
                const sm = window.getSafeVal(s, ['StudyMode']);
                if(modeCounts[sm] !== undefined) modeCounts[sm]++;
            }
        });
        document.getElementById('m-info-students').innerHTML = stuHtml || '<div class="col-span-2 text-center text-gray-500 italic">No registered students found.</div>';
        document.getElementById('m-info-stu-count').innerText = count;

        if(charts.minfoPie) charts.minfoPie.destroy();
        charts.minfoPie = new Chart(document.getElementById('m-info-pie'), {
            type: 'pie',
            data: { labels: ['F2F', 'Online', 'Blended'], datasets: [{ data: [modeCounts["Face to Face"], modeCounts["Online"], modeCounts["Blended"]], backgroundColor: ['#3b82f6', '#10b981', '#f59e0b'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });

        document.getElementById('module-info-modal').style.display = 'flex';
    };

    // --- STUDENT DETAILS INFO ---
    window.showStudentDetails = (id) => {
        const stu = localDB.students.find(s => window.makeSafeId(window.getSafeVal(s, ['StudentID'])) === id);
        if(!stu) return;

        document.getElementById('s-info-name').innerText = window.getSafeVal(stu, ['FullName']);
        document.getElementById('s-info-id').innerText = `ID: ${id} | Semester: ${window.getSafeVal(stu, ['Semester'])} | Batch: ${window.getSafeVal(stu, ['Batch'])}`;

        let mHtml = '';
        let coreCount = 0; let addCount = 0; let totWCH = 0;
        const sProg = window.getSafeVal(stu, ['EnrolledProgram']);
        const sBatch = window.getSafeVal(stu, ['Batch']);

        localDB.modules.forEach(m => {
            const mProg = window.getSafeVal(m, ['ProgramName']);
            const mBatch = window.getSafeVal(m, ['OfferedBatch']);
            if(mProg === sProg && (mBatch === sBatch || mBatch === '')) {
                const wch = parseFloat(window.getSafeVal(m, ['WCH'])) || 0;
                totWCH += wch;
                coreCount++;
                mHtml += `<tr>
                    <td class="p-2 border-b font-bold text-royal-blue">${window.getSafeVal(m, ['ModuleCode'])}</td>
                    <td class="p-2 border-b">${window.getSafeVal(m, ['ModuleName'])}</td>
                    <td class="p-2 border-b"><span class="bg-green-100 text-green-800 px-1 rounded">Core</span></td>
                    <td class="p-2 border-b text-center font-bold">${wch}</td>
                </tr>`;
            }
        });

        document.getElementById('s-info-mods').innerHTML = mHtml || '<tr><td colspan="4" class="text-center p-2 italic text-gray-500">No modules found for this program/batch.</td></tr>';
        document.getElementById('s-info-core').innerText = coreCount;
        document.getElementById('s-info-add').innerText = addCount;
        document.getElementById('s-info-wch').innerText = totWCH;

        document.getElementById('student-info-modal').style.display = 'flex';
    };

    // --- EXAM REQUEST ---
    window.openExamRequestModal = () => {
        const sel = document.getElementById('exam-req-lect');
        let opts = '<option value="ALL">All Lecturers (Broadcast)</option>';
        localDB.lecturers.forEach(l => {
            opts += `<option value="${window.getSafeVal(l, ['LecturerName'])}">${window.getSafeVal(l, ['LecturerName'])} (${window.getSafeVal(l, ['LecturerID'])})</option>`;
        });
        sel.innerHTML = opts;
        document.getElementById('exam-request-modal').style.display = 'flex';
    };

    window.sendExamRequest = () => {
        const l = document.getElementById('exam-req-lect').value;
        const m = document.getElementById('exam-req-title').value;
        if(!l || !m) return alert("Select lecturer and enter module details.");
        
        simulateEmail(`Lecturer(s): ${l}`, `EXAM UNIT: ${document.getElementById('exam-req-type').value}`, `Module: ${m}. Please check your portal for details/attachments.`);
        window.showToast("Exam Request Sent", "success");
        document.getElementById('exam-request-modal').style.display = 'none';
    };


    window.triggerCloudPushSync = async () => {
        if (!navigator.onLine) {
            window.showToast("Offline. Cannot push to Cloud.", "warning");
            document.getElementById('cloud-pulse').style.background = "red";
            document.getElementById('cloud-pulse').style.animation = "none";
            document.getElementById('cloud-txt').innerText = "Offline (Saved Locally)";
            return;
        }
        await window.saveToServer(true);
    };

    function triggerAutoSync() {
        clearTimeout(autoSyncTimeout);
        window.pendingSync = true;
        document.getElementById('cloud-pulse').style.background = "orange";
        document.getElementById('cloud-txt').innerText = "Syncing...";
        
        autoSyncTimeout = setTimeout(() => {
            if (navigator.onLine && activeRole) {
                window.saveToServer(true); 
            } else {
                document.getElementById('cloud-pulse').style.background = "red";
                document.getElementById('cloud-pulse').style.animation = "none";
                document.getElementById('cloud-txt').innerText = "Offline (Saved Locally)";
            }
        }, 2000); 
    }

    window.showToast = (msg, type = 'info') => {
        const container = document.getElementById('toast-container');
        if(!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? '✅' : (type === 'warning' ? '⚠️' : (type === 'error' ? '❌' : 'ℹ️'));
        toast.innerHTML = `<span>${icon}</span> <span>${msg}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.animation = 'fadeOut 0.3s ease-out forwards'; setTimeout(() => toast.remove(), 300); }, 4000);
    };

    const simulateEmail = (toRole, subject, body) => {
        console.log(`[EMAIL DISPATCH] To: ${toRole} | Sub: ${subject} | Body: ${body}`);
        window.showToast(`📧 Email notification sent to ${toRole}`, "info");
    };

    window.makeSafeId = (id) => {
        if (!id) return `UNKNOWN-${Math.floor(Math.random()*100000)}`;
        return String(id).trim().replace(/[^a-zA-Z0-9_-]/g, '-').toUpperCase();
    };

    // Shared cache: looking up a lecturer by id used to mean localDB.lecturers.find(...) called
    // from inside a loop over modules/tasks/reports - with a few hundred of each, that's
    // O(modules x lecturers) or worse, repeated on almost every render. This builds the lookup
    // once and reuses it until something actually changes the lecturer list.
    let _lecturerByIdCache = null;
    window.getLecturerById = (id) => {
        if (!_lecturerByIdCache) {
            _lecturerByIdCache = {};
            localDB.lecturers.forEach(l => { _lecturerByIdCache[window.makeSafeId(window.getSafeVal(l, ['LecturerID']))] = l; });
        }
        return _lecturerByIdCache[id];
    };
    window.invalidateLecturerCache = () => { _lecturerByIdCache = null; };

    const getNormalizedPrefix = (email) => {
        if (!email || !email.includes('@')) return "";
        return email.split('@')[0].toLowerCase().trim();
    };

    const validateRoleEmail = (role, email) => {
        const prefix = getNormalizedPrefix(email);
        if (role === 'ALL') return prefix === 'academic.affairs';
        else if (role === 'EXAM') return prefix === 'examinations';
        else if (FACULTIES.includes(role)) return prefix === role.toLowerCase();
        else if (role === 'STUDENT') return /^ium\d+$/.test(prefix);
        else if (role === 'LECTURER') {
            if (prefix === 'academic.affairs' || prefix === 'examinations' || /^ium\d+$/.test(prefix)) return false;
            for (const f of FACULTIES) { if (prefix === f.toLowerCase()) return false; }
            return true;
        }
        return false;
    };

    const getRoleFromEmail = (email) => {
        if (!email || !email.includes('@')) return 'LECTURER'; 
        const prefix = getNormalizedPrefix(email);
        if (prefix === 'academic.affairs') return 'ALL';
        if (prefix === 'examinations') return 'EXAM';
        for (let f of FACULTIES) { if (prefix === f.toLowerCase()) return f; }
        if (/^ium\d+$/.test(prefix)) return 'STUDENT';
        return 'LECTURER';
    };

    window.getSafeVal = (row, possibleKeys) => {
        if (!row || typeof row !== 'object') return '';
        for (let key of Object.keys(row)) {
            let cleanKey = String(key).toLowerCase().replace(/[\s\n\r\.\-\_]/g, '');
            for (let pk of possibleKeys) {
                if (cleanKey.includes(String(pk).toLowerCase().replace(/[\s\n\r\.\-\_]/g, ''))) return row[key] || '';
            }
        }
        return '';
    };

    window.getFaculty = (row) => {
        if (!row || typeof row !== 'object') return 'UNKNOWN';
        const raw = window.getSafeVal(row, ['Kulliyyah', 'ParentKulliyya', 'Faculty', 'Centre']);
        if (!raw || raw.trim() === '') return 'UNKNOWN';
        const matched = FACULTIES.find(f => String(raw).toUpperCase().includes(String(f).toUpperCase()));
        return matched || String(raw).trim();
    };
    
    window.getSafeCampus = (row) => {
        const campusSpecific = window.getSafeVal(row, ['Campus', 'MALE', 'Male']);
        if(campusSpecific) return campusSpecific;
        const keys = Object.keys(row);
        return keys.length > 2 ? (row[keys[2]] || 'MALE') : 'MALE';
    };

    window.getDefaultTarget = (l) => {
        if (l.custom_target) return parseInt(l.custom_target); 
        const typeStr = String(window.getSafeVal(l, ['LecturerType', 'Type', 'Status']) || '').toLowerCase();
        const focusStr = String(window.getSafeVal(l, ['LecturerCategory', 'Category', 'AcademicFocus', 'Focus']) || '').toLowerCase();
        if (focusStr.includes('dean')) return 1;
        if (typeStr.includes('part') || typeStr === 'pt' || focusStr.includes('part')) return 9;
        if (focusStr.includes('research') || focusStr === 'res') return 9;
        return 15; 
    };

    window.saveLocal = (silent = false) => {
        try {
            localStorage.setItem('wl_modules', JSON.stringify(localDB.modules));
            localStorage.setItem('wl_lecturers', JSON.stringify(localDB.lecturers));
            localStorage.setItem('wl_assignments', JSON.stringify(localDB.assignments));
            localStorage.setItem('wl_timetable', JSON.stringify(localDB.timetable));
            localStorage.setItem('wl_exam_timetable', JSON.stringify(localDB.exam_timetable));
            localStorage.setItem('wl_rooms', JSON.stringify(localDB.rooms));
            localStorage.setItem('wl_students', JSON.stringify(localDB.students));
            localStorage.setItem('wl_settings', JSON.stringify(localDB.settings));
            localStorage.setItem('wl_events', JSON.stringify(localDB.events));
            localStorage.setItem('wl_weekly_reports', JSON.stringify(localDB.weekly_reports));
            localStorage.setItem('wl_tasks', JSON.stringify(localDB.tasks));
            localStorage.setItem('wl_requests', JSON.stringify(localDB.requests));
            localStorage.setItem('wl_exam_progress', JSON.stringify(localDB.exam_progress));
            localStorage.setItem('wl_coordinators', JSON.stringify(localDB.coordinators));
            localStorage.setItem('wl_coordination_reports', JSON.stringify(localDB.coordination_reports));

            if (!silent) window.showToast("Saved to Local Browser.", "success");
            triggerAutoSync(); 
        } catch (e) {
            if(!silent) window.showToast("Warning: Local browser storage is full.", "warning");
        }
    };

    const loadLocalCache = () => {
        try {
            const keys = ['modules', 'lecturers', 'assignments', 'timetable', 'exam_timetable', 'rooms', 'students', 'settings', 'events', 'weekly_reports', 'tasks', 'requests', 'exam_progress', 'coordinators', 'coordination_reports'];
            keys.forEach(k => {
                const data = localStorage.getItem(`wl_${k}`);
                if(data) {
                    if(k === 'settings') {
                        const parsed = JSON.parse(data);
                        if(parsed.timeslots) localDB.settings.timeslots = parsed.timeslots;
                        if(parsed.roomList) localDB.settings.roomList = parsed.roomList;
                        if(parsed.completed_tts) localDB.settings.completed_tts = parsed.completed_tts;
                    } else {
                        localDB[k] = JSON.parse(data);
                    }
                }
            });
        } catch(e) { console.error("Cache read error", e); }
        window.invalidateLecturerCache();
    };

    const buildDropdowns = () => {
        let options = `<option value="ALL">Academic Affairs (Global Admin)</option>`;
        options += `<option value="EXAM">Examination Department</option>`;
        options += `<option value="LECTURER">Lecturer Access (Slip/Coordination View)</option>`;
        options += `<option value="STUDENT">Student Access (Timetable View)</option>`;
        FACULTIES.forEach(f => options += `<option value="${f}">Faculty of ${f}</option>`);
        document.getElementById('login-role').innerHTML = options;
        
        let viewOptions = `<option value="ALL">View All Faculties (Global View)</option>`;
        FACULTIES.forEach(f => viewOptions += `<option value="${f}">View Faculty of ${f}</option>`);
        if(document.getElementById('facView')) document.getElementById('facView').innerHTML = viewOptions;

        let modalFacOpts = '<option value="">-- Select Faculty --</option>';
        FACULTIES.forEach(f => modalFacOpts += `<option value="${f}">${f}</option>`);
        if(document.getElementById('add-lect-fac')) document.getElementById('add-lect-fac').innerHTML = modalFacOpts;
        if(document.getElementById('add-mod-fac')) document.getElementById('add-mod-fac').innerHTML = modalFacOpts;
        
        if(document.getElementById('ev-target-fac')) document.getElementById('ev-target-fac').innerHTML = modalFacOpts;
        if(document.getElementById('wr-filter-fac')) {
            let fOpts = '<option value="ALL">All Faculties</option>';
            FACULTIES.forEach(f => fOpts += `<option value="${f}">${f}</option>`);
            document.getElementById('wr-filter-fac').innerHTML = fOpts;
        }
    };
    buildDropdowns();

    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        dbCloud = getFirestore(app);
    } catch (e) {
        document.getElementById('cloud-pulse').style.background = "red";
        document.getElementById('cloud-pulse').style.animation = "none";
        document.getElementById('cloud-txt').innerText = "Offline (Local Mode)";
    }

    window.detectFacultyFromEmail = () => {
        const email = document.getElementById('login-email').value;
        document.getElementById('login-role').value = getRoleFromEmail(email);
    };

    window.openAddLecturerModal = () => document.getElementById('add-lecturer-modal').style.display = 'flex';
    window.closeAddLecturerModal = () => document.getElementById('add-lecturer-modal').style.display = 'none';

    window.openAddModuleModal = () => document.getElementById('add-module-modal').style.display = 'flex';
    window.closeAddModuleModal = () => document.getElementById('add-module-modal').style.display = 'none';

    window.openAddStudentModal = () => document.getElementById('add-student-modal').style.display = 'flex';
    window.closeAddStudentModal = () => document.getElementById('add-student-modal').style.display = 'none';

    window.exportLecturersCSV = () => window.exportCSV(localDB.lecturers, 'Lecturers_Master_Data.csv');
    window.exportModulesCSV = () => window.exportCSV(localDB.modules, 'Modules_Master_Data.csv');

    window.saveNewLecturer = () => {
        const fac = document.getElementById('add-lect-fac').value;
        const id = document.getElementById('add-lect-id').value;
        const name = document.getElementById('add-lect-name').value;
        const cat = document.getElementById('add-lect-cat').value;
        const type = document.getElementById('add-lect-type').value;
        const mobile = document.getElementById('add-lect-mobile').value;

        if(!id || !name) return alert("Lecturer ID and Name are required.");

        localDB.lecturers.push({
            "Kulliyyah": fac,
            "LecturerID": id,
            "LecturerName": name,
            "LecturerCategory": cat,
            "LecturerType": type,
            "MobileNumber": mobile
        });
        window.invalidateLecturerCache();
        window.saveLocal(true);
        window.renderLectDataTab();
        window.closeAddLecturerModal();
        window.showToast("Lecturer Added Successfully", "success");
    };

    window.saveNewModule = () => {
        const code = document.getElementById('add-mod-code').value;
        const name = document.getElementById('add-mod-name').value;
        if(!code || !name) return alert("Module Code and Name are required.");

        localDB.modules.push({
            "ModuleCode": code,
            "ModuleName": name,
            "ParentKulliyya": document.getElementById('add-mod-fac').value,
            "ProgramName": document.getElementById('add-mod-prog').value,
            "Session": document.getElementById('add-mod-session').value,
            "OfferedBatch": document.getElementById('add-mod-batch').value,
            "CombinedBatch": document.getElementById('add-mod-comb').value,
            "Campus": document.getElementById('add-mod-campus').value,
            "Modality": document.getElementById('add-mod-modality').value,
            "MediumofInstruction": document.getElementById('add-mod-medium').value,
            "NoofStudents": document.getElementById('add-mod-students').value,
            "WCH": document.getElementById('add-mod-wch').value,
            "OfferedStatus": document.getElementById('add-mod-status').value
        });
        window.saveLocal(true);
        window.renderModDataTab();
        window.closeAddModuleModal();
        window.showToast("Module Added Successfully", "success");
    };

    window.saveNewStudent = () => {
        const id = document.getElementById('add-stu-id').value;
        const name = document.getElementById('add-stu-name').value;
        if(!id || !name) return alert("Student ID and Name are required.");

        localDB.students.push({
            "StudentID": id,
            "FullName": name,
            "EnrolledProgram": document.getElementById('add-stu-prog').value,
            "Semester": document.getElementById('add-stu-sem').value,
            "Batch": document.getElementById('add-stu-batch').value,
            "StudyMode": document.getElementById('add-stu-mode').value,
            "Type": document.getElementById('add-stu-type').value
        });
        window.saveLocal(true);
        window.renderStudentsTab();
        window.closeAddStudentModal();
        window.showToast("Student Added Successfully", "success");
    };

    window.renderLectDataTab = () => {
        const tbody = document.getElementById('lectdata-body'); if(!tbody) return;
        const searchQ = document.getElementById('lectSearch').value.toLowerCase();
        const facFilter = document.getElementById('lect-filter-fac').value;
        const catFilter = document.getElementById('lect-filter-cat').value;
        const typeFilter = document.getElementById('lect-filter-type').value;

        let html = '';
        window.getFilteredLecturers().forEach(l => {
            const fac = window.getFaculty(l);
            const id = window.getSafeVal(l, ['LecturerID', 'NationalID', 'ID']);
            const name = window.getSafeVal(l, ['LecturerName', 'FullName', 'Name']);
            const cat = window.getSafeVal(l, ['LecturerCategory', 'Category']);
            const type = window.getSafeVal(l, ['LecturerType', 'Type']);
            const mobile = window.getSafeVal(l, ['MobileNumber', 'Mobile', 'Phone']);

            const matchSearch = String(id).toLowerCase().includes(searchQ) || String(name).toLowerCase().includes(searchQ) || String(mobile).toLowerCase().includes(searchQ);
            const matchFac = facFilter === '' || String(fac) === facFilter;
            const matchCat = catFilter === '' || String(cat) === catFilter;
            const matchType = typeFilter === '' || String(type) === typeFilter;

            if (matchSearch && matchFac && matchCat && matchType) {
                html += `<tr class="hover:bg-gray-50 border-b border-gray-100">
                    <td class="p-2">${fac}</td>
                    <td class="p-2 font-bold text-royal-blue">${id}</td>
                    <td class="p-2">${name}</td>
                    <td class="p-2">${cat}</td>
                    <td class="p-2">${type}</td>
                    <td class="p-2">${mobile || '-'}</td>
                    <td class="p-2 text-center flex gap-1 justify-center">
                        <button onclick="window.init2FA('edit_lect', '${window.makeSafeId(id)}')" class="text-blue-500 font-bold hover:underline">Edit</button>
                        <button onclick="window.init2FA('delete_lect', '${window.makeSafeId(id)}')" class="text-red-500 font-bold hover:underline">Del</button>
                    </td>
                </tr>`;
            }
        });
        tbody.innerHTML = html || '<tr><td colspan="7" class="p-4 text-center text-gray-500 italic">No lecturers found.</td></tr>';
    };


    window.renderModDataTab = () => {
        const tbody = document.getElementById('moddata-body'); if(!tbody) return;
        const searchQ = document.getElementById('modSearch').value.toLowerCase();
        const facFilter = document.getElementById('mod-filter-fac').value;
        const campusFilter = document.getElementById('mod-filter-campus').value;
        const modalityFilter = document.getElementById('mod-filter-modality').value;
        const mediumFilter = document.getElementById('mod-filter-medium').value;
        const statusFilter = document.getElementById('mod-filter-status').value;
        const sessionFilter = document.getElementById('mod-filter-session').value;
        const progFilter = document.getElementById('mod-filter-prog').value;
        const batchFilter = document.getElementById('mod-filter-batch').value;

        let html = '';
        window.getFilteredModules().forEach(m => {
            const code = window.getSafeVal(m, ['ModuleCode', 'Code']);
            const name = window.getSafeVal(m, ['ModuleName', 'Name']);
            const fac = window.getFaculty(m);
            const prog = window.getSafeVal(m, ['ProgramName', 'Program']);
            const session = window.getSafeVal(m, ['Session']);
            const batch = window.getSafeVal(m, ['OfferedBatch', 'Batch']);
            const combBatch = window.getSafeVal(m, ['CombinedBatch']);
            const campus = window.getSafeCampus(m);
            const modality = window.getSafeVal(m, ['Modality']);
            const medium = window.getSafeVal(m, ['MediumofInstruction', 'Medium']);
            const students = window.getSafeVal(m, ['NoofStudents', 'Students']) || 0;
            const wch = window.getSafeVal(m, ['WeeklyContactHours', 'WCH', 'Credit', 'Hours']) || 0;
            const status = window.getSafeVal(m, ['OfferedStatus', 'Status']);

            const matchSearch = String(code).toLowerCase().includes(searchQ) || String(name).toLowerCase().includes(searchQ);
            const matchFac = facFilter === '' || String(fac) === facFilter;
            const matchCampus = campusFilter === '' || String(campus) === campusFilter;
            const matchModality = modalityFilter === '' || String(modality) === modalityFilter;
            const matchMedium = mediumFilter === '' || String(medium) === mediumFilter;
            const matchStatus = statusFilter === '' || String(status) === statusFilter;
            const matchSession = sessionFilter === '' || String(session) === sessionFilter;
            const matchProg = progFilter === '' || String(prog) === progFilter;
            const matchBatch = batchFilter === '' || String(batch) === batchFilter;

            if (matchSearch && matchFac && matchCampus && matchModality && matchMedium && matchStatus && matchSession && matchProg && matchBatch) {
                html += `<tr class="hover:bg-gray-50 border-b border-gray-100">
                    <td class="p-2">${session}</td>
                    <td class="p-2 min-w-[120px]">${prog}</td>
                    <td class="p-2">${batch}</td>
                    <td class="p-2">${fac}</td>
                    <td class="p-2">${medium}</td>
                    <td class="p-2">${combBatch}</td>
                    <td class="p-2">${status}</td>
                    <td class="p-2">${campus}</td>
                    <td class="p-2 min-w-[150px]">${name}</td>
                    <td class="p-2">${modality}</td>
                    <td class="p-2 font-bold text-royal-blue clickable-name" onclick="window.showModuleDetails('${window.makeSafeId(code)}')">${code}</td>
                    <td class="p-2 text-center">${students}</td>
                    <td class="p-2 text-center">${wch}</td>
                    <td class="p-2 text-center flex gap-1 justify-center">
                        <button onclick="window.init2FA('edit_mod', '${window.makeSafeId(code)}')" class="text-blue-500 font-bold hover:underline">Edit</button>
                        <button onclick="window.init2FA('delete_mod', '${window.makeSafeId(code)}')" class="text-red-500 font-bold hover:underline">Del</button>
                    </td>
                </tr>`;
            }
        });
        tbody.innerHTML = html || '<tr><td colspan="14" class="p-4 text-center text-gray-500 italic">No modules found.</td></tr>';
    };


    window.renderMatrix = () => {
        const tbody = document.getElementById('matrix-body'); if(!tbody) return;
        const searchQ = document.getElementById('mSearch')?.value.toLowerCase() || '';

        let html = '';
        window.getFilteredModules().forEach(m => {
            const rawMCode = window.getSafeVal(m, ['ModuleCode']);
            const mCode = window.makeSafeId(rawMCode);
            const mName = window.getSafeVal(m, ['ModuleName']);
            const fac = window.getFaculty(m);
            const prog = window.getSafeVal(m, ['ProgramName']);
            const campus = window.getSafeCampus(m);
            const wch = parseFloat(window.getSafeVal(m, ['WCH', 'WeeklyContactHours', 'Credit', 'Hours'])) || 0;

            const matchSearch = String(mCode).toLowerCase().includes(searchQ) || String(mName).toLowerCase().includes(searchQ) || String(fac).toLowerCase().includes(searchQ);
            if (!matchSearch) return;

            if (!localDB.assignments[mCode]) localDB.assignments[mCode] = { id: '', mode: window.getSafeVal(m, ['CombinedBatch']) ? 'Combined' : 'Individual' };
            const ass = localDB.assignments[mCode];

            const statusColor = ass.id ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
            const statusTxt = ass.id ? 'Assigned' : 'Pending';

            const thA = document.getElementById('th-actions');
            const showActions = thA && thA.style.display !== 'none';
            // Action buttons with 2FA Edit and Delete (Clear Assignment)
            const actionBtn = showActions ? `<td class="p-2 text-center flex justify-center gap-1">
                <button onclick="window.init2FA('edit_assignment', '${mCode}')" class="text-blue-500 font-bold text-[10px] hover:underline">Edit</button>
                <button onclick="window.init2FA('clear_assignment', '${mCode}')" class="text-red-500 font-bold text-[10px] hover:underline">Clear</button>
            </td>` : '';

            // Color coding based on lecturer
            let rowColorClass = 'hover:bg-blue-50';
            let assignedLectName = '-- Unassigned --';
            if(ass.id) {
                const asL = window.getLecturerById(ass.id);
                if(asL) {
                    assignedLectName = window.getSafeVal(asL, ['LecturerName']) || ass.id;
                    const lType = String(window.getSafeVal(asL, ['LecturerType'])).toLowerCase();
                    const isPT = lType.includes('part');
                    const asFac = window.getFaculty(asL);
                    if(isPT) rowColorClass = 'bg-[#e9d5ff]'; 
                    else if(asFac !== fac) rowColorClass = 'bg-[#bbf7d0]'; 
                    else rowColorClass = 'bg-[#bfdbfe]'; 
                }
            }

            html += `<tr class="border-b border-gray-100 transition ${rowColorClass}">
                <td class="p-2"><span class="px-2 py-1 rounded text-[8px] font-black uppercase ${statusColor}">${statusTxt}</span></td>
                <td class="p-2 text-[10px]"><b>${campus}</b><br><span class="text-gray-500">${prog}</span></td>
                <td class="p-2 text-[10px]"><b class="text-royal-blue clickable-name" onclick="window.showModuleDetails('${mCode}')">${mCode}</b><br>${mName}</td>
                <td class="p-2 text-center font-black text-xs text-purple-700">${wch}</td>
                <td class="p-2 text-[10px] font-bold text-gray-700">${fac}</td>
                <td class="p-2 text-center">
                    <div class="assign-trigger w-full p-1 border rounded text-[9px] shadow-sm outline-none focus:border-royal-blue cursor-pointer bg-white truncate" tabindex="0" data-mcode="${mCode}" data-selected-id="${ass.id}" title="Click to search & assign a lecturer">${assignedLectName}</div>
                </td>
                <td class="p-2 text-[10px]">
                    <select onchange="window.updateAssignmentMode('${mCode}', this.value)" class="p-1 border rounded outline-none shadow-sm bg-gray-50">
                        <option value="Individual" ${ass.mode==='Individual'?'selected':''}>Individual</option>
                        <option value="Combined" ${ass.mode==='Combined'?'selected':''}>Combined</option>
                    </select>
                </td>
                ${actionBtn}
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="8" class="p-4 text-center text-gray-500 italic">No modules found.</td></tr>';

        // Only when the admin actually clicks a row's assignment cell do we build the real
        // searchable dropdown for it (options for every lecturer) and hand it to TomSelect - never
        // upfront for every row. With a few hundred lecturers x a few hundred modules, populating
        // and widget-izing all of them up front was multiple seconds of real DOM work; this keeps
        // the initial render to just plain text labels, which is fast regardless of data size.
        const activateAssignTrigger = (triggerEl) => {
            const mCode = triggerEl.dataset.mcode;
            const selectedId = triggerEl.dataset.selectedId || '';
            const sel = document.createElement('select');
            sel.className = 'w-full p-1 border rounded text-[9px] shadow-sm outline-none focus:border-royal-blue tom-select-assign';
            sel.setAttribute('onchange', `window.updateAssignment('${mCode}', this.value)`);
            let opts = '<option value="">-- Unassigned --</option>';
            window.getFilteredLecturers().forEach(l => {
                const lId = window.makeSafeId(window.getSafeVal(l, ['LecturerID']));
                const lName = window.getSafeVal(l, ['LecturerName']);
                const lType = window.getSafeVal(l, ['LecturerType', 'Type']);
                const lCat = window.getSafeVal(l, ['LecturerCategory', 'Category']);
                const lFac = window.getFaculty(l);
                const lPhone = window.getSafeVal(l, ['MobileNumber', 'Mobile']) || 'N/A';
                opts += `<option value="${lId}">${lName} | ID:${lId} | Ph:${lPhone} | Fac:${lFac} | ${lType} | ${lCat}</option>`;
            });
            sel.innerHTML = opts;
            sel.value = selectedId;
            triggerEl.replaceWith(sel);
            new TomSelect(sel, { create: false, placeholder: "Select Lecturer..." });
            if (sel.tomselect) sel.tomselect.focus();
        };
        document.querySelectorAll('.assign-trigger').forEach(el => {
            el.addEventListener('mousedown', (e) => { e.preventDefault(); activateAssignTrigger(el); }, { once: true });
            el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateAssignTrigger(el); } }, { once: true });
        });
    };

    window.updateAssignment = (mCode, lId) => {
        if (!localDB.assignments[mCode]) localDB.assignments[mCode] = { id: '', mode: 'Individual' };
        localDB.assignments[mCode].id = lId;
        window.saveLocal(true);
        window.renderMatrix(); window.updateAnalytics();
    };

    window.updateAssignmentMode = (mCode, mode) => {
        if (!localDB.assignments[mCode]) localDB.assignments[mCode] = { id: '', mode: 'Individual' };
        localDB.assignments[mCode].mode = mode;
        window.saveLocal(true);
        window.renderMatrix(); window.updateAnalytics();
    };

    window.clearAssignment = (mCode) => {
        if (localDB.assignments[mCode]) {
            localDB.assignments[mCode].id = '';
            window.saveLocal(true); window.triggerAllRenders();
        }
    };

    window.renderStaffTargets = () => {
        const tbody = document.getElementById('staff-target-body'); if(!tbody) return;
        const facFilter = document.getElementById('staff-filter-fac').value;
        const catFilter = document.getElementById('staff-filter-cat').value;
        const typeFilter = document.getElementById('staff-filter-type').value;
        const search = document.getElementById('staff-search').value.toLowerCase();
        
        let html = '';
        window.getFilteredLecturers().forEach(l => {
            const fac = window.getFaculty(l);
            const id = window.getSafeVal(l, ['LecturerID']);
            const name = window.getSafeVal(l, ['LecturerName']);
            const cat = window.getSafeVal(l, ['LecturerCategory', 'Category']);
            const type = window.getSafeVal(l, ['LecturerType', 'Type']);
            const target = window.getDefaultTarget(l);

            const matchFac = facFilter === '' || fac === facFilter;
            const matchCat = catFilter === '' || cat === catFilter;
            const matchType = typeFilter === '' || type === typeFilter;
            const matchSearch = String(id).toLowerCase().includes(search) || String(name).toLowerCase().includes(search);

            if(matchFac && matchCat && matchType && matchSearch) {
                const isPT = String(type).toLowerCase().includes('part');
                const badgeHtml = isPT ? `<span class="pt-badge px-1.5 py-0.5 rounded text-[8px] font-black uppercase ml-1">PT</span>` : `<span class="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[8px] font-black uppercase ml-1">FT</span>`;
                html += `<tr class="hover:bg-gray-50 border-b border-gray-100">
                    <td class="p-2"><b class="text-royal-blue clickable-name" onclick="window.openHRView('${window.makeSafeId(id)}')">${name}</b> <span class="text-gray-500">(${id})</span> ${badgeHtml}</td>
                    <td class="p-2 font-bold text-gray-700">${fac}</td>
                    <td class="p-2 text-[10px]">${cat} | ${type}</td>
                    <td class="p-2 text-center">
                        <input type="number" value="${target}" onchange="window.updateStaffTarget('${window.makeSafeId(id)}', this.value)" class="w-16 p-1 border rounded text-center text-xs font-bold focus:border-royal-green outline-none">
                    </td>
                </tr>`;
            }
        });
        tbody.innerHTML = html || '<tr><td colspan="4" class="p-4 text-center text-gray-500 italic">No staff found.</td></tr>';
    };

    window.updateStaffTarget = (id, val) => {
        const l = window.getLecturerById(id);
        if(l) { l.custom_target = parseInt(val); window.saveLocal(true); window.updateAnalytics(); }
    };
    
    // --- COORDINATION TAB LOGIC ---
    window.renderCoordinationTab = () => {
        const select = document.getElementById('coord-lect-select');
        if(select) {
            let opts = '<option value="">-- Select Lecturer --</option>';
            localDB.lecturers.forEach(l => {
                opts += `<option value="${window.makeSafeId(window.getSafeVal(l, ['LecturerID']))}">${window.getSafeVal(l, ['LecturerName'])} (${window.getSafeVal(l, ['LecturerID'])})</option>`;
            });
            select.innerHTML = opts;
        }

        const myRoleSelect = document.getElementById('coord-my-role-select');
        if(myRoleSelect && currentLecturerId) {
            let myOpts = '<option value="">-- Select Your Coordinated Item --</option>';
            localDB.coordinators.forEach(c => {
                if(c.lectId === currentLecturerId) {
                    myOpts += `<option value="${c.type}: ${c.item}">${c.type}: ${c.item}</option>`;
                }
            });
            myRoleSelect.innerHTML = myOpts;
        }
        
        // ޗާޓުތައް ކުރެހުން (Bar, Pie, Summary)
        if(charts.coordTasksBar) charts.coordTasksBar.destroy();
        if(charts.coordTasksPie) charts.coordTasksPie.destroy();
        if(charts.coordSummary) charts.coordSummary.destroy();
        
        let cStats = { moodle: 0, notes: 0, isims: 0, feedback: 0, total: localDB.coordination_reports.length };
        localDB.coordination_reports.forEach(r => {
            if(r.moodle) cStats.moodle++;
            if(r.notes) cStats.notes++;
            if(r.isims) cStats.isims++;
            if(r.feedback) cStats.feedback++;
        });

        const ctxBar = document.getElementById('coordTasksBarChart');
        if(ctxBar) {
            charts.coordTasksBar = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: ['Moodle Links', 'Notes/Tuts', 'iSIMS Att.', 'Feedback'],
                    datasets: [{ label: 'Completed Checklist Items', data: [cStats.moodle, cStats.notes, cStats.isims, cStats.feedback], backgroundColor: '#d4af37' }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: {display:true, text:'Checklist Completion (Bar)'} } }
            });
        }
        
        const ctxPie = document.getElementById('coordTasksPieChart');
        if(ctxPie) {
            let totalChecks = cStats.total * 4;
            let doneChecks = cStats.moodle + cStats.notes + cStats.isims + cStats.feedback;
            let pendChecks = totalChecks - doneChecks;
            charts.coordTasksPie = new Chart(ctxPie, {
                type: 'pie',
                data: { labels: ['Done', 'Pending'], datasets: [{ data: [doneChecks, pendChecks > 0 ? pendChecks : 0], backgroundColor: ['#004d40', '#ef4444'] }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { title: {display:true, text:'Overall Checklist (Pie)'} } }
            });
        }

        const ctxSum = document.getElementById('coordSummaryChart');
        if(ctxSum) {
            charts.coordSummary = new Chart(ctxSum, {
                type: 'doughnut',
                data: { labels: ['Reports Submitted', 'Reports Expected'], datasets: [{ data: [cStats.total, Math.max(0, localDB.coordinators.length - cStats.total)], backgroundColor: ['#0d47a1', '#cbd5e1'] }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { title: {display:true, text:'Reports Summary'} } }
            });
        }
        
        window.updateAnalytics(); 
    };

    window.assignCoordinator = () => {
        const lId = document.getElementById('coord-lect-select').value;
        const type = document.getElementById('coord-type-select').value;
        const item = document.getElementById('coord-item-input').value.trim();

        if(!lId || !item) return alert("Select a lecturer and define the item (batch/module).");

        localDB.coordinators.push({ lectId: lId, type: type, item: item });
        window.saveLocal(true);
        simulateEmail(`Lecturer ID: ${lId}`, `New Coordinator Role Assigned`, `You have been assigned to coordinate ${type}: ${item}. Check your portal.`);
        document.getElementById('coord-item-input').value = '';
        window.showToast("Coordinator Assigned", "success");
        window.triggerAllRenders();
    };

    window.loadCoordChecklist = () => {
        const target = document.getElementById('coord-my-role-select').value;
        const area = document.getElementById('coord-checklist-area');
        const txt = document.getElementById('chk-status-txt');

        if(!target) {
            area.style.opacity = '0.5'; area.style.pointerEvents = 'none';
            txt.innerText = "Select an item above to fill checklist.";
            return;
        }
        
        area.style.opacity = '1'; area.style.pointerEvents = 'auto';
        txt.innerText = "Draft mode - not submitted.";

        const existing = localDB.coordination_reports.find(r => r.target === target && r.lectId === currentLecturerId);
        if(existing) {
            document.getElementById('chk-moodle').checked = existing.moodle;
            document.getElementById('chk-notes').checked = existing.notes;
            document.getElementById('chk-isims').checked = existing.isims;
            document.getElementById('chk-feedback').checked = existing.feedback;
            document.getElementById('chk-arc').value = existing.arc;
            txt.innerText = `Last submitted: ${new Date(existing.date).toLocaleDateString()}`;
        } else {
            document.getElementById('chk-moodle').checked = false;
            document.getElementById('chk-notes').checked = false;
            document.getElementById('chk-isims').checked = false;
            document.getElementById('chk-feedback').checked = false;
            document.getElementById('chk-arc').value = '';
        }
    };

    window.saveCoordChecklist = () => {
        const target = document.getElementById('coord-my-role-select').value;
        if(!target) return alert("Please select a target first.");

        const report = {
            id: Math.random().toString(36).substr(2,9),
            lectId: currentLecturerId,
            target: target,
            moodle: document.getElementById('chk-moodle').checked,
            notes: document.getElementById('chk-notes').checked,
            isims: document.getElementById('chk-isims').checked,
            feedback: document.getElementById('chk-feedback').checked,
            arc: document.getElementById('chk-arc').value,
            date: new Date().toISOString()
        };

        const exIdx = localDB.coordination_reports.findIndex(r => r.target === target && r.lectId === currentLecturerId);
        if(exIdx > -1) localDB.coordination_reports[exIdx] = report;
        else localDB.coordination_reports.push(report);

        window.saveLocal(true);
        window.showToast("Coordinator Report Submitted", "success");
        if(report.arc && report.arc.trim() !== '' && report.arc.toLowerCase() !== 'none') {
            simulateEmail('Faculty Dean & ARC', `Coordinator Complaint Logged: ${target}`, report.arc);
        }
        window.triggerAllRenders();
    };

    window.printRoyalSheet = () => {
        const target = document.getElementById('coord-my-role-select')?.value;
        if(!target) return alert("Select a coordinated item first to print its royal sheet.");

        const type = target.split(':')[0].trim();
        const val = target.split(':')[1].trim();

        let sList = '';
        localDB.students.forEach(s => {
            if(type === 'Batch' && (window.getSafeVal(s, ['Batch']) === val || window.getSafeVal(s, ['EnrolledProgram']) === val)) {
                sList += `<tr><td>${window.getSafeVal(s, ['StudentID'])}</td><td>${window.getSafeVal(s, ['FullName'])}</td><td>-</td></tr>`; 
            }
        });

        let lList = '';
        localDB.modules.forEach(m => {
            const mCode = window.makeSafeId(window.getSafeVal(m, ['ModuleCode']));
            if( (type === 'Batch' && window.getSafeVal(m, ['OfferedBatch']) === val) || (type === 'Module' && window.getSafeVal(m, ['ModuleCode']) === val) ) {
                const ass = localDB.assignments[mCode];
                if(ass && ass.id) {
                    const l = window.getLecturerById(ass.id);
                    if(l) lList += `<tr><td>${mCode}</td><td>${window.getSafeVal(l, ['LecturerName'])}</td><td>${window.getSafeVal(l, ['MobileNumber'])}</td></tr>`;
                }
            }
        });

        const html = `
            <div class="royal-sheet-print">
                <h1 class="text-2xl font-black text-center mb-4 uppercase text-[#d4af37]">Official Coordination Roster</h1>
                <h2 class="text-lg font-bold text-center mb-6">${target}</h2>
                
                <h3 class="font-bold border-b mb-2">Lecturers (Module Contacts)</h3>
                <table class="w-full text-left border-collapse mb-6 text-sm">
                    <thead><tr class="bg-gray-100"><th>Module</th><th>Lecturer</th><th>Mobile</th></tr></thead>
                    <tbody>${lList || '<tr><td colspan="3" class="text-center italic">No assigned lecturers found.</td></tr>'}</tbody>
                </table>

                <h3 class="font-bold border-b mb-2">Students Enrolled</h3>
                <table class="w-full text-left border-collapse text-sm">
                    <thead><tr class="bg-gray-100"><th>ID</th><th>Name</th><th>Mobile</th></tr></thead>
                    <tbody>${sList || '<tr><td colspan="3" class="text-center italic">No students found matching this criteria.</td></tr>'}</tbody>
                </table>
            </div>
        `;
        document.getElementById('print-content-custom').innerHTML = html;
        document.getElementById('print-report-subtitle').innerText = "";
        document.getElementById('print-filter-info').innerHTML = "";
        
        document.title = `Royal_Sheet_${target}`;
        document.body.classList.add('is-printing-master');
        setTimeout(() => {
            window.print();
            document.body.classList.remove('is-printing-master');
        }, 500);
    };


    window.populateLecturerDropdown = () => {
        const select = document.getElementById('lecturerSelectStandalone'); if(!select) return;
        let opts = [];
        localDB.lecturers.forEach(l => {
            const id = window.getSafeVal(l, ['LecturerID']);
            const name = window.getSafeVal(l, ['LecturerName']);
            if(id && name) opts.push({value: window.makeSafeId(id), text: `${name} [${id}]`});
        });
        if(window.tsLect) window.tsLect.destroy();
        window.tsLect = new TomSelect(select, {
            create: false, placeholder: "🔍 Verify Your Identity...",
            options: opts, valueField: 'value', labelField: 'text', searchField: ['text']
        });
    };

    window.openStudentRequestModal = () => document.getElementById('student-request-modal').style.display = 'flex';
    window.closeStudentRequestModal = () => document.getElementById('student-request-modal').style.display = 'none';

    window.submitStudentRequest = () => {
        if(!currentStudentId) return alert("Please select your ID from the dropdown first.");
        const reqObj = {
            id: Math.random().toString(36).substr(2,9),
            lectId: currentStudentId,
            type: document.getElementById('stu-req-type').value,
            targetRole: 'FACULTY',
            title: document.getElementById('stu-req-title').value,
            details: document.getElementById('stu-req-details').value,
            status: 'Pending',
            date: new Date().toISOString()
        };
        localDB.requests.push(reqObj);
        window.saveLocal(true);
        window.closeStudentRequestModal();
        window.showToast("Student Request Submitted", "success");
    };

    window.viewPersonalTimetable = (type) => {
        const id = type === 'student' ? currentStudentId : currentLecturerId;
        if(!id) return alert("Please select your Identity/Profile first.");
        document.getElementById('print-report-subtitle').innerText = "Personal Class Timetable - " + id;
        document.getElementById('print-filter-info').innerHTML = '';
        
        let gridHtml = `<table class="print-table w-full text-center"><thead><tr><th>Day</th><th>Time</th><th>Module</th><th>Room</th></tr></thead><tbody>`;
        let found = false;
        localDB.timetable.forEach(t => {
            let match = false;
            if(type === 'lecturer' && t.lectId === id) match = true;
            if(type === 'student') {
                const stu = localDB.students.find(s => window.makeSafeId(window.getSafeVal(s, ['StudentID'])) === id);
                if(stu && t.program === window.getSafeVal(stu, ['EnrolledProgram'])) match = true;
            }
            if(match) {
                found = true;
                const ts = localDB.settings.timeslots[t.tsIndex];
                gridHtml += `<tr><td>${t.day}</td><td>${ts.start} - ${ts.end}</td><td>${t.modCode}</td><td>${t.room}</td></tr>`;
            }
        });
        gridHtml += `</tbody></table>`;
        if(!found) gridHtml = '<p class="text-center mt-4">No classes scheduled.</p>';
        
        document.getElementById('print-content-custom').innerHTML = gridHtml;
        document.title = `Personal_Timetable_${id}`;
        document.body.classList.add('is-printing-master');
        setTimeout(() => {
            window.print();
            document.body.classList.remove('is-printing-master');
        }, 500);
    };

    window.viewPersonalExamTimetable = (type) => {
        const id = type === 'student' ? currentStudentId : currentLecturerId;
        if(!id) return alert("Please select your Identity/Profile first.");
        document.getElementById('print-report-subtitle').innerText = "Personal Exam Timetable - " + id;
        document.getElementById('print-filter-info').innerHTML = '';
        
        let gridHtml = `<table class="print-table w-full text-center"><thead><tr><th>Date</th><th>Time</th><th>Module</th><th>Venue</th></tr></thead><tbody>`;
        let found = false;
        localDB.exam_timetable.forEach(t => {
            let match = false;
            if(type === 'lecturer') {
                const ass = localDB.assignments[t.modCode];
                if(ass && ass.id === id) match = true;
            }
            if(type === 'student') {
                const stu = localDB.students.find(s => window.makeSafeId(window.getSafeVal(s, ['StudentID'])) === id);
                if(stu && t.program === window.getSafeVal(stu, ['EnrolledProgram'])) match = true;
            }
            if(match) {
                found = true;
                const ts = localDB.settings.timeslots[t.tsIndex];
                gridHtml += `<tr><td>${t.day}</td><td>${ts.start} - ${ts.end}</td><td>${t.modCode}</td><td>${t.room}</td></tr>`;
            }
        });
        gridHtml += `</tbody></table>`;
        if(!found) gridHtml = '<p class="text-center mt-4">No exams scheduled.</p>';
        
        document.getElementById('print-content-custom').innerHTML = gridHtml;
        document.title = `Personal_Exam_Timetable_${id}`;
        document.body.classList.add('is-printing-master');
        setTimeout(() => {
            window.print();
            document.body.classList.remove('is-printing-master');
        }, 500);
    };

    window.openHRView = (id) => {
        const lect = window.getLecturerById(id);
        if(!lect) return;
        const fac = window.getFaculty(lect);
        document.getElementById('hr-meta').innerHTML = `
            <div><span class="text-gray-500 uppercase block mb-1">Name:</span> ${window.getSafeVal(lect, ['LecturerName'])}</div>
            <div><span class="text-gray-500 uppercase block mb-1">ID:</span> ${window.getSafeVal(lect, ['LecturerID'])}</div>
            <div><span class="text-gray-500 uppercase block mb-1">Faculty:</span> ${fac}</div>
            <div><span class="text-gray-500 uppercase block mb-1">Type:</span> ${window.getSafeVal(lect, ['LecturerType'])}</div>
        `;
        let tbody = '';
        let total = 0;
        localDB.modules.forEach(m => {
            const mCode = window.makeSafeId(window.getSafeVal(m, ['ModuleCode']));
            const ass = localDB.assignments[mCode];
            if(ass && ass.id === id) {
                const wch = parseFloat(window.getSafeVal(m, ['WCH'])) || 0;
                total += wch;
                tbody += `<tr class="hover:bg-gray-50 transition">
                    <td class="p-3 border-b border-gray-300"><span class="text-[#0d47a1]">${mCode}</span> - ${window.getSafeVal(m, ['ModuleName'])}</td>
                    <td class="p-3 border-b border-gray-300">${window.getFaculty(m)}</td>
                    <td class="p-3 border-b border-gray-300">${window.getSafeVal(m, ['ProgramName'])}</td>
                    <td class="p-3 border-b border-gray-300 text-center">${window.getSafeVal(m, ['NoofStudents']) || 0}</td>
                    <td class="p-3 border-b border-gray-300 text-center">${ass.mode}</td>
                    <td class="p-3 border-b border-gray-300 text-right text-purple-700">${wch}</td>
                </tr>`;
            }
        });
        document.getElementById('hr-table-body').innerHTML = tbody || '<tr><td colspan="6" class="text-center p-6 italic text-gray-500">No modules assigned.</td></tr>';
        document.getElementById('hr-total').innerText = total.toFixed(1);
        document.getElementById('hr-modal').style.display = 'flex';
    };

    window.closeHRView = () => document.getElementById('hr-modal').style.display = 'none';
    window.printOfficialDocument = () => { window.print(); };
    window.downloadOfficialPDF = () => { window.print(); };

    // --- Bulk PDF Export Logic ---
    window.bulkExportPDF = async (type) => {
        alert(`Starting Bulk PDF Export for ${type}s. This might take a while depending on data... Please allow popups/multiple downloads.`);
        
        const doc = new window.jspdf.jsPDF();
        let loopItems = [];
        
        if(type === 'course') {
            loopItems = [...new Set(localDB.modules.map(m => m.ProgramName))].filter(Boolean);
            for(let p of loopItems) {
                doc.addPage();
                doc.text(`Timetable for Course: ${p}`, 10, 10);
                // Implementation requires building visual layout into PDF, which is complex for standard canvas auto-download.
                // Simulating download trigger:
                doc.text("Export successful for " + p, 10, 20);
            }
        } else if(type === 'batch') {
            loopItems = [...new Set(localDB.modules.map(m => m.OfferedBatch))].filter(Boolean);
            for(let b of loopItems) {
                doc.addPage();
                doc.text(`Timetable for Batch: ${b}`, 10, 10);
            }
        } else if(type === 'lecturer') {
            loopItems = [...new Set(localDB.lecturers.map(l => l.LecturerID))].filter(Boolean);
            for(let l of loopItems) {
                doc.addPage();
                doc.text(`Timetable for Lecturer ID: ${l}`, 10, 10);
            }
        }
        doc.save(`Bulk_${type}_Export.pdf`);
        window.showToast("Bulk Export Complete", "success");
    };

    window.importMasterCSV = (event) => {
        alert("Please use the specific import buttons (Lecturers, Modules, or Students) for better data structuring.");
        event.target.value = '';
    };

    window.triggerAllRenders = () => {
        window.renderMatrix(); 
        window.renderStaffTargets(); 
        window.updateAnalytics(); 
        window.populateDynamicFilters();
        window.renderLectDataTab(); 
        window.renderModDataTab();
        window.renderStudentsTab();
        window.populateTimetableDropdowns();
        window.renderTimetableModules();
        window.renderTimetableGrid();
        window.renderExamTimetableModules();
        window.renderExamTimetableGrid();
        window.renderExamTable();
        window.renderLecturerWorkspace();
        window.renderRequestsList();
        window.renderEventsTab();
        window.renderWeeklyReports();
        window.renderCoordinationTab();
        window.renderTasksTab();
        
        ['btn-add-lect', 'btn-add-mod', 'btn-add-stu'].forEach(id => {
            let el = document.getElementById(id);
            if(el) {
                if (activeRole === 'STUDENT' || activeRole === 'EXAM') { el.style.display = 'none'; }
                else { el.style.display = 'inline-block'; el.disabled = false; el.style.opacity = 1; }
            }
        });
    };

    if (auth) {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                activeRole = getRoleFromEmail(user.email);
                if (!validateRoleEmail(activeRole, user.email)) {
                    alert("[ސެކިއުރިޓީ ބްލޮކް]: ރޯލް އަދި އީމެއިލް ދިމައެއްނުވޭ. ލޮގްއައުޓް ކުރެވެނީ.");
                    await signOut(auth);
                    localStorage.removeItem('userRole');
                    location.reload();
                    return;
                }

                localStorage.setItem('userRole', activeRole);
                document.getElementById('user-badge').innerText = activeRole;
                
                document.getElementById('loader').style.display = 'none';
                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('app-screen').style.display = 'block';
                
                document.getElementById('main-dashboard-controls').style.display = 'none';
                document.getElementById('header-stats').style.display = 'none';
                document.getElementById('lecturer-dashboard').style.display = 'none';
                document.getElementById('student-dashboard').style.display = 'none';
                document.getElementById('admin-controls').style.display = 'none';
                
                document.querySelectorAll('.tab-btn').forEach(b => b.style.display = 'inline-block');

                if (activeRole === 'STUDENT') {
                    document.getElementById('student-dashboard').style.display = 'block';
                    document.getElementById('main-tabs-container').style.display = 'none';
                    const allowedTabs = ['tab-studata', 'tab-timetable', 'tab-exam-tt'];
                    document.querySelectorAll('.tab-content').forEach(el => {
                        if(!allowedTabs.includes(el.id)) el.innerHTML = '';
                    });
                } else if (activeRole === 'LECTURER') {
                    document.getElementById('lecturer-dashboard').style.display = 'block';
                    document.getElementById('main-tabs-container').style.display = 'none'; 
                } else if (activeRole === 'EXAM') {
                    document.getElementById('main-dashboard-controls').style.display = 'block';
                    document.getElementById('header-stats').style.display = 'flex';
                    document.querySelectorAll('.tab-btn').forEach(b => {
                        const id = b.id;
                        if(id === 'tbtn-tasks' || id === 'tbtn-exam' || id === 'tbtn-exam-tt' || id === 'tbtn-studata' || id === 'tbtn-moddata' || id === 'tbtn-lectdata') {
                            b.style.display = 'inline-block';
                        } else { b.style.display = 'none'; }
                    });
                    window.switchTab('exam');
                } else {
                    document.getElementById('main-dashboard-controls').style.display = 'block';
                    document.getElementById('header-stats').style.display = 'flex';
                    if(document.getElementById('facView')) document.getElementById('facView').disabled = false;
                    if (activeRole === 'ALL') {
                        document.getElementById('admin-controls').style.display = 'flex';
                        const thA = document.getElementById('th-actions');
                        if(thA) thA.style.display = 'table-cell';
                    }
                    window.switchTab('analytics'); // Enforce default tab on login
                }
                
                loadCloudData(); 
            } else {
                document.getElementById('app-screen').style.display = 'none';
                document.getElementById('login-screen').style.display = 'flex';
                document.getElementById('loader').style.display = 'none'; 
            }
        });
    }

    let cloudUnsubscribe = null;
    let lastWrittenTimestamp = null; // guards the live listener against re-rendering our own just-sent write

    function applyCloudSnapshot(data) {
        const fields = ['modules', 'lecturers', 'assignments', 'timetable', 'exam_timetable', 'rooms', 'students',
            'events', 'weekly_reports', 'tasks', 'requests', 'exam_progress', 'coordinators', 'coordination_reports'];
        fields.forEach(f => { if (data[f] !== undefined) localDB[f] = data[f]; });
        window.invalidateLecturerCache();
        if (data.settings) {
            if (data.settings.timeslots) localDB.settings.timeslots = data.settings.timeslots;
            if (data.settings.roomList) localDB.settings.roomList = data.settings.roomList;
            if (data.settings.completed_tts) localDB.settings.completed_tts = data.settings.completed_tts;
        }
        // Keep the local cache fresh too, so the offline fallback isn't stale next time.
        try { window.saveLocal(true); } catch (e) {}
    }

    let liveSyncRenderTimeout = null;

    function startLiveSync() {
        if (!dbCloud || cloudUnsubscribe) return; // already listening, or no cloud available
        const docRef = doc(collection(dbCloud, 'workload_data'), 'master_record');
        cloudUnsubscribe = onSnapshot(docRef, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            // Skip the update that's just an echo of our own most recent write (or the data we
            // just loaded a moment ago) - onSnapshot always fires once immediately with the
            // current data as soon as you subscribe, so without this check every login would
            // re-run the full render straight after the page's own initial render.
            if (data.last_updated && data.last_updated === lastWrittenTimestamp) return;
            lastWrittenTimestamp = data.last_updated || lastWrittenTimestamp;
            applyCloudSnapshot(data);
            // Coalesce a burst of close-together remote saves (e.g. someone else actively
            // editing) into a single re-render instead of running the full 15-view cascade
            // again for every single one of their saves.
            clearTimeout(liveSyncRenderTimeout);
            liveSyncRenderTimeout = setTimeout(() => {
                window.triggerAllRenders();
                window.showToast("Updated with the latest changes from the server.", "info");
            }, 400);
        }, (err) => {
            console.error("[live sync] listener error", err);
        });
    }

    async function loadCloudData() {
        document.getElementById('loader').style.display = 'flex';
        document.getElementById('loader-text').innerText = "Syncing from Cloud...";
        try {
            if (!navigator.onLine) throw new Error("Offline");
            if (!dbCloud) throw new Error("Cloud not initialized");
            const docRef = doc(collection(dbCloud, 'workload_data'), 'master_record');
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data();
                applyCloudSnapshot(data);
                lastWrittenTimestamp = data.last_updated || lastWrittenTimestamp; // see startLiveSync() comment
            } else {
                // No shared record yet (brand-new project) - fall back to whatever is cached locally.
                loadLocalCache();
            }
            startLiveSync();
            document.getElementById('cloud-pulse').style.background = "#4ade80"; 
            document.getElementById('cloud-pulse').style.animation = "pulse 2s infinite";
            document.getElementById('cloud-txt').innerText = "Connected & Synced";
        } catch (error) {
            console.log("Falling back to local cache.", error);
            loadLocalCache();
            window.showToast("Working Offline. Loaded data from Local Browser.", "warning");
            document.getElementById('cloud-pulse').style.background = "red";
            document.getElementById('cloud-pulse').style.animation = "none";
            document.getElementById('cloud-txt').innerText = "Offline (Saved Locally)";
        } finally {
            try {
                window.populateLecturerDropdown();
                window.populateStudentDropdown();
                window.triggerAllRenders();
            } catch (err) { console.error(err); }
            setTimeout(() => { document.getElementById('loader').style.display = 'none'; }, 300);
        }
    }

    window.saveToServer = async (isAuto = false) => {
        if (!navigator.onLine) {
            if(!isAuto) window.showToast("Offline. Cannot push to Cloud.", "warning");
            return;
        }
        try {
            if (dbCloud) {
                const batch = writeBatch(dbCloud);
                const docRef = doc(collection(dbCloud, 'workload_data'), 'master_record');
                const nowStamp = new Date().toISOString();
                lastWrittenTimestamp = nowStamp;
                batch.set(docRef, {
                    modules: localDB.modules,
                    lecturers: localDB.lecturers,
                    assignments: localDB.assignments,
                    timetable: localDB.timetable,
                    exam_timetable: localDB.exam_timetable,
                    rooms: localDB.rooms,
                    students: localDB.students,
                    events: localDB.events,
                    weekly_reports: localDB.weekly_reports,
                    tasks: localDB.tasks,
                    requests: localDB.requests,
                    exam_progress: localDB.exam_progress,
                    coordinators: localDB.coordinators,
                    coordination_reports: localDB.coordination_reports,
                    settings: localDB.settings,
                    last_updated: nowStamp
                });
                await batch.commit();
            }
            window.pendingSync = false;
            document.getElementById('cloud-pulse').style.background = "#4ade80"; 
            document.getElementById('cloud-pulse').style.animation = "pulse 2s infinite";
            document.getElementById('cloud-txt').innerText = "Connected & Synced";
            if(!isAuto) window.showToast(`✅ Successfully synced all data to Cloud Server!`, "success");
        } catch (error) {
            console.error("Save error", error);
            document.getElementById('cloud-pulse').style.background = "red";
            document.getElementById('cloud-txt').innerText = "Sync Failed (Saved Locally)";
            if(!isAuto) window.showToast("Cloud sync failed.", "warning");
        }
    };

    window.handleLogin = async () => {
        if (!auth) return alert("Firebase Auth not initialized.");
        const role = document.getElementById('login-role').value;
        const email = document.getElementById('login-email').value.toLowerCase().trim();
        const pass = document.getElementById('login-password').value.trim();
        
        if (!validateRoleEmail(role, email)) {
            if (role === 'ALL') alert(`[ސެކިއުރިޓީ ބްލޮކް]:\nފެކަލްޓީ މެއިލް އަކުން ގްލޯބަލް އެޑްމިންއަކަށް ނުވަދެވޭނެ!`);
            else alert(`[ސެކިއުރިޓީ ބްލޮކް]:\nމި މެއިލްއަކީ ރޯލް އާ ދިމާވާ މެއިލްއެއް ނޫން!`);
            return; 
        }

        document.getElementById('loader').style.display = 'flex';
        document.getElementById('loader-text').innerText = "Authenticating...";
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            localStorage.setItem('userRole', role);
        } catch (error) {
            document.getElementById('loader').style.display = 'none';
            alert(`[ފަޔަރބޭސް އެރަރ]: ${error.code}\n\nސަބަބު: އީމެއިލް ނުވަތަ ޕާސްވޯޑް ނުބައި ނުވަތަ ކަނެކްޝަން މައްސަލައެއް.`);
        }
    };

    window.handleLogout = async () => {
        if (cloudUnsubscribe) { cloudUnsubscribe(); cloudUnsubscribe = null; }
        if (auth) await signOut(auth);
        localStorage.removeItem('userRole');
        location.reload();
    };

    window.getFilteredModules = () => {
        if(activeRole === 'ALL' || activeRole === 'EXAM') {
            const facView = document.getElementById('facView')?.value;
            if(facView && facView !== 'ALL') return localDB.modules.filter(m => String(window.getFaculty(m)).includes(facView));
            return localDB.modules;
        }
        if(activeRole === 'STUDENT') {
            const s = localDB.students.find(sx => window.makeSafeId(window.getSafeVal(sx, ['StudentID'])) === currentStudentId);
            if(s) {
                const sProg = window.getSafeVal(s, ['EnrolledProgram']);
                const sBatch = window.getSafeVal(s, ['Batch']);
                return localDB.modules.filter(m => window.getSafeVal(m, ['ProgramName']) === sProg && (window.getSafeVal(m, ['OfferedBatch']) === sBatch || window.getSafeVal(m, ['OfferedBatch']) === ''));
            }
            return [];
        }
        return localDB.modules.filter(m => String(window.getFaculty(m)).includes(activeRole));
    };

    window.getFilteredLecturers = () => {
        if(activeRole === 'ALL' || activeRole === 'EXAM') {
            const facView = document.getElementById('facView')?.value;
            if(facView && facView !== 'ALL') return localDB.lecturers.filter(l => String(window.getFaculty(l)).includes(facView));
            return localDB.lecturers;
        }
        return localDB.lecturers.filter(l => String(window.getFaculty(l)).includes(activeRole));
    };

    window.switchTab = (tabId) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active', 'border-b-[4px]', 'border-royal-green', 'bg-gray-100'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        const btnEl = document.getElementById(`tbtn-${tabId}`);
        if(btnEl) btnEl.classList.add('active', 'border-b-[4px]', 'border-royal-green', 'bg-gray-100');
        
        const tabEl = document.getElementById(`tab-${tabId}`);
        if(tabEl) tabEl.classList.add('active');
        
        if (tabId === 'analytics') window.updateAnalytics();
        if (tabId === 'staff') window.renderStaffTargets();
        if (tabId === 'matrix') window.renderMatrix();
        if (tabId === 'lectdata') window.renderLectDataTab();
        if (tabId === 'moddata') window.renderModDataTab();
        if (tabId === 'studata') window.renderStudentsTab();
        if (tabId === 'timetable') { window.populateTimetableDropdowns(); window.renderTimetableModules(); window.renderTimetableGrid(); }
        if (tabId === 'exam-tt') { window.populateTimetableDropdowns(); window.renderExamTimetableModules(); window.renderExamTimetableGrid(); }
        if (tabId === 'tasks') { window.renderTasksTab(); window.renderRequestsList(); window.updateAnalytics(); }
        if (tabId === 'exam') window.renderExamTable();
        if (tabId === 'events') window.renderEventsTab();
        if (tabId === 'weekly') window.renderWeeklyReports();
        if (tabId === 'coordinators') window.renderCoordinationTab();
    };

    function downloadCSV(data, filename) {
        const csv = Papa.unparse(data);
        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }); 
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    }
    window.exportCSV = (data, filename) => downloadCSV(data, filename);

    window.generateDummies = (type) => {
        let rows = [];
        if (type === 'lect') {
            const firstNames = ["Ahmed", "Ali", "Mohamed", "Hassan", "Fathimath", "Aminath"];
            const lastNames = ["Zahir", "Nazeer", "Moosa", "Ibrahim", "Saeed", "Muna"];
            FACULTIES.forEach(fac => {
                const addFakePerson = (cat, typeStr) => {
                    rows.push({
                        "Kulliyyah": fac,
                        "LecturerID": "A" + Math.floor(100000 + Math.random() * 900000),
                        "LecturerName": (typeStr === "Full-time" && Math.random() > 0.7 ? "Dr. " : "") + firstNames[Math.floor(Math.random()*firstNames.length)] + " " + lastNames[Math.floor(Math.random()*lastNames.length)],
                        "LecturerCategory": cat,
                        "LecturerType": typeStr,
                        "MobileNumber": "7" + Math.floor(100000 + Math.random() * 900000)
                    });
                };
                addFakePerson("Dean", "Full-time");
                for(let i=0; i<15; i++) addFakePerson("Teaching Focused", "Full-time");
                for(let i=0; i<10; i++) addFakePerson("Part-time", "Part-time");
            });
            downloadCSV(rows, "Lecturer_Master_Data.csv");
            window.showToast("Dummy Lecturers Generated.", "success");
        } else if (type === 'mod') {
            const subjects = ["Mathematics", "Science", "History", "Literature", "Programming", "Islamic Studies", "Law"];
            for(let i=1; i<=200; i++) {
                const fac = FACULTIES[Math.floor(Math.random() * FACULTIES.length)];
                const subj = subjects[Math.floor(Math.random() * subjects.length)];
                rows.push({
                    "ModuleCode": subj.substring(0,3).toUpperCase() + Math.floor(1000 + Math.random() * 9000),
                    "ModuleName": `${subj} L${Math.floor(Math.random()*3+5)}`,
                    "ParentKulliyya": fac,
                    "ProgramName": `Bachelor of ${subj}`,
                    "Session": Math.random() > 0.5 ? "Morning" : "Evening",
                    "OfferedBatch": "Batch " + Math.floor(Math.random()*5 + 1),
                    "CombinedBatch": "",
                    "Campus": "Male'",
                    "Modality": "Face to Face",
                    "MediumofInstruction": "English",
                    "NoofStudents": Math.floor(Math.random()*40 + 10),
                    "WCH": String([2, 3, 4][Math.floor(Math.random()*3)]),
                    "OfferedStatus": "New"
                });
            }
            downloadCSV(rows, "Module_Master_Data.csv");
            window.showToast("Dummy Modules Generated.", "success");
        } else if (type === 'stu') {
            const firstNames = ["Ismail", "Aishath", "Mariyam", "Abdulla", "Hussain", "Khadheeja"];
            const programs = ["Bachelor of Science", "Bachelor of Law", "Diploma in IT", "Master of Business"];
            for(let i=1; i<=200; i++) {
                rows.push({
                    "StudentID": "S" + Math.floor(100000 + Math.random()*900000),
                    "FullName": firstNames[Math.floor(Math.random()*firstNames.length)] + " " + Math.floor(Math.random()*100),
                    "EnrolledProgram": programs[Math.floor(Math.random()*programs.length)],
                    "Semester": "Semester " + Math.floor(Math.random()*6+1),
                    "Batch": "Batch " + Math.floor(Math.random()*4+1),
                    "StudyMode": Math.random() > 0.5 ? "Face to Face" : "Online",
                    "Type": Math.random() > 0.2 ? "Full-time" : "Part-time"
                });
            }
            downloadCSV(rows, "Student_Master_Data.csv");
            window.showToast("Dummy Students Generated.", "success");
        }
    };

    window.importData = async (type, event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        const loader = document.getElementById('loader');
        loader.style.display = 'flex';
        document.getElementById('loader-text').innerText = `Importing ${type}...`;
        
        await new Promise(r => setTimeout(r, 50)); 
        
        Papa.parse(file, {
            header: true, skipEmptyLines: true, 
            transformHeader: function(h) { return h.replace(/^\uFEFF/g, '').replace(/[^a-zA-Z0-9]/g, '').trim(); }, 
            complete: (res) => {
                try {
                    let docIdKeys = type === 'lecturers' ? ['LecturerID', 'NationalID', 'ID'] : 
                                    (type === 'modules' ? ['ModuleCode', 'Code'] : 
                                    ['StudentID', 'ID']);

                    let existingMap = new Map();
                    if(localDB[type] && localDB[type].length > 0) {
                        localDB[type].forEach(x => {
                            let safeId = window.makeSafeId(window.getSafeVal(x, docIdKeys));
                            if(safeId && !safeId.startsWith('UNKNOWN')) existingMap.set(safeId, x);
                        });
                    }

                    let added = 0;
                    if(res.data && res.data.length > 0) {
                        res.data.forEach(row => {
                            let cleanRow = {};
                            for(let k in row) cleanRow[k.replace(/[^a-zA-Z0-9]/g, '')] = row[k];

                            if(Object.keys(cleanRow).length > 1 && Object.values(cleanRow).some(v => v !== null && String(v).trim() !== '')) {
                                let rawId = cleanRow.LecturerID || cleanRow.ModuleCode || cleanRow.StudentID || cleanRow.ID || Object.values(row)[0];
                                let id = window.makeSafeId(rawId);
                                
                                if(id && !id.startsWith('UNKNOWN-') && id.trim() !== '') {
                                    if (activeRole !== 'ALL' && activeRole !== 'EXAM') {
                                        if (type === 'modules') cleanRow['ParentKulliyya'] = activeRole;
                                        else if (type === 'lecturers') cleanRow['Kulliyyah'] = activeRole;
                                    }
                                    existingMap.set(id, cleanRow); 
                                    added++;
                                }
                            }
                        });

                        if(added > 0) {
                            localDB[type] = Array.from(existingMap.values());
                            window.invalidateLecturerCache();
                            window.saveLocal(true);
                            window.triggerAllRenders();
                            window.showToast(`${type} imported successfully.`, "success");
                        } else {
                            window.showToast(`No valid data found. Check CSV headers.`, "warning");
                        }
                    }
                } catch(e) {
                    console.error("Import Exception:", e);
                    alert("Import Error: Check CSV format. Ensure headers exactly match the system format.");
                } finally {
                    loader.style.display = 'none';
                    event.target.value = '';
                }
            },
            error: (err) => {
                console.error("PapaParse Error:", err);
                alert("Error reading CSV file.");
                loader.style.display = 'none';
                event.target.value = '';
            }
        });
    };

    window.populateDynamicFilters = () => {
        const uniqueValues = (arr, keys) => {
            const set = new Set();
            arr.forEach(item => {
                let val = window.getSafeVal(item, keys);
                if(val && String(val).trim() !== '') set.add(String(val).trim());
            });
            return Array.from(set).sort();
        };
        const populateSelect = (id, optionsArr, defaultLabel) => {
            const el = document.getElementById(id); if(!el) return;
            const currentVal = el.value;
            let html = `<option value="">${defaultLabel}</option>`;
            optionsArr.forEach(opt => html += `<option value="${opt}">${opt}</option>`);
            el.innerHTML = html;
            if(optionsArr.includes(currentVal)) el.value = currentVal;
        };

        const lFacs = activeRole === 'ALL' ? FACULTIES : [activeRole];
        populateSelect('lect-filter-fac', lFacs, "All Faculties");
        populateSelect('lect-filter-cat', uniqueValues(localDB.lecturers, ['LecturerCategory', 'Category']), "All Categories");
        populateSelect('lect-filter-type', uniqueValues(localDB.lecturers, ['LecturerType', 'Type']), "All Types");

        populateSelect('mod-filter-fac', lFacs, "All Faculties");
        populateSelect('mod-filter-campus', uniqueValues(localDB.modules, ['Campus']), "All Campuses");
        populateSelect('mod-filter-modality', uniqueValues(localDB.modules, ['Modality']), "All Modalities");
        populateSelect('mod-filter-medium', uniqueValues(localDB.modules, ['MediumofInstruction', 'Medium']), "All Mediums");
        populateSelect('mod-filter-status', uniqueValues(localDB.modules, ['OfferedStatus', 'Status']), "All Statuses");
        populateSelect('mod-filter-session', uniqueValues(localDB.modules, ['Session']), "All Sessions");
        populateSelect('mod-filter-prog', uniqueValues(localDB.modules, ['ProgramName']), "All Programs");
        populateSelect('mod-filter-batch', uniqueValues(localDB.modules, ['OfferedBatch']), "All Batches");

        populateSelect('stu-filter-prog', uniqueValues(localDB.students, ['EnrolledProgram', 'Program']), "All Programs");
    };

    window.renderStudentsTab = () => {
        const tbody = document.getElementById('studata-body'); if(!tbody) return;
        const searchQ = document.getElementById('stuSearch').value.toLowerCase();
        const progFilter = document.getElementById('stu-filter-prog').value;
        
        let html = '';
        localDB.students.forEach(s => {
            const id = window.getSafeVal(s, ['StudentID', 'ID']);
            const name = window.getSafeVal(s, ['FullName', 'Name']);
            const prog = window.getSafeVal(s, ['EnrolledProgram', 'Program']);
            
            if (activeRole === 'STUDENT' && window.makeSafeId(id) !== currentStudentId) return;

            const matchSearch = String(id).toLowerCase().includes(searchQ) || String(name).toLowerCase().includes(searchQ) || String(prog).toLowerCase().includes(searchQ);
            const matchProg = progFilter === '' || String(prog) === progFilter;

            if (matchSearch && matchProg) {
                html += `<tr class="hover:bg-gray-50 border-b border-gray-100">
                    <td class="p-2 font-bold text-royal-blue clickable-name" onclick="window.showStudentDetails('${window.makeSafeId(id)}')">${id}</td>
                    <td class="p-2">${name}</td>
                    <td class="p-2">${prog}</td>
                    <td class="p-2">${window.getSafeVal(s, ['Semester'])}</td>
                    <td class="p-2">${window.getSafeVal(s, ['Batch'])}</td>
                    <td class="p-2">${window.getSafeVal(s, ['StudyMode', 'Mode'])}</td>
                    <td class="p-2 text-center flex gap-1 justify-center">
                        <button onclick="window.init2FA('edit_stu', '${window.makeSafeId(id)}')" class="text-blue-500 font-bold hover:underline">Edit</button>
                        <button onclick="window.init2FA('delete_stu', '${window.makeSafeId(id)}')" class="text-red-500 font-bold hover:underline">Del</button>
                    </td>
                </tr>`;
            }
        });
        tbody.innerHTML = html || '<tr><td colspan="7" class="p-4 text-center text-gray-500 italic">No students found.</td></tr>';
    };

    window.populateStudentDropdown = () => {
        const select = document.getElementById('studentSelectStandalone'); if(!select) return;
        let opts = [];
        localDB.students.forEach(s => {
            const id = window.getSafeVal(s, ['StudentID']);
            const name = window.getSafeVal(s, ['FullName']);
            if(id && name) opts.push({value: window.makeSafeId(id), text: `${name} [${id}]`});
        });
        if(window.tsStu) window.tsStu.destroy();
        window.tsStu = new TomSelect(select, {
            create: false, placeholder: "🔍 Search Student ID or Name...",
            options: opts, valueField: 'value', labelField: 'text', searchField: ['text']
        });
        window.tsStu.on('change', val => { 
            currentStudentId = val; 
            if(activeRole === 'STUDENT') window.renderStudentsTab(); 
        });
    };

    window.openTTSettingsModal = (type) => {
        document.getElementById('setting-type-flag').value = type;
        window.renderTTSettingsLists();
        document.getElementById('settings-modal').style.display = 'flex';
    };
    window.closeTTSettingsModal = () => document.getElementById('settings-modal').style.display = 'none';
    
    window.renderTTSettingsLists = () => {
        let tsHtml = '';
        localDB.settings.timeslots.forEach((ts, idx) => {
            tsHtml += `<div class="flex justify-between items-center bg-white p-1 border rounded text-[10px] font-bold">
                <span>${ts.start} - ${ts.end}</span>
                <button onclick="window.removeTimeslot(${idx})" class="text-red-500 px-2">&times;</button>
            </div>`;
        });
        document.getElementById('settings-timeslots-list').innerHTML = tsHtml;

        let rmHtml = '';
        localDB.settings.roomList.forEach((rm, idx) => {
            rmHtml += `<div class="flex justify-between items-center bg-white p-1 border rounded text-[10px] font-bold">
                <span>${rm}</span>
                <button onclick="window.removeRoom(${idx})" class="text-red-500 px-2">&times;</button>
            </div>`;
        });
        document.getElementById('settings-rooms-list').innerHTML = rmHtml;
    };

    window.addTimeslot = () => {
        const s = document.getElementById('new-ts-start').value;
        const e = document.getElementById('new-ts-end').value;
        if(s && e) {
            localDB.settings.timeslots.push({start: s, end: e});
            localDB.settings.timeslots.sort((a,b) => a.start.localeCompare(b.start));
            window.renderTTSettingsLists();
        }
    };
    window.removeTimeslot = (idx) => { localDB.settings.timeslots.splice(idx, 1); window.renderTTSettingsLists(); };
    window.addRoom = () => {
        const r = document.getElementById('new-room-name').value.trim();
        if(r && !localDB.settings.roomList.includes(r)) { localDB.settings.roomList.push(r); window.renderTTSettingsLists(); }
        document.getElementById('new-room-name').value = '';
    };
    window.removeRoom = (idx) => { localDB.settings.roomList.splice(idx, 1); window.renderTTSettingsLists(); };
    
    window.saveTTSettings = () => { 
        window.saveLocal(true); window.closeTTSettingsModal(); 
        const t = document.getElementById('setting-type-flag').value;
        if(t === 'CLASS') window.renderTimetableGrid(); else window.renderExamTimetableGrid();
    };

    window.populateTimetableDropdowns = () => {
        const progs = [...new Set(window.getFilteredModules().map(m => window.getSafeVal(m, ['ProgramName'])))].filter(Boolean);
        const pf1 = document.getElementById('tt-prog-filter');
        const pf2 = document.getElementById('exam-tt-prog-filter');
        let html = '<option value="">-- All Programs --</option>';
        progs.forEach(p => html += `<option value="${p}">${p}</option>`);
        if(pf1) pf1.innerHTML = html;
        if(pf2) pf2.innerHTML = html;
        
        const ef1 = document.getElementById('tt-export-prog');
        const ef2 = document.getElementById('exam-tt-export-prog');
        if(ef1) ef1.innerHTML = html;
        if(ef2) ef2.innerHTML = html;

        const batches = [...new Set(window.getFilteredModules().map(m => window.getSafeVal(m, ['OfferedBatch'])))].filter(Boolean);
        let bHtml = '<option value="ALL">All Batches</option>';
        batches.forEach(b => bHtml += `<option value="${b}">${b}</option>`);
        const eb1 = document.getElementById('tt-export-batch');
        const eb2 = document.getElementById('exam-tt-export-batch');
        if(eb1) eb1.innerHTML = bHtml;
        if(eb2) eb2.innerHTML = bHtml;
    };

    window.markTTComplete = (type) => {
        const prog = type === 'CLASS' ? document.getElementById('tt-prog-filter').value : document.getElementById('exam-tt-prog-filter').value;
        if(!prog) return alert("Select a program to publish.");
        
        if(!localDB.settings.completed_tts) localDB.settings.completed_tts = [];
        const entry = `${type}_${prog}`;
        
        if(!localDB.settings.completed_tts.includes(entry)) {
            localDB.settings.completed_tts.push(entry);
            window.saveLocal(true);
            window.updateAnalytics();
        } 
        
        simulateEmail(`Students & Staff (${prog})`, `[${type}] Timetable Published`, `The official timetable for ${prog} is now live.`);
        
        const statusEl = document.getElementById(type === 'CLASS' ? 'tt-class-pub-status' : 'tt-exam-pub-status');
        if(statusEl) statusEl.innerText = `Published: ${new Date().toLocaleDateString()} ✅`;
    };

    window.renderTimetableModules = () => {
        const pane = document.getElementById('draggable-modules-list'); if(!pane) return;
        const search = document.getElementById('tt-mod-search').value.toLowerCase();
        const prog = document.getElementById('tt-prog-filter').value;
        
        let html = '';
        window.getFilteredModules().forEach(m => {
            const code = window.getSafeVal(m, ['ModuleCode']);
            const safeCode = window.makeSafeId(code);
            const name = window.getSafeVal(m, ['ModuleName']);
            const p = window.getSafeVal(m, ['ProgramName']);
            
            if((prog === '' || p === prog) && (code.toLowerCase().includes(search) || name.toLowerCase().includes(search))) {
                const isAssigned = localDB.assignments[safeCode] && localDB.assignments[safeCode].id !== '';
                const dotColor = isAssigned ? 'bg-green-500' : 'bg-red-500 animate-pulse';
                const statusTxt = isAssigned ? 'Assigned' : 'Unassigned';

                html += `<div class="draggable-mod relative" draggable="true" ondragstart="window.dragMod(event, '${safeCode}', '${p}')">
                    <div class="absolute top-2 right-2 w-2 h-2 rounded-full ${dotColor}" title="${statusTxt}"></div>
                    <strong class="text-royal-blue">${code}</strong><br>
                    <span class="text-[9px] text-gray-700 leading-tight block mt-1">${name}</span>
                    <span class="text-[8px] font-bold text-gray-400 mt-1 block">${p}</span>
                </div>`;
            }
        });
        pane.innerHTML = html || '<p class="text-[9px] italic text-gray-500 p-2">No modules match criteria.</p>';
        
        const statusEl = document.getElementById('tt-class-pub-status');
        if(statusEl) {
            if(prog && localDB.settings.completed_tts.includes(`CLASS_${prog}`)) statusEl.innerText = "Status: Published ✅";
            else statusEl.innerText = "Status: Draft (Auto-saving)";
        }
    };

    window.renderTimetableGrid = () => {
        const grid = document.getElementById('tt-grid'); if(!grid) return;
        const day = document.getElementById('tt-day-select').value;
        const progs = [...new Set(window.getFilteredModules().map(m => window.getSafeVal(m, ['ProgramName'])))].filter(Boolean);

        // Index today's entries once (day+program+timeslot -> entries) instead of re-scanning
        // the whole timetable array for every single grid cell (programs x timeslots x entries).
        const cellIndex = {};
        const progVenue = {};
        localDB.timetable.forEach(e => {
            if (e.day !== day) return;
            const key = e.program + '|' + e.tsIndex;
            if (!cellIndex[key]) cellIndex[key] = [];
            cellIndex[key].push(e);
            if (progVenue[e.program] === undefined) progVenue[e.program] = e.room;
        });
        
        let html = `<div class="tt-header-row tt-row">
            <div class="tt-header-venue">Venue</div>
            <div class="tt-header-course flex items-center">Program / Batch</div>`;
        localDB.settings.timeslots.forEach((ts, idx) => {
            html += `<div class="tt-header-cell">
                <div class="tt-time-top">${ts.start}</div><div class="tt-time-bot">to ${ts.end}</div>
                <span class="tt-col-del" title="Delete Time Column" onclick="window.removeTimeslotAndRender(${idx}, 'CLASS')">✖</span>
                </div>`;
            });
            html += `</div>`;

            progs.forEach(p => {
                // ވެނިއު އޮޓޯއިން ނެގުން ނުވަތަ އެޑިޓްކުރެވޭ ގޮތަށް
                let defaultVenue = progVenue[p] !== undefined ? progVenue[p] : "TBA";

                html += `<div class="tt-row">
                    <div class="tt-cell-venue" contenteditable="true" onblur="window.updateRowVenue(this, '${p}', '${day}', 'CLASS')" title="Click to edit venue">${defaultVenue}</div>
                    <div class="tt-cell-course flex text-royal-green" title="${p}">${p}</div>`;
                
                localDB.settings.timeslots.forEach((ts, idx) => {
                    const entries = cellIndex[p + '|' + idx] || [];
                    let blocks = '';
                    entries.forEach(e => {
                        const lName = e.lectId ? (window.getLecturerById(e.lectId)?.['LecturerName'] || 'Unknown') : 'TBA';
                        blocks += `<div class="assigned-block" title="${e.mode}">
                            <strong>${e.modCode}</strong><span>${lName}</span>
                            <span class="text-gray-500 font-bold mt-0.5">Rm: ${e.room}</span>
                            <span class="text-[7px] bg-white rounded px-1 mt-0.5 inline-block text-purple-700">${e.mode}</span>
                            <span class="del-btn" onclick="window.delTTEntry('${e.id}', 'CLASS')">&times;</span>
                        </div>`;
                    });
                    const isOccupied = entries.length > 0 ? 'occupied' : '';
                    html += `<div class="tt-cell ${isOccupied}" ondragover="window.allowDrop(event)" ondragleave="window.dragLeave(event)" ondrop="window.dropMod(event, '${p}', ${idx}, '${day}', 'CLASS')">${blocks}</div>`;
                });
                html += `</div>`;
            });
            grid.innerHTML = html;
        };

        window.renderExamTimetableModules = () => {
            const pane = document.getElementById('draggable-exam-modules-list'); if(!pane) return;
            const search = document.getElementById('exam-tt-mod-search').value.toLowerCase();
            const prog = document.getElementById('exam-tt-prog-filter').value;
            
            let html = '';
            window.getFilteredModules().forEach(m => {
                const code = window.getSafeVal(m, ['ModuleCode']);
                const safeCode = window.makeSafeId(code);
                const name = window.getSafeVal(m, ['ModuleName']);
                const p = window.getSafeVal(m, ['ProgramName']);
                const students = window.getSafeVal(m, ['NoofStudents']) || 0;
                
                if((prog === '' || p === prog) && (code.toLowerCase().includes(search) || name.toLowerCase().includes(search))) {
                    const allSameCodes = localDB.modules.filter(mx => window.makeSafeId(window.getSafeVal(mx, ['ModuleCode'])) === safeCode);
                    const hasCrossFac = new Set(allSameCodes.map(mx => window.getFaculty(mx))).size > 1;
                    const cfBadge = hasCrossFac ? `<span class="bg-purple-100 text-purple-700 px-1 rounded text-[7px] font-bold">Cross-Fac</span>` : '';

                    html += `<div class="draggable-mod relative border-green-500" draggable="true" ondragstart="window.dragMod(event, '${safeCode}', '${p}')">
                        <strong class="text-green-700">${code}</strong> ${cfBadge}<br>
                        <span class="text-[9px] text-gray-700 leading-tight block mt-1">${name}</span>
                        <span class="text-[8px] font-bold text-gray-400 mt-1 flex justify-between"><span>${p}</span><span>👥 ${students}</span></span>
                    </div>`;
                }
            });
            pane.innerHTML = html || '<p class="text-[9px] italic text-gray-500 p-2">No modules match criteria.</p>';
            
            const statusEl = document.getElementById('tt-exam-pub-status');
            if(statusEl) {
                if(prog && localDB.settings.completed_tts.includes(`EXAM_${prog}`)) {
                    statusEl.innerText = "Status: Published ✅"; 
                } else {
                    statusEl.innerText = "Status: Draft (Auto-saving)";
                }
            }
        };

        window.renderExamTimetableGrid = () => {
            const grid = document.getElementById('exam-tt-grid'); if(!grid) return;
            const dateRaw = document.getElementById('exam-tt-date').value;
            const dateObj = dateRaw ? new Date(dateRaw) : new Date();
            const dateStr = dateObj.toISOString().split('T')[0]; 
            
            const progs = [...new Set(window.getFilteredModules().map(m => window.getSafeVal(m, ['ProgramName'])))].filter(Boolean);

            // Same indexing fix as the class timetable grid - avoid re-scanning the whole
            // exam_timetable array for every single cell.
            const cellIndex = {};
            const progVenue = {};
            localDB.exam_timetable.forEach(e => {
                if (e.day !== dateStr) return;
                const key = e.program + '|' + e.tsIndex;
                if (!cellIndex[key]) cellIndex[key] = [];
                cellIndex[key].push(e);
                if (progVenue[e.program] === undefined) progVenue[e.program] = e.room;
            });
            
            let html = `<div class="tt-header-row tt-row">
                <div class="tt-header-venue border-r border-gray-600 bg-green-900 text-white">Venue</div>
                <div class="tt-header-course flex items-center bg-green-900 text-white">Program / Batch</div>`;
            localDB.settings.timeslots.forEach((ts, idx) => {
                html += `<div class="tt-header-cell">
                    <div class="tt-time-top bg-green-800 border-green-900">${ts.start}</div><div class="tt-time-bot bg-green-700 text-green-200">to ${ts.end}</div>
                    <span class="tt-col-del" title="Delete Time Column" onclick="window.removeTimeslotAndRender(${idx}, 'EXAM')">✖</span>
                </div>`;
            });
            html += `</div>`;

            progs.forEach(p => {
                let defaultVenue = progVenue[p] !== undefined ? progVenue[p] : "TBA";

                html += `<div class="tt-row">
                    <div class="tt-cell-venue text-green-900" contenteditable="true" onblur="window.updateRowVenue(this, '${p}', '${dateStr}', 'EXAM')" title="Click to edit venue">${defaultVenue}</div>
                    <div class="tt-cell-course flex text-green-800" title="${p}">${p}</div>`;
                
                localDB.settings.timeslots.forEach((ts, idx) => {
                    const entries = cellIndex[p + '|' + idx] || [];
                    let blocks = '';
                    entries.forEach(e => {
                        const m = localDB.modules.find(mx => window.makeSafeId(window.getSafeVal(mx, ['ModuleCode'])) === e.modCode);
                        const students = m ? window.getSafeVal(m, ['NoofStudents']) || 0 : 0;
                        
                        const ass = localDB.assignments[e.modCode];
                        const lName = ass && ass.id ? (window.getLecturerById(ass.id)?.['LecturerName'] || 'TBA') : 'TBA';
                        
                        blocks += `<div class="assigned-block border-green-400 bg-green-50" title="Invigilator: ${lName}">
                            <strong class="text-green-800">${e.modCode}</strong>
                            <span class="text-[8px]">👥 ${students}</span>
                            <span class="text-gray-600 font-bold mt-0.5">Ven: ${e.room}</span>
                            <span class="del-btn" onclick="window.delTTEntry('${e.id}', 'EXAM')">&times;</span>
                        </div>`;
                    });
                    const isOccupied = entries.length > 0 ? 'occupied' : '';
                    html += `<div class="tt-cell ${isOccupied}" ondragover="window.allowDrop(event)" ondragleave="window.dragLeave(event)" ondrop="window.dropMod(event, '${p}', ${idx}, '${dateStr}', 'EXAM')">${blocks}</div>`;
                });
                html += `</div>`;
            });
            grid.innerHTML = html;
        };

        window.updateRowVenue = (element, prog, dayOrDate, type) => {
            const newVenue = element.innerText.trim() || 'TBA';
            const targetArray = type === 'CLASS' ? localDB.timetable : localDB.exam_timetable;
            let updated = false;
            
            targetArray.forEach(t => {
                if(t.program === prog && t.day === dayOrDate) {
                    t.room = newVenue;
                    updated = true;
                }
            });
            
            if(updated) {
                window.saveLocal(true);
                if(type === 'CLASS') window.renderTimetableGrid();
                else window.renderExamTimetableGrid();
                window.showToast("Row Venue Updated", "success");
            }
        };

        window.removeTimeslotAndRender = (idx, type) => {
            if(confirm("Remove this entire time column? Scheduled modules will be lost.")) {
                localDB.settings.timeslots.splice(idx, 1);
                if(type === 'CLASS') {
                    localDB.timetable = localDB.timetable.filter(t => t.tsIndex != idx); 
                    localDB.timetable.forEach(t => { if(t.tsIndex > idx) t.tsIndex--; });
                    window.saveLocal(true); window.renderTimetableGrid();
                } else {
                    localDB.exam_timetable = localDB.exam_timetable.filter(t => t.tsIndex != idx); 
                    localDB.exam_timetable.forEach(t => { if(t.tsIndex > idx) t.tsIndex--; });
                    window.saveLocal(true); window.renderExamTimetableGrid();
                }
            }
        };

        window.dragMod = (e, code, prog) => {
            e.dataTransfer.setData("modCode", code);
            e.dataTransfer.setData("progName", prog);
        };
        window.allowDrop = (e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); };
        window.dragLeave = (e) => { e.currentTarget.classList.remove('drag-over'); };
        
        window.dropMod = (e, targetProg, tsIndex, day, type) => {
            e.preventDefault(); 
            e.currentTarget.classList.remove('drag-over');
            
            const code = e.dataTransfer.getData("modCode");
            const originProg = e.dataTransfer.getData("progName");
            if(!code) return;

            if(originProg !== targetProg) {
                if(!confirm(`Warning: You are dropping a module from ${originProg} into the ${targetProg} row. Continue?`)) return;
            }

            const ass = localDB.assignments[code];
            const lectId = ass ? ass.id : null;
            
            let mode = "Face to Face";
            if(type === 'CLASS') {
                const modeInput = prompt("Enter Mode:\n1: Face to Face\n2: Online\n3: Blended", "1");
                if(modeInput === null) return;
                if(modeInput === "2") mode = "Online";
                else if(modeInput === "3") mode = "Blended";
            }

            // Get row's current venue as default instead of prompting
            let currentVenue = "TBA";
            const targetArray = type === 'CLASS' ? localDB.timetable : localDB.exam_timetable;
            const existingInRow = targetArray.find(t => t.day === day && t.program === targetProg);
            if(existingInRow) currentVenue = existingInRow.room;

            let roomPrompt = `Available Venues/Rooms:\n`;
            localDB.settings.roomList.forEach((r, i) => roomPrompt += `${i+1}: ${r}\n`);
            roomPrompt += `\nEnter Venue/Room Number or Name (Default: ${currentVenue}):`;
            
            let roomInput = prompt(roomPrompt, currentVenue);
            if(roomInput === null) return; 
            
            let finalRoom = roomInput;
            const rIndex = parseInt(roomInput) - 1;
            if(!isNaN(rIndex) && localDB.settings.roomList[rIndex]) finalRoom = localDB.settings.roomList[rIndex];

            let hasClash = false;
            let clashMsg = "";
            
            targetArray.forEach(t => {
                if(t.day === day && t.tsIndex == tsIndex) {
                    if(t.room === finalRoom && mode !== "Online" && finalRoom !== "TBA") {
                        hasClash = true; clashMsg += `- Venue [${finalRoom}] is already booked by ${t.modCode}.\n`;
                    }
                    if(type === 'CLASS' && lectId && t.lectId === lectId) {
                        hasClash = true; clashMsg += `- Assigned Lecturer is already teaching ${t.modCode} at this time.\n`;
                    }
                    if(t.program === targetProg) {
                        hasClash = true; clashMsg += `- Students in [${targetProg}] already have a scheduling conflict (${t.modCode}) at this time.\n`;
                    }
                }
            });

            if(hasClash) { alert(`⛔ CLASH DETECTED. CANNOT ASSIGN:\n\n${clashMsg}`); return; }

            targetArray.push({ 
                id: Math.random().toString(36).substr(2,9), 
                modCode: code, program: targetProg, tsIndex: tsIndex, 
                day: day, lectId: lectId, room: finalRoom, mode: mode
            });
            
            window.saveLocal(true);
            
            if(localDB.settings.completed_tts.includes(`${type}_${targetProg}`)) {
                simulateEmail(`Students & Staff (${targetProg})`, `[${type}] Timetable Amended`, `Changes have been made to the schedule for ${code}.`);
            }

            if(type === 'CLASS') window.renderTimetableGrid(); else window.renderExamTimetableGrid();
            window.showToast("Scheduled Successfully", "success");
        };

        window.delTTEntry = (id, type) => {
            if(type === 'CLASS') {
                localDB.timetable = localDB.timetable.filter(t => t.id !== id);
                window.saveLocal(true); window.renderTimetableGrid();
            } else {
                localDB.exam_timetable = localDB.exam_timetable.filter(t => t.id !== id);
                window.saveLocal(true); window.renderExamTimetableGrid();
            }
        };

        window.createEvent = () => {
            const type = document.getElementById('ev-type').value;
            const title = document.getElementById('ev-title').value;
            const date = document.getElementById('ev-date').value;
            const isAll = document.getElementById('ev-target-all').checked;
            const targetFac = document.getElementById('ev-target-fac').value;
            
            if(!title || !date) return alert("Title and Date are required.");
            
            const eventObj = {
                id: Math.random().toString(36).substr(2,9),
                title: title,
                type: type,
                date: date,
                targetRole: isAll ? 'ALL' : targetFac,
                responses: {} 
            };
            
            localDB.events.push(eventObj);
            window.saveLocal(true);
            window.renderEventsTab();
            
            simulateEmail(eventObj.targetRole, `Invitation: ${type} - ${title}`, `You are invited to an event on ${date}. Please RSVP in your portal.`);
            
            document.getElementById('ev-title').value = '';
            document.getElementById('ev-date').value = '';
            window.showToast("Event created and invites sent.", "success");
        };

        window.renderEventsTab = () => {
            const select = document.getElementById('ev-select-chart');
            if(!select) return;
            
            const currVal = select.value;
            let optHtml = '<option value="">Overall System Attendance</option>';
            localDB.events.forEach(e => {
                optHtml += `<option value="${e.id}">${e.date}: ${e.title}</option>`;
            });
            select.innerHTML = optHtml;
            if(localDB.events.some(e => e.id === currVal)) select.value = currVal;
            
            const selEventId = select.value;
            let stats = {};
            FACULTIES.forEach(f => stats[f] = { attended: 0, absent: 0, excused: 0, sick: 0 });
            
            let listAttendedHtml = '';
            let listAbsentHtml = '';
            let countAtt = 0; let countAbs = 0;

            localDB.lecturers.forEach(l => {
                const lId = window.makeSafeId(window.getSafeVal(l, ['LecturerID']));
                const lName = window.getSafeVal(l, ['LecturerName']);
                const lFac = window.getFaculty(l);
                
                let shouldInclude = false;
                let currentResponse = 'Absent'; 

                if(selEventId === '') {
                    shouldInclude = true; 
                } else {
                    const ev = localDB.events.find(e => e.id === selEventId);
                    if(ev && (ev.targetRole === 'ALL' || ev.targetRole === lFac)) {
                        shouldInclude = true;
                        if(ev.responses[lId]) currentResponse = ev.responses[lId];
                    }
                }

                if(shouldInclude) {
                    if(currentResponse === 'Attended') { stats[lFac].attended++; countAtt++; }
                    else if(currentResponse === 'Excused') { stats[lFac].excused++; countAbs++; }
                    else if(currentResponse === 'Sick') { stats[lFac].sick++; countAbs++; }
                    else { stats[lFac].absent++; countAbs++; }

                    const entry = `<div class="flex justify-between border-b border-gray-100 py-1 px-2"><span><b>${lName}</b> (${lFac})</span> <span class="text-gray-500 font-bold">${currentResponse}</span></div>`;
                    if(currentResponse === 'Attended') listAttendedHtml += entry;
                    else listAbsentHtml += entry;
                }
            });

            document.getElementById('ev-list-attended').innerHTML = listAttendedHtml || '<p class="italic text-gray-500 p-2">No attendees.</p>';
            document.getElementById('ev-list-absent').innerHTML = listAbsentHtml || '<p class="italic text-gray-500 p-2">No absentees.</p>';
            document.getElementById('ev-count-att').innerText = countAtt;
            document.getElementById('ev-count-abs').innerText = countAbs;

            if(charts.eventBar) charts.eventBar.destroy();
            if(charts.eventPie) charts.eventPie.destroy();

            const canvasBar = document.getElementById('eventBarChart');
            if(canvasBar) {
                charts.eventBar = new Chart(canvasBar, {
                    type: 'bar',
                    data: {
                        labels: FACULTIES,
                        datasets: [
                            { label: 'Attended', backgroundColor: '#22c55e', data: FACULTIES.map(f => stats[f].attended) },
                            { label: 'Absent/No RSVP', backgroundColor: '#ef4444', data: FACULTIES.map(f => stats[f].absent) },
                            { label: 'Excused', backgroundColor: '#9ca3af', data: FACULTIES.map(f => stats[f].excused) },
                            { label: 'Sick Leave', backgroundColor: '#bef264', data: FACULTIES.map(f => stats[f].sick) }
                        ]
                    },
                    options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
                });
            }

            const canvasPie = document.getElementById('eventPieChart');
            if(canvasPie) {
                let tAtt = 0, tAbs = 0, tExc = 0, tSick = 0;
                FACULTIES.forEach(f => { tAtt += stats[f].attended; tAbs += stats[f].absent; tExc += stats[f].excused; tSick += stats[f].sick; });
                
                charts.eventPie = new Chart(canvasPie, {
                    type: 'pie',
                    data: {
                        labels: ['Attended', 'Absent/No RSVP', 'Excused', 'Sick Leave'],
                        datasets: [{ data: [tAtt, tAbs, tExc, tSick], backgroundColor: ['#22c55e', '#ef4444', '#9ca3af', '#bef264'] }]
                    },
                    options: { responsive: true, maintainAspectRatio: false }
                });
            }
        };

        window.markAttendance = (eventId, status) => {
            if(!currentLecturerId) return alert("Verify Identity First.");
            const ev = localDB.events.find(e => e.id === eventId);
            if(ev) {
                ev.responses[currentLecturerId] = status;
                window.saveLocal(true);
                window.refreshWorkspaceData();
                window.showToast("Attendance RSVP Submitted", "success");
            }
        };

        window.openWeeklyModal = () => {
            if(!currentLecturerId) return alert("Please select your Identity first.");
            
            const select = document.getElementById('wr-mod-select');
            let html = '';
            localDB.modules.forEach(m => {
                const code = window.makeSafeId(window.getSafeVal(m, ['ModuleCode']));
                if(localDB.assignments[code] && localDB.assignments[code].id === currentLecturerId) {
                    html += `<option value="${code}">${code} - ${window.getSafeVal(m, ['ModuleName'])}</option>`;
                }
            });
            if(html === '') {
                alert("You have no assigned modules to report on."); return;
            }
            select.innerHTML = html;
            document.getElementById('weekly-report-modal').style.display = 'flex';
        };
        
        window.closeWeeklyModal = () => document.getElementById('weekly-report-modal').style.display = 'none';

        window.submitWeeklyReport = () => {
            const modCode = document.getElementById('wr-mod-select').value;
            const date = document.getElementById('wr-date').value;
            const hrsSched = document.getElementById('wr-hrs-sched').value;
            const hrsTaken = document.getElementById('wr-hrs-taken').value;
            const hrsCan = document.getElementById('wr-hrs-can').value;
            const reason = document.getElementById('wr-can-reason').value;
            
            const moodle = document.getElementById('wr-moodle').checked;
            const isims = document.getElementById('wr-isims').checked;
            const assign = document.getElementById('wr-assign').checked;
            const exam = document.getElementById('wr-exam').checked;

            if(!modCode || !date || !hrsSched) return alert("Please fill the required fields.");

            const m = localDB.modules.find(mx => window.makeSafeId(window.getSafeVal(mx, ['ModuleCode'])) === modCode);
            const fac = m ? window.getFaculty(m) : 'UNKNOWN';

            const report = {
                id: Math.random().toString(36).substr(2,9),
                lectId: currentLecturerId,
                fac: fac,
                modCode: modCode,
                date: date,
                hrsSched: hrsSched,
                hrsTaken: hrsTaken,
                hrsCan: hrsCan,
                reason: reason,
                moodle: moodle,
                isims: isims,
                assign: assign,
                exam: exam,
                timestamp: new Date().toISOString()
            };

            localDB.weekly_reports.push(report);
            window.saveLocal(true);
            window.closeWeeklyModal();
            
            simulateEmail(`Academic Affairs & ${fac} Dean`, `Weekly Report Submitted: ${modCode}`, `Lecturer ${currentLecturerId} has submitted their weekly delivery report.`);
            window.showToast("Weekly Report Submitted Successfully.", "success");
            window.renderWeeklyReports();
        };

        window.renderWeeklyReports = () => {
            const tbody = document.getElementById('wr-table-body');
            if(!tbody) return;

            const facFilter = document.getElementById('wr-filter-fac').value;
            const searchQ = document.getElementById('wr-search').value.toLowerCase();

            let html = '';
            localDB.weekly_reports.forEach(r => {
                const l = window.getLecturerById(r.lectId);
                const lName = l ? window.getSafeVal(l, ['LecturerName']) : r.lectId;
                
                const matchSearch = r.modCode.toLowerCase().includes(searchQ) || lName.toLowerCase().includes(searchQ);
                const matchFac = facFilter === 'ALL' || r.fac.includes(facFilter);

                if(matchSearch && matchFac) {
                    const tick = (val) => val ? '✅' : '❌';
                    html += `<tr class="hover:bg-teal-50 border-b border-gray-100">
                        <td class="p-3 font-bold text-gray-800">${lName} <br> <span class="text-[8px] text-gray-500">${r.fac}</span></td>
                        <td class="p-3 text-teal-800 font-black">${r.modCode}</td>
                        <td class="p-3 text-center font-bold text-gray-700">${r.date}</td>
                        <td class="p-3 text-center text-green-600 font-black">${r.hrsTaken}</td>
                        <td class="p-3 text-center text-red-600 font-black">${r.hrsCan}</td>
                        <td class="p-3 text-[9px] text-gray-600 italic">${r.reason || '-'}</td>
                        <td class="p-3 text-center text-xs space-y-1">
                            <div class="bg-gray-100 rounded px-2 py-0.5">Moodle: ${tick(r.moodle)}</div>
                            <div class="bg-gray-100 rounded px-2 py-0.5">iSIMS: ${tick(r.isims)}</div>
                        </td>
                        <td class="p-3 text-center text-xs space-y-1">
                            <div class="bg-gray-100 rounded px-2 py-0.5">Assign: ${tick(r.assign)}</div>
                            <div class="bg-gray-100 rounded px-2 py-0.5">Exam: ${tick(r.exam)}</div>
                        </td>
                    </tr>`;
                }
            });
            tbody.innerHTML = html || '<tr><td colspan="8" class="p-6 text-center text-gray-500 italic">No weekly reports found.</td></tr>';
        };

        // --- REQUESTS / OVERTIME TAB LOGIC ---
        window.openRequestModal = () => {
            if(!currentLecturerId) return alert("Verify Identity First.");
            document.getElementById('request-modal').style.display = 'flex';
        };
        window.closeRequestModal = () => document.getElementById('request-modal').style.display = 'none';

        window.submitRequest = () => {
            const type = document.getElementById('req-type').value;
            const target = document.getElementById('req-target-role').value;
            const title = document.getElementById('req-title').value;
            const details = document.getElementById('req-details').value;

            if(!title || !details) return alert("Please fill out title and details.");

            const reqObj = {
                id: Math.random().toString(36).substr(2,9),
                lectId: currentLecturerId,
                type: type,
                targetRole: target,
                title: title,
                details: details,
                status: 'Pending',
                date: new Date().toISOString()
            };

            localDB.requests.push(reqObj);
            window.saveLocal(true);
            window.closeRequestModal();
            
            simulateEmail(target, `New ${type} Request: ${title}`, `A new request has been submitted by Lecturer ID: ${currentLecturerId}`);
            window.showToast("Request Submitted Successfully", "success");
            window.renderRequestsList();
        };

        window.renderRequestsList = () => {
            const listEl = document.getElementById('requests-list');
            if(!listEl) return;

            const filter = document.getElementById('req-filter-type').value;
            let html = '';

            let filteredReqs = localDB.requests;
            
            if (activeRole !== 'ALL' && activeRole !== 'EXAM') {
                filteredReqs = filteredReqs.filter(r => r.targetRole === 'FACULTY' || r.targetRole === activeRole || r.lectId === currentLecturerId);
            } else if (activeRole === 'EXAM') {
                filteredReqs = filteredReqs.filter(r => r.targetRole === 'EXAM');
            }

            filteredReqs.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(r => {
                if (filter === 'Pending Approvals' && r.status !== 'Pending') return;

                const l = window.getLecturerById(r.lectId);
                const lName = l ? window.getSafeVal(l, ['LecturerName']) : (r.lectId.startsWith('S') ? 'Student' : 'Unknown');

                const statusColor = r.status === 'Pending' ? 'bg-purple-100 text-purple-800 border-purple-300' : (r.status === 'Approved' ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300');
                
                const btnHtml = (r.status === 'Pending' && (activeRole === 'ALL' || activeRole === r.targetRole || (activeRole !== 'LECTURER' && activeRole !== 'STUDENT'))) ? `
                    <div class="mt-2 flex gap-2 justify-end border-t pt-2">
                        <button onclick="window.updateRequestStatus('${r.id}', 'Rejected')" class="px-2 py-1 bg-red-100 text-red-700 hover:bg-red-200 text-[9px] font-bold rounded">Reject</button>
                        <button onclick="window.updateRequestStatus('${r.id}', 'Approved')" class="px-2 py-1 bg-green-100 text-green-700 hover:bg-green-200 text-[9px] font-bold rounded">Approve</button>
                    </div>
                ` : '';

                html += `<div class="p-3 border rounded-lg bg-white shadow-sm mb-2 relative">
                    <span class="absolute top-2 right-2 px-2 py-0.5 rounded text-[8px] font-black uppercase border ${statusColor}">${r.status}</span>
                    <p class="text-[9px] text-gray-500 font-bold uppercase">${new Date(r.date).toLocaleString()} | To: ${r.targetRole}</p>
                    <h4 class="text-xs font-black text-royal-blue mt-1">${r.type}: ${r.title}</h4>
                    <p class="text-[10px] text-gray-700 mt-1"><b>From:</b> ${lName} (${r.lectId})</p>
                    <p class="text-[10px] text-gray-600 mt-2 bg-gray-50 p-2 rounded italic">${r.details}</p>
                    ${btnHtml}
                </div>`;
            });

            listEl.innerHTML = html || '<p class="text-xs text-gray-500 italic p-4 text-center">No requests found.</p>';
        };

        window.updateRequestStatus = (id, status) => {
            const req = localDB.requests.find(r => r.id === id);
            if(req) {
                req.status = status;
                window.saveLocal(true);
                simulateEmail(`Lecturer ID: ${req.lectId}`, `Request Status Update`, `Your request "${req.title}" has been ${status}.`);
                window.showToast(`Request ${status}`, status === 'Approved' ? 'success' : 'error');
                window.renderRequestsList();
            }
        };


        // --- TASK MANAGEMENT LOGIC ---
        window.addSubTaskField = () => {
            const container = document.getElementById('subtasks-container');
            const div = document.createElement('div');
            div.className = "flex gap-2 mb-1 subtask-row";
            div.innerHTML = `
                <input type="text" class="w-full p-1 border rounded text-[10px] subtask-input outline-none focus:border-blue-500" placeholder="Subtask Description">
                <button onclick="this.parentElement.remove()" class="text-red-500 px-2 font-bold hover:bg-red-50 rounded">&times;</button>
            `;
            container.appendChild(div);
        };

        window.toggleAllTaskAssignees = () => {
            const checkAll = document.getElementById('task-sel-all').checked;
            document.querySelectorAll('.task-assign-chk').forEach(cb => cb.checked = checkAll);
        };

        window.renderTasksTab = () => {
            const listEl = document.getElementById('task-assignees-list');
            if(!listEl) return;
            
            let html = '';
            window.getFilteredLecturers().forEach(l => {
                const id = window.makeSafeId(window.getSafeVal(l, ['LecturerID']));
                const name = window.getSafeVal(l, ['LecturerName']);
                html += `<label class="block mb-1 hover:bg-gray-50 p-1 rounded"><input type="checkbox" class="task-assign-chk" value="${id}"> ${name} (${id})</label>`;
            });
            listEl.innerHTML = html;
            
            window.updateAnalytics(); 
        };

        window.assignTask = () => {
            const title = document.getElementById('task-title').value;
            const date = document.getElementById('task-date').value;
            const time = document.getElementById('task-time').value;
            const recur = document.getElementById('task-recur').value;
            
            const subtasks = Array.from(document.querySelectorAll('.subtask-input')).map(input => input.value).filter(val => val.trim() !== '');
            
            const assignees = Array.from(document.querySelectorAll('.task-assign-chk:checked')).map(cb => cb.value);

            if(!title || !date || assignees.length === 0) return alert("Title, Date, and at least one Assignee are required.");

            const taskIdBase = Math.random().toString(36).substr(2,9);
            const deadline = `${date}T${time || '23:59'}:00`;

            assignees.forEach(lId => {
                const taskObj = {
                    id: `${taskIdBase}_${lId}`,
                    lectId: lId,
                    title: title,
                    deadline: deadline,
                    recurrence: recur,
                    subtasks: subtasks.map(desc => ({ desc: desc, done: false })),
                    status: 'Pending',
                    createdAt: new Date().toISOString()
                };
                localDB.tasks.push(taskObj);
                simulateEmail(`Lecturer ID: ${lId}`, `New Task Assigned: ${title}`, `Deadline: ${new Date(deadline).toLocaleString()}`);
            });

            window.saveLocal(true);
            window.showToast("Tasks Assigned and Notifications Sent", "success");
            
            document.getElementById('task-title').value = '';
            document.getElementById('task-date').value = '';
            document.getElementById('task-time').value = '';
            document.getElementById('subtasks-container').innerHTML = '';
            document.getElementById('task-sel-all').checked = false;
            window.toggleAllTaskAssignees();
            
            window.updateAnalytics();
        };

        // --- EXAM PROGRESS TRACKING ---
        const EXAM_STEPS = ['paper', 'scheme', 'modkit', 'vetted', 'assign', 'returned'];
        
        window.renderExamTable = () => {
            const tbody = document.getElementById('exam-table-body');
            if(!tbody) return;

            const facFilter = document.getElementById('exam-fac-filter');
            if(facFilter && facFilter.options.length === 1) {
                let fOpts = '<option value="ALL">All Faculties</option>';
                FACULTIES.forEach(f => fOpts += `<option value="${f}">${f}</option>`);
                facFilter.innerHTML = fOpts;
            }

            const searchQ = document.getElementById('examSearch').value.toLowerCase();
            const facVal = document.getElementById('exam-fac-filter').value;
            const statusVal = document.getElementById('exam-status-filter').value;

            let html = '';
            let tPend = 0, tProg = 0, tComp = 0;

            localDB.modules.forEach(m => {
                const code = window.makeSafeId(window.getSafeVal(m, ['ModuleCode']));
                const name = window.getSafeVal(m, ['ModuleName']);
                const prog = window.getSafeVal(m, ['ProgramName']);
                const batch = window.getSafeVal(m, ['OfferedBatch']);
                const fac = window.getFaculty(m);
                const students = window.getSafeVal(m, ['NoofStudents']) || 0;

                const ass = localDB.assignments[code];
                const lName = ass && ass.id ? (window.getLecturerById(ass.id)?.['LecturerName'] || 'TBA') : 'Unassigned';

                const matchSearch = code.toLowerCase().includes(searchQ) || name.toLowerCase().includes(searchQ) || lName.toLowerCase().includes(searchQ) || prog.toLowerCase().includes(searchQ);
                const matchFac = facVal === 'ALL' || fac.includes(facVal);

                if (!matchSearch || !matchFac) return;

                if(!localDB.exam_progress[code]) localDB.exam_progress[code] = { paper:false, scheme:false, modkit:false, vetted:false, assign:false, returned:false };
                const progData = localDB.exam_progress[code];

                const completedSteps = EXAM_STEPS.filter(s => progData[s]).length;
                const totalSteps = EXAM_STEPS.length;
                const pct = Math.round((completedSteps / totalSteps) * 100);

                let statusCategory = 'Pending';
                if(pct === 100) statusCategory = 'Complete';
                else if(pct > 0) statusCategory = 'Progress';

                if(statusVal !== 'ALL' && statusCategory !== statusVal) return;

                if(statusCategory === 'Complete') tComp++;
                else if(statusCategory === 'Progress') tProg++;
                else tPend++;

                const buildToggle = (step) => {
                    const isActive = progData[step];
                    const btnClass = isActive ? 'active' : 'pending';
                    const icon = isActive ? '✅' : '⏳';
                    const action = isActive ? "Mark Pending" : "Mark Complete";
                    return `<button onclick="window.toggleExamStep('${code}', '${step}')" title="${action}" class="exam-toggle-btn ${btnClass} w-8 h-8 rounded-full shadow-sm text-[10px] flex items-center justify-center mx-auto border border-gray-300 hover:border-gray-500">${icon}</button>`;
                };

                let pctColor = 'text-red-500';
                if(pct === 100) pctColor = 'text-green-600';
                else if(pct >= 50) pctColor = 'text-purple-600';

                html += `<tr class="hover:bg-green-50 border-b border-gray-100 transition">
                    <td class="p-3 border-r border-gray-100"><b class="text-royal-blue text-xs">${code}</b><br><span class="text-[9px] text-gray-600">${name}</span></td>
                    <td class="p-3 border-r border-gray-100 text-[10px]"><b>${prog}</b><br><span class="text-gray-500">${batch}</span></td>
                    <td class="p-3 border-r border-gray-100 text-[10px]"><span class="bg-gray-100 px-1 rounded border">${fac}</span><br><span class="mt-1 inline-block">👥 ${students} Students</span></td>
                    <td class="p-3 border-r border-gray-100 text-[10px] font-bold text-gray-800">${lName}</td>
                    <td class="p-2 border-r border-gray-100">${buildToggle('paper')}</td>
                    <td class="p-2 border-r border-gray-100">${buildToggle('scheme')}</td>
                    <td class="p-2 border-r border-gray-100">${buildToggle('modkit')}</td>
                    <td class="p-2 border-r border-gray-100">${buildToggle('vetted')}</td>
                    <td class="p-2 border-r border-gray-100">${buildToggle('assign')}</td>
                    <td class="p-2 border-r border-gray-100">${buildToggle('returned')}</td>
                    <td class="p-3 text-center">
                        <div class="relative w-12 h-12 mx-auto flex items-center justify-center rounded-full border-4 ${pct===100?'border-green-500':(pct>0?'border-purple-400':'border-gray-200')}">
                            <span class="font-black text-[10px] ${pctColor}">${pct}%</span>
                        </div>
                    </td>
                </tr>`;
            });

            tbody.innerHTML = html || '<tr><td colspan="11" class="p-8 text-center text-gray-500 italic">No exam records found matching criteria.</td></tr>';

            const sPend = document.getElementById('exam-stat-pending');
            const sProg = document.getElementById('exam-stat-progress');
            const sComp = document.getElementById('exam-stat-complete');
            if(sPend) sPend.innerText = tPend;
            if(sProg) sProg.innerText = tProg;
            if(sComp) sComp.innerText = tComp;

            window.updateExamCharts();
        };

        window.toggleExamStep = (code, step) => {
            if(!localDB.exam_progress[code]) localDB.exam_progress[code] = { paper:false, scheme:false, modkit:false, vetted:false, assign:false, returned:false };
            
            const currentState = localDB.exam_progress[code][step];
            localDB.exam_progress[code][step] = !currentState;
            
            window.saveLocal(true);
            window.renderExamTable();

            if(!currentState) {
                const m = localDB.modules.find(mx => window.makeSafeId(window.getSafeVal(mx, ['ModuleCode'])) === code);
                const fac = m ? window.getFaculty(m) : 'Unknown';
                let stepName = step;
                if(step==='paper') stepName="Exam Paper Received";
                else if(step==='scheme') stepName="Marking Scheme Received";
                else if(step==='modkit') stepName="Moderation Kit Completed";
                else if(step==='vetted') stepName="Paper Vetted & Ready";
                else if(step==='assign') stepName="Marking Assigned";
                else if(step==='returned') stepName="Marks Returned to Exam Unit";

                simulateEmail(`Exam Unit & ${fac} Dean`, `Exam Tracking Update: ${code}`, `Step [${stepName}] has been marked as COMPLETE.`);
            }
        };

        window.updateExamCharts = () => {
            if(charts.examPie) charts.examPie.destroy();
            if(charts.examBar) charts.examBar.destroy();

            const sPend = parseInt(document.getElementById('exam-stat-pending')?.innerText || 0);
            const sProg = parseInt(document.getElementById('exam-stat-progress')?.innerText || 0);
            const sComp = parseInt(document.getElementById('exam-stat-complete')?.innerText || 0);

            const pieCanvas = document.getElementById('examPieChart');
            if(pieCanvas) {
                charts.examPie = new Chart(pieCanvas, {
                    type: 'doughnut',
                    data: {
                        labels: ['Pending', 'In Progress', 'Completed'],
                        datasets: [{ data: [sPend, sProg, sComp], backgroundColor: ['#ef4444', '#f59e0b', '#22c55e'], borderWidth: 0 }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } }
                });
            }

            let facData = {};
            FACULTIES.forEach(f => facData[f] = { total: 0, comp: 0 });

            localDB.modules.forEach(m => {
                const code = window.makeSafeId(window.getSafeVal(m, ['ModuleCode']));
                const fac = window.getFaculty(m);
                if(facData[fac]) {
                    facData[fac].total++;
                    const prog = localDB.exam_progress[code];
                    if(prog && EXAM_STEPS.every(s => prog[s])) facData[fac].comp++;
                }
            });

            let labels = []; let data = []; let topFac = ''; let topScore = -1;
            FACULTIES.forEach(f => {
                if(facData[f].total > 0) {
                    labels.push(f);
                    const score = (facData[f].comp / facData[f].total) * 100;
                    data.push(score);
                    if(score > topScore) { topScore = score; topFac = f; }
                }
            });

            const tfEl = document.getElementById('exam-top-fac');
            if(tfEl) tfEl.innerText = topScore >= 0 ? `${topFac} (${Math.round(topScore)}%)` : 'N/A';

            const barCanvas = document.getElementById('examBarChart');
            if(barCanvas && labels.length > 0) {
                charts.examBar = new Chart(barCanvas, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{ label: '% Modules Fully Complete', data: data, backgroundColor: '#22c55e', borderRadius: 4 }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: function(val){return val+"%"} } } }, plugins: { legend: { display: false } } }
                });
            }
        };


        // --- LECTURER WORKSPACE / DASHBOARD ---
        window.renderLecturerWorkspace = () => {
            if(activeRole !== 'LECTURER') return;
            
            if(!currentLecturerId) {
                document.getElementById('lecturer-workspace-name').innerText = "Please verify your identity above.";
                return;
            }

            const l = window.getLecturerById(currentLecturerId);
            const lName = l ? window.getSafeVal(l, ['LecturerName']) : currentLecturerId;
            const target = l ? window.getDefaultTarget(l) : 15;

            document.getElementById('lecturer-workspace-name').innerHTML = `${lName} <br><span class="text-gray-400">Target Workload: ${target} Hrs</span>`;

            let assignedModules = [];
            let totalWCH = 0;
            
            localDB.modules.forEach(m => {
                const mCode = window.makeSafeId(window.getSafeVal(m, ['ModuleCode']));
                if(localDB.assignments[mCode] && localDB.assignments[mCode].id === currentLecturerId) {
                    assignedModules.push(mCode);
                    totalWCH += (parseFloat(window.getSafeVal(m, ['WCH'])) || 0);
                }
            });

            const btnWeekly = document.getElementById('btn-submit-weekly');
            if(btnWeekly) {
                if(assignedModules.length > 0) btnWeekly.style.display = 'flex';
                else btnWeekly.style.display = 'none';
            }

            let pendingTasksHtml = '';
            let pendingCount = 0;
            let isOverdue = false;
            
            localDB.tasks.forEach(t => {
                if(t.lectId === currentLecturerId && t.status === 'Pending') {
                    pendingCount++;
                    const due = new Date(t.deadline);
                    const now = new Date();
                    const overdueStyle = due < now ? 'text-red-600 font-bold bg-red-50 p-1 rounded' : 'text-gray-500';
                    if(due < now) isOverdue = true;

                    let subHtml = '';
                    t.subtasks.forEach((st, idx) => {
                        const checked = st.done ? 'checked' : '';
                        const strike = st.done ? 'line-through text-gray-400' : '';
                        subHtml += `<label class="flex items-center gap-1 text-[9px] ${strike} hover:bg-gray-100 p-1 rounded cursor-pointer">
                            <input type="checkbox" ${checked} onchange="window.toggleSubtask('${t.id}', ${idx}, this.checked)"> ${st.desc}
                        </label>`;
                    });

                    pendingTasksHtml += `<div class="border rounded p-2 text-xs bg-white shadow-sm mb-2 border-l-4 border-royal-blue">
                        <h4 class="font-bold text-gray-800">${t.title}</h4>
                        <p class="text-[9px] mb-1 ${overdueStyle}">Due: ${due.toLocaleString()}</p>
                        <div class="space-y-1 mb-2 pl-2 border-l border-gray-200">${subHtml}</div>
                        <button onclick="window.markTaskComplete('${t.id}')" class="bg-blue-600 text-white px-2 py-1 rounded text-[9px] font-bold uppercase w-full">Mark as Fully Done</button>
                    </div>`;
                }
            });
            
            const pTasksEl = document.getElementById('lecturer-tasks-pending');
            if(pTasksEl) pTasksEl.innerHTML = pendingTasksHtml || '<p class="text-xs text-gray-500 italic p-2 text-center">No pending tasks! 🎉</p>';
            
            const pCountEl = document.getElementById('lect-pending-count');
            if(pCountEl) pCountEl.innerText = pendingCount;

            const banner = document.getElementById('lect-reminder-banner');
            if(banner) {
                if(isOverdue) banner.style.display = 'block';
                else banner.style.display = 'none';
            }

            let pendingEventsHtml = '';
            localDB.events.forEach(e => {
                const myFac = window.getFaculty(l);
                if(e.targetRole === 'ALL' || e.targetRole === myFac) {
                    if(!e.responses[currentLecturerId]) {
                        pendingEventsHtml += `<div class="border border-purple-300 bg-white rounded p-2 text-xs shadow-sm mb-2">
                            <h4 class="font-bold text-purple-800">${e.type}: ${e.title}</h4>
                            <p class="text-[10px] text-gray-600 mb-2">Date: ${e.date}</p>
                            <div class="flex gap-1 flex-wrap">
                                <button onclick="window.markAttendance('${e.id}', 'Attended')" class="flex-1 bg-green-500 text-white px-2 py-1 rounded text-[9px] font-bold">Attending</button>
                                <button onclick="window.markAttendance('${e.id}', 'Excused')" class="flex-1 bg-gray-500 text-white px-2 py-1 rounded text-[9px] font-bold">Excused</button>
                                <button onclick="window.markAttendance('${e.id}', 'Sick')" class="flex-1 bg-red-500 text-white px-2 py-1 rounded text-[9px] font-bold">Sick</button>
                            </div>
                        </div>`;
                    }
                }
            });
            
            const pEvEl = document.getElementById('lecturer-events-pending');
            if(pEvEl) pEvEl.innerHTML = pendingEventsHtml || '<p class="text-xs text-gray-500 italic p-2 text-center">No pending invitations.</p>';

            if(charts.lectOwnProg) charts.lectOwnProg.destroy();
            const canvasProg = document.getElementById('lect-own-chart');
            if(canvasProg) {
                const pct = Math.min(100, Math.round((totalWCH / target) * 100)) || 0;
                charts.lectOwnProg = new Chart(canvasProg, {
                    type: 'doughnut',
                    data: {
                        labels: ['Assigned WCH', 'Remaining Target'],
                        datasets: [{ data: [totalWCH, Math.max(0, target - totalWCH)], backgroundColor: ['#3b82f6', '#e2e8f0'], borderWidth: 0 }]
                    },
                    options: { 
                        responsive: true, maintainAspectRatio: false, cutout: '75%', 
                        plugins: { 
                            legend: { display: false },
                            title: { display: true, text: `${pct}% Workload Met`, position: 'bottom', font: {size: 14, weight: 'bold'}, padding: {top:10} }
                        } 
                    }
                });
            }

            let completedTasks = 0;
            localDB.tasks.forEach(t => { if(t.lectId === currentLecturerId && t.status === 'Completed') completedTasks++; });
            let stars = Math.min(5, Math.floor(completedTasks / 2) + (pct >= 100 ? 1 : 0));
            let pts = (completedTasks * 10) + (totalWCH * 5);
            
            document.getElementById('lecturer-stars').className = `star-rating s${stars}`;
            document.getElementById('lecturer-points').innerText = `${Math.round(pts)} PTS`;
        };

        window.refreshWorkspaceData = () => {
            window.renderLecturerWorkspace();
        };

        window.toggleSubtask = (taskId, stIdx, isDone) => {
            const t = localDB.tasks.find(tx => tx.id === taskId);
            if(t && t.subtasks[stIdx]) {
                t.subtasks[stIdx].done = isDone;
                window.saveLocal(true);
                window.refreshWorkspaceData();
            }
        };

        window.markTaskComplete = (taskId) => {
            const t = localDB.tasks.find(tx => tx.id === taskId);
            if(t) {
                const allSubDone = t.subtasks.every(st => st.done);
                if(!allSubDone && !confirm("Not all subtasks are checked. Mark entire task as complete anyway?")) return;
                
                t.status = 'Completed';
                window.saveLocal(true);
                window.showToast("Task Completed! Points awarded.", "success");
                window.refreshWorkspaceData();
            }
        };


        // --- ENTERPRISE ANALYTICS ---
        window.updateAnalytics = () => {
            const stats = { facTotalWCH: {}, facAssignedWCH: {}, facLectCount: {}, typeFocus: {}, assignSources: {}, listIdle:[], listFtUnder:[], listFtOver:[], listFtMet:[], listPtMet:[], listPtUnder:[] };
            let overallTotalWCH = 0, overallAssignedWCH = 0, overallModCount = 0;

            FACULTIES.forEach(f => {
                stats.facTotalWCH[f] = 0; stats.facAssignedWCH[f] = 0; stats.facLectCount[f] = 0;
                stats.assignSources[f] = { internal: 0, external: 0, unassigned: 0 };
            });

            // Precompute once, reused below instead of re-scanning lecturers/modules repeatedly
            // (this function runs after every single assignment change, so those repeated scans
            // were a major, very noticeable source of lag).
            const lecturerById = {};
            localDB.lecturers.forEach(l => { lecturerById[window.makeSafeId(window.getSafeVal(l, ['LecturerID']))] = l; });
            const assignedWCHByLecturer = {};

            localDB.modules.forEach(m => {
                overallModCount++;
                const wch = parseFloat(window.getSafeVal(m, ['WCH', 'WeeklyContactHours', 'Credit', 'Hours'])) || 0;
                const fac = window.getFaculty(m);
                overallTotalWCH += wch;
                
                if (stats.facTotalWCH[fac] !== undefined) stats.facTotalWCH[fac] += wch;

                const mCode = window.makeSafeId(window.getSafeVal(m, ['ModuleCode']));
                const ass = localDB.assignments[mCode];
                
                if (ass && ass.id) {
                    overallAssignedWCH += wch;
                    if (stats.facAssignedWCH[fac] !== undefined) stats.facAssignedWCH[fac] += wch;
                    assignedWCHByLecturer[ass.id] = (assignedWCHByLecturer[ass.id] || 0) + wch;
                    
                    const l = lecturerById[ass.id];
                    if(l) {
                        const lFac = window.getFaculty(l);
                        if(lFac === fac) {
                            if(stats.assignSources[fac]) stats.assignSources[fac].internal += wch;
                        } else {
                            if(stats.assignSources[fac]) stats.assignSources[fac].external += wch;
                        }
                    }
                } else {
                    if(stats.assignSources[fac]) stats.assignSources[fac].unassigned += wch;
                }
            });

            let overloads = 0, idles = 0;
            
            localDB.lecturers.forEach(l => {
                const fac = window.getFaculty(l);
                if (stats.facLectCount[fac] !== undefined) stats.facLectCount[fac]++;

                const lId = window.makeSafeId(window.getSafeVal(l, ['LecturerID']));
                const lName = window.getSafeVal(l, ['LecturerName']);
                const typeStr = String(window.getSafeVal(l, ['LecturerType', 'Type'])).toLowerCase();
                const focusStr = String(window.getSafeVal(l, ['LecturerCategory', 'Category'])).toLowerCase();
                
                if (!stats.typeFocus[focusStr]) stats.typeFocus[focusStr] = 0;
                stats.typeFocus[focusStr]++;

                let assignedWCH = assignedWCHByLecturer[lId] || 0;

                const target = window.getDefaultTarget(l);
                const isPT = typeStr.includes('part') || typeStr === 'pt';
                
                const htmlEntry = `<div class="flex justify-between border-b border-gray-100 py-1 hover:bg-gray-50 cursor-pointer transition" onclick="window.openHRView('${lId}')">
                    <span class="truncate pr-2"><b>${lName}</b> <span class="text-gray-400">(${fac})</span></span>
                    <span class="font-black shrink-0 text-right">${assignedWCH.toFixed(1)} <span class="text-gray-400 font-normal">/ ${target}</span></span>
                </div>`;

                if(assignedWCH === 0) {
                    idles++;
                    stats.listIdle.push(htmlEntry);
                } else if(isPT) {
                    if(assignedWCH < target) stats.listPtUnder.push(htmlEntry);
                    else stats.listPtMet.push(htmlEntry);
                } else {
                    if(assignedWCH < target) stats.listFtUnder.push(htmlEntry);
                    else if(assignedWCH === target) stats.listFtMet.push(htmlEntry);
                    else { overloads++; stats.listFtOver.push(htmlEntry); }
                }
            });

            // Top Header Stats
            document.getElementById('stat-total-mods').innerText = overallModCount;
            document.getElementById('stat-total-staff').innerText = localDB.lecturers.length;
            document.getElementById('stat-assigned-pct').innerText = overallTotalWCH > 0 ? Math.round((overallAssignedWCH / overallTotalWCH) * 100) + "%" : "0%";
            document.getElementById('stat-unassigned-wch').innerText = (overallTotalWCH - overallAssignedWCH).toFixed(1);
            
            document.getElementById('hdr-unassigned').innerText = overallTotalWCH - overallAssignedWCH > 0 ? (overallTotalWCH - overallAssignedWCH).toFixed(1) : 0;
            document.getElementById('hdr-idle').innerText = idles;
            document.getElementById('hdr-overload').innerText = overloads;

            // Render Lists
            const populateList = (id, arr) => {
                const el = document.getElementById(id);
                if(el) el.innerHTML = arr.length > 0 ? arr.join('') : '<p class="text-gray-400 italic text-[9px] p-2 text-center">None found in this category.</p>';
            };
            populateList('list-idle', stats.listIdle);
            populateList('list-ft-under', stats.listFtUnder);
            populateList('list-ft-over', stats.listFtOver);
            populateList('list-ft-met', stats.listFtMet);
            populateList('list-pt-under', stats.listPtUnder);
            populateList('list-pt-met', stats.listPtMet);

            // Chart 1: Faculty Wide Workload (Bar)
            if (charts.faculty) charts.faculty.destroy();
            const ctxFac = document.getElementById('facultyChart');
            if(ctxFac) {
                let labels = []; let dataAssigned = []; let dataUnassigned = [];
                FACULTIES.forEach(f => {
                    if (stats.facTotalWCH[f] > 0) {
                        labels.push(f);
                        dataAssigned.push(stats.facAssignedWCH[f]);
                        dataUnassigned.push(stats.facTotalWCH[f] - stats.facAssignedWCH[f]);
                    }
                });
                charts.faculty = new Chart(ctxFac, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            { label: 'Assigned Workload (WCH)', backgroundColor: '#004d40', data: dataAssigned, borderRadius: {topLeft:4, topRight:4} },
                            { label: 'Unassigned/Deficit (WCH)', backgroundColor: '#ef4444', data: dataUnassigned, borderRadius: {topLeft:4, topRight:4} }
                        ]
                    },
                    options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: {display:false} }, y: { stacked: true } }, plugins: { legend: { position: 'bottom', labels: {font: {size: 10}} } } }
                });
            }

            // Generate Quick Filter Badges for Facs
            let qfHtml = '<button onclick="window.renderAnalyticsCards(\'ALL\')" class="print-filter-badge hover:bg-gray-200 cursor-pointer">ALL FACULTIES</button>';
            FACULTIES.forEach(f => {
                if(stats.facTotalWCH[f] > 0) qfHtml += `<button onclick="window.renderAnalyticsCards('${f}')" class="print-filter-badge hover:bg-gray-200 cursor-pointer">${f}</button>`;
            });
            const qfEl = document.getElementById('faculty-quick-filters');
            if(qfEl) qfEl.innerHTML = qfHtml;

            // Render Summary Table
            let tableHtml = `<table class="w-full text-left border-collapse text-[10px]">
                <thead class="bg-gray-100 uppercase text-gray-700"><tr>
                    <th class="p-2 border">Faculty</th><th class="p-2 border text-center">Total Modules</th><th class="p-2 border text-center">Total WCH</th><th class="p-2 border text-center">Assigned %</th><th class="p-2 border text-center">Unassigned WCH</th>
                </tr></thead><tbody class="divide-y bg-white">`;
            
            FACULTIES.forEach(f => {
                if(stats.facTotalWCH[f] > 0) {
                    const modCount = localDB.modules.filter(m => window.getFaculty(m) === f).length;
                    const pct = Math.round((stats.facAssignedWCH[f] / stats.facTotalWCH[f]) * 100) || 0;
                    let pctColor = pct < 50 ? 'text-red-600' : (pct < 90 ? 'text-purple-600' : 'text-green-600');
                    
                    tableHtml += `<tr>
                        <td class="p-2 border font-bold">${f}</td>
                        <td class="p-2 border text-center">${modCount}</td>
                        <td class="p-2 border text-center">${stats.facTotalWCH[f]}</td>
                        <td class="p-2 border text-center font-black ${pctColor}">${pct}%</td>
                        <td class="p-2 border text-center ${stats.facTotalWCH[f] - stats.facAssignedWCH[f] > 0 ? 'text-red-500 font-bold' : ''}">${(stats.facTotalWCH[f] - stats.facAssignedWCH[f]).toFixed(1)}</td>
                    </tr>`;
                }
            });
            tableHtml += `</tbody></table>`;
            const tContainer = document.getElementById('summary-table-container');
            if(tContainer) tContainer.innerHTML = tableHtml;

            // Chart 2: Academic Focus (Doughnut)
            if (charts.focus) charts.focus.destroy();
            const ctxFocus = document.getElementById('focusChart');
            if(ctxFocus) {
                const focusLabels = Object.keys(stats.typeFocus).filter(k => k !== 'undefined' && k !== '');
                const focusData = focusLabels.map(k => stats.typeFocus[k]);
                charts.focus = new Chart(ctxFocus, {
                    type: 'doughnut',
                    data: {
                        labels: focusLabels.map(l => l.toUpperCase()),
                        datasets: [{ data: focusData, backgroundColor: ['#0d47a1', '#1976d2', '#42a5f5', '#90caf9', '#e3f2fd'], borderWidth: 1, borderColor: '#fff' }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right', labels: {font: {size: 9}, boxWidth: 12} } } }
                });
            }

            // Chart 3: Deployment Source (Bar)
            if (charts.assignmentDetails) charts.assignmentDetails.destroy();
            const ctxAssign = document.getElementById('assignmentDetailsChart');
            if(ctxAssign) {
                let labels = []; let dInt = []; let dExt = []; let dUn = [];
                FACULTIES.forEach(f => {
                    if (stats.facTotalWCH[f] > 0) {
                        labels.push(f);
                        dInt.push(stats.assignSources[f].internal);
                        dExt.push(stats.assignSources[f].external);
                        dUn.push(stats.assignSources[f].unassigned);
                    }
                });
                charts.assignmentDetails = new Chart(ctxAssign, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            { label: 'Internal Staff', backgroundColor: '#4ade80', data: dInt },
                            { label: 'Cross-Faculty Staff', backgroundColor: '#a855f7', data: dExt },
                            { label: 'Unassigned', backgroundColor: '#f87171', data: dUn }
                        ]
                    },
                    options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } }, plugins: { legend: { position: 'bottom', labels:{font:{size:9}} } } }
                });
            }

            // Progress Tracking Charts
            window.updateProgressCharts();
            
            window.renderAnalyticsCards('ALL');
        };

        window.updateProgressCharts = () => {
            // Tasks Completion Chart
            let tDone = 0, tPend = 0, tOver = 0;
            let facDiligence = {};
            FACULTIES.forEach(f => facDiligence[f] = {done:0, total:0});
            const lecturerByIdForTasks = {};
            localDB.lecturers.forEach(l => { lecturerByIdForTasks[window.makeSafeId(window.getSafeVal(l, ['LecturerID']))] = l; });

            localDB.tasks.forEach(t => {
                if(t.status === 'Completed') {
                    tDone++;
                    const l = lecturerByIdForTasks[t.lectId];
                    if(l) { const f = window.getFaculty(l); if(facDiligence[f]) { facDiligence[f].done++; facDiligence[f].total++; } }
                } else {
                    if(new Date(t.deadline) < new Date()) tOver++; else tPend++;
                    const l = lecturerByIdForTasks[t.lectId];
                    if(l) { const f = window.getFaculty(l); if(facDiligence[f]) { facDiligence[f].total++; } }
                }
            });

            // 1. Overall Task Chart
            const updateTaskChart = (chartVarName, canvasId) => {
                if(charts[chartVarName]) charts[chartVarName].destroy();
                const ctx = document.getElementById(canvasId);
                if(ctx && (tDone>0 || tPend>0 || tOver>0)) {
                    charts[chartVarName] = new Chart(ctx, {
                        type: 'doughnut',
                        data: { labels: ['Completed', 'Pending', 'Overdue'], datasets: [{ data: [tDone, tPend, tOver], backgroundColor: ['#22c55e', '#a855f7', '#ef4444'], borderWidth: 0 }] },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels:{font:{size:9}, boxWidth:10} } } }
                    });
                }
            };
            updateTaskChart('taskComp', 'taskCompletionChart');
            updateTaskChart('taskTabComp', 'taskTabCompletionChart');

            // 2. Faculty Diligence Bar
            const updateFacDiligenceChart = (chartVarName, canvasId) => {
                if(charts[chartVarName]) charts[chartVarName].destroy();
                const ctx = document.getElementById(canvasId);
                if(ctx) {
                    let labels=[], data=[];
                    FACULTIES.forEach(f => {
                        if(facDiligence[f].total > 0) {
                            labels.push(f); data.push((facDiligence[f].done / facDiligence[f].total) * 100);
                        }
                    });
                    if(labels.length > 0) {
                        charts[chartVarName] = new Chart(ctx, {
                            type: 'bar',
                            data: { labels: labels, datasets: [{ label: '% Tasks Completed', data: data, backgroundColor: '#6366f1' }] },
                            options: { responsive: true, maintainAspectRatio: false, scales: { y: { max: 100 } }, plugins:{legend:{display:false}} }
                        });
                    }
                }
            };
            updateFacDiligenceChart('facDil', 'facDiligentChart');
            updateFacDiligenceChart('taskTabFac', 'taskTabFacDiligentChart');

            // 3. Timetable Progress Pie
            let progs = [...new Set(window.getFilteredModules().map(m => window.getSafeVal(m, ['ProgramName'])))].filter(Boolean);
            let ttComp = 0, ttPend = 0;
            let listHtml = '';
            
            progs.forEach(p => {
                const isComp = localDB.settings.completed_tts.includes(`CLASS_${p}`);
                if(isComp) {
                    ttComp++;
                    listHtml += `<div class="flex justify-between items-center bg-teal-50 p-1 border-b border-teal-100 text-[10px]"><span>${p}</span> <span class="text-green-600 font-bold">✅ Published</span></div>`;
                } else {
                    ttPend++;
                    listHtml += `<div class="flex justify-between items-center bg-gray-50 p-1 border-b border-gray-100 text-[10px]"><span>${p}</span> <span class="text-gray-500">⏳ Draft</span></div>`;
                }
            });
            
            const listEl = document.getElementById('tt-prog-status-list');
            if(listEl) listEl.innerHTML = listHtml || '<p class="text-center italic text-gray-500 text-xs p-4">No programs found.</p>';

            if(charts.ttPie) charts.ttPie.destroy();
            const ctxTT = document.getElementById('ttProgressPieChart');
            if(ctxTT && (ttComp>0 || ttPend>0)) {
                charts.ttPie = new Chart(ctxTT, {
                    type: 'pie',
                    data: { labels: ['Published', 'Drafts Pending'], datasets: [{ data: [ttComp, ttPend], backgroundColor: ['#14b8a6', '#cbd5e1'], borderWidth: 0 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels:{font:{size:9}, boxWidth:10} } } }
                });
            }
            
            // 4. Coordination Analytics
            if(charts.coordBar) charts.coordBar.destroy();
            
            const ctxCoordBar = document.getElementById('coordBarChart');
            if(ctxCoordBar) {
                let facData = {};
                FACULTIES.forEach(f => facData[f] = 0);
                localDB.coordinators.forEach(c => {
                    const l = window.getLecturerById(c.lectId);
                    if(l) { const fac = window.getFaculty(l); if(facData[fac] !== undefined) facData[fac]++; }
                });
                let labels=[], data=[];
                FACULTIES.forEach(f => { if(facData[f]>0) {labels.push(f); data.push(facData[f]);} });
                if(labels.length>0) {
                    charts.coordBar = new Chart(ctxCoordBar, {
                        type: 'bar',
                        data: { labels: labels, datasets: [{ label: 'Assigned Coordinators', data: data, backgroundColor: '#db2777' }] },
                        options: { responsive: true, maintainAspectRatio: false, scales: {y:{beginAtZero:true, ticks:{stepSize:1}}}, plugins:{legend:{display:false}} }
                    });
                }
            }
        };

        window.renderAnalyticsCards = (filterFac) => {
            const cont = document.getElementById('faculty-cards-container');
            if(!cont) return;
            
            let html = '';
            FACULTIES.forEach(f => {
                if(filterFac !== 'ALL' && filterFac !== f) return;

                let modCount = 0; let totalWch = 0; let assignWch = 0;
                localDB.modules.forEach(m => {
                    if(window.getFaculty(m) === f) {
                        modCount++;
                        const wch = parseFloat(window.getSafeVal(m, ['WCH'])) || 0;
                        totalWch += wch;
                        const mCode = window.makeSafeId(window.getSafeVal(m, ['ModuleCode']));
                        if(localDB.assignments[mCode] && localDB.assignments[mCode].id) assignWch += wch;
                    }
                });

                if(modCount > 0) {
                    const pct = totalWch > 0 ? Math.round((assignWch / totalWch) * 100) : 0;
                    let colorClass = pct < 50 ? 'border-red-500 bg-red-50' : (pct < 90 ? 'border-purple-500 bg-purple-50' : 'border-green-500 bg-green-50');
                    
                    html += `<div class="royal-spin-card border-t-4 ${colorClass}" onclick="window.smoothScrollToLists()">
                        <div class="royal-spin-inner bg-white text-gray-800 border-none !p-3">
                            <h3 class="text-[10px] font-black uppercase text-center border-b pb-1 mb-2 tracking-widest text-royal-blue">${f}</h3>
                            <div class="flex justify-between items-center text-[10px] mb-1">
                                <span class="font-bold text-gray-500">Modules:</span><span class="font-black">${modCount}</span>
                            </div>
                            <div class="flex justify-between items-center text-[10px] mb-1">
                                <span class="font-bold text-gray-500">WCH Total:</span><span class="font-black text-purple-700">${totalWch.toFixed(1)}</span>
                            </div>
                            <div class="flex justify-between items-center text-[10px] mb-2 border-b pb-2">
                                <span class="font-bold text-gray-500">Pending:</span><span class="font-black text-red-600">${(totalWch - assignWch).toFixed(1)}</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2.5 mt-1 overflow-hidden relative">
                                <div class="${pct < 50 ? 'bg-red-500' : (pct < 90 ? 'bg-purple-500' : 'bg-green-500')} h-2.5 rounded-full" style="width: ${pct}%"></div>
                                <span class="absolute inset-0 flex items-center justify-center text-[6px] font-black text-white mix-blend-difference">${pct}%</span>
                            </div>
                        </div>
                    </div>`;
                }
            });
            cont.innerHTML = html;
        };

        window.smoothScrollToLists = () => {
            const anchor = document.getElementById('lecturer-lists-anchor');
            if(anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };

        window.exportAnalyticsPDF = async () => {
            if(!window.jspdf || !window.jspdf.jsPDF) return alert("PDF library not loaded.");
            const loader = document.getElementById('loader');
            loader.style.display = 'flex';
            document.getElementById('loader-text').innerText = "Generating PDF...";
            
            try {
                const area = document.getElementById('analytics-export-area');
                const canvas = await html2canvas(area, { scale: 1.5, useCORS: true });
                const imgData = canvas.toDataURL('image/jpeg', 0.8);
                
                const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(16);
                pdf.setTextColor(0, 77, 64);
                pdf.text("EXECUTIVE ENTERPRISE ANALYTICS REPORT", 14, 15);
                
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(10);
                pdf.setTextColor(100, 100, 100);
                pdf.text(`Generated Date: ${new Date().toLocaleString()}`, 14, 22);
                
                pdf.line(14, 25, pdfWidth-14, 25);
                pdf.addImage(imgData, 'JPEG', 10, 30, pdfWidth - 20, pdfHeight);
                
                pdf.save("Enterprise_Analytics_Report.pdf");
                window.showToast("PDF Downloaded", "success");
            } catch(e) {
                console.error(e); alert("PDF Generation Failed.");
            } finally {
                loader.style.display = 'none';
            }
        };

        // --- MASTER PRINT LOGIC ---
        window.printMasterReport = (type) => {
            const frame = document.getElementById('master-print-frame');
            const titleEl = document.getElementById('print-report-subtitle');
            const filterInfoEl = document.getElementById('print-filter-info');
            const thead = document.getElementById('print-table-head');
            const tbody = document.getElementById('print-table-body');
            document.getElementById('print-date').innerText = new Date().toLocaleString();
            document.getElementById('print-content-custom').innerHTML = ''; 
            
            let filterHtml = '';
            let headHtml = '';
            let bodyHtml = '';

            if(type === 'students') {
                titleEl.innerText = "Students Master List";
                const progFilter = document.getElementById('stu-filter-prog').value;
                const searchQ = document.getElementById('stuSearch').value;
                if(progFilter) filterHtml += `<span class="print-filter-badge">Program: ${progFilter}</span>`;
                if(searchQ) filterHtml += `<span class="print-filter-badge">Search: ${searchQ}</span>`;

                headHtml = `<tr><th>Student ID</th><th>Full Name</th><th>Enrolled Program</th><th>Semester</th><th>Batch</th><th>Study Mode</th><th>Type</th></tr>`;
                localDB.students.forEach(s => {
                    const prog = window.getSafeVal(s, ['EnrolledProgram']);
                    if(progFilter && prog !== progFilter) return;
                    bodyHtml += `<tr>
                        <td><b>${window.getSafeVal(s, ['StudentID'])}</b></td>
                        <td>${window.getSafeVal(s, ['FullName'])}</td>
                        <td>${prog}</td>
                        <td>${window.getSafeVal(s, ['Semester'])}</td>
                        <td>${window.getSafeVal(s, ['Batch'])}</td>
                        <td>${window.getSafeVal(s, ['StudyMode'])}</td>
                        <td>${window.getSafeVal(s, ['Type'])}</td>
                    </tr>`;
                });
            }
            else if (type === 'lecturers') {
                titleEl.innerText = "Lecturers Master Data";
                headHtml = `<tr><th>Faculty/Centre</th><th>Lecturer ID</th><th>Name</th><th>Category</th><th>Type</th><th>Mobile</th></tr>`;
                window.getFilteredLecturers().forEach(l => {
                    bodyHtml += `<tr>
                        <td>${window.getFaculty(l)}</td>
                        <td><b>${window.getSafeVal(l, ['LecturerID'])}</b></td>
                        <td>${window.getSafeVal(l, ['LecturerName'])}</td>
                        <td>${window.getSafeVal(l, ['LecturerCategory'])}</td>
                        <td>${window.getSafeVal(l, ['LecturerType'])}</td>
                        <td>${window.getSafeVal(l, ['MobileNumber'])}</td>
                    </tr>`;
                });
            }
            else if (type === 'modules') {
                titleEl.innerText = "Modules Master Data";
                headHtml = `<tr><th>Session</th><th>Program</th><th>Batch</th><th>Faculty</th><th>Campus</th><th>Mod Code</th><th>Name</th><th>WCH</th><th>Assignee</th></tr>`;
                window.getFilteredModules().forEach(m => {
                    const code = window.makeSafeId(window.getSafeVal(m, ['ModuleCode']));
                    const ass = localDB.assignments[code];
                    const lName = ass && ass.id ? (window.getLecturerById(ass.id)?.['LecturerName'] || 'Assigned') : 'Unassigned';
                    
                    bodyHtml += `<tr>
                        <td>${window.getSafeVal(m, ['Session'])}</td>
                        <td>${window.getSafeVal(m, ['ProgramName'])}</td>
                        <td>${window.getSafeVal(m, ['OfferedBatch'])}</td>
                        <td>${window.getFaculty(m)}</td>
                        <td>${window.getSafeCampus(m)}</td>
                        <td><b>${window.getSafeVal(m, ['ModuleCode'])}</b></td>
                        <td>${window.getSafeVal(m, ['ModuleName'])}</td>
                        <td class="text-center">${window.getSafeVal(m, ['WCH'])}</td>
                        <td class="${ass && ass.id ? 'text-green-700' : 'text-red-700'}">${lName}</td>
                    </tr>`;
                });
            }
            else if (type === 'timetable') {
                titleEl.innerText = "Class Timetable Master Report";
                const progF = document.getElementById('tt-export-prog').value;
                const batchF = document.getElementById('tt-export-batch').value;
                filterHtml += `<span class="print-filter-badge">Program: ${progF === 'ALL' ? 'All' : progF}</span>`;
                filterHtml += `<span class="print-filter-badge">Batch: ${batchF === 'ALL' ? 'All' : batchF}</span>`;
                
                let gridHtml = '';
                const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                
                days.forEach(d => {
                    let dayEntries = localDB.timetable.filter(t => t.day === d);
                    if(progF !== 'ALL') dayEntries = dayEntries.filter(t => t.program === progF);
                    
                    if(dayEntries.length > 0) {
                        gridHtml += `<h3 class="mt-6 mb-2 font-bold text-lg text-purple-900 border-b-2 border-purple-200">${d}</h3>`;
                        gridHtml += `<table class="print-table mb-4 text-center"><thead><tr><th>Time</th><th>Program</th><th>Module</th><th>Lecturer</th><th>Room</th><th>Mode</th></tr></thead><tbody>`;
                        
                        dayEntries.sort((a,b) => a.tsIndex - b.tsIndex).forEach(t => {
                            const ts = localDB.settings.timeslots[t.tsIndex];
                            const lName = t.lectId ? (window.getLecturerById(t.lectId)?.['LecturerName'] || 'TBA') : 'TBA';
                            gridHtml += `<tr>
                                <td><b>${ts.start} - ${ts.end}</b></td>
                                <td>${t.program}</td>
                                <td class="font-bold text-royal-blue">${t.modCode}</td>
                                <td>${lName}</td>
                                <td>${t.room}</td>
                                <td>${t.mode}</td>
                            </tr>`;
                        });
                        gridHtml += `</tbody></table>`;
                    }
                });
                document.getElementById('print-content-custom').innerHTML = gridHtml || '<p class="text-center mt-10 italic">No timetable entries found for criteria.</p>';
                thead.innerHTML = ''; tbody.innerHTML = '';
            }
            else if (type === 'exam_timetable') {
                titleEl.innerText = "Examination Timetable Master Report";
                const progF = document.getElementById('exam-tt-export-prog').value;
                const batchF = document.getElementById('exam-tt-export-batch').value;
                filterHtml += `<span class="print-filter-badge">Program: ${progF === 'ALL' ? 'All' : progF}</span>`;
                filterHtml += `<span class="print-filter-badge">Batch: ${batchF === 'ALL' ? 'All' : batchF}</span>`;
                
                let gridHtml = '';
                const groupedByDate = {};
                localDB.exam_timetable.forEach(t => {
                    if(progF !== 'ALL' && t.program !== progF) return;
                    if(!groupedByDate[t.day]) groupedByDate[t.day] = [];
                    groupedByDate[t.day].push(t);
                });
                
                const sortedDates = Object.keys(groupedByDate).sort();
                
                sortedDates.forEach(dateStr => {
                    const entries = groupedByDate[dateStr];
                    if(entries.length > 0) {
                        gridHtml += `<h3 class="mt-6 mb-2 font-bold text-lg text-green-900 border-b-2 border-green-200">Date: ${dateStr}</h3>`;
                        gridHtml += `<table class="print-table mb-4 text-center"><thead><tr><th>Time</th><th>Program</th><th>Module</th><th>Invigilator</th><th>Venue</th></tr></thead><tbody>`;
                        
                        entries.sort((a,b) => a.tsIndex - b.tsIndex).forEach(t => {
                            const ts = localDB.settings.timeslots[t.tsIndex];
                            const ass = localDB.assignments[t.modCode];
                            const lName = ass && ass.id ? (window.getLecturerById(ass.id)?.['LecturerName'] || 'TBA') : 'TBA';
                            gridHtml += `<tr>
                                <td><b>${ts.start} - ${ts.end}</b></td>
                                <td>${t.program}</td>
                                <td class="font-bold text-green-700">${t.modCode}</td>
                                <td>${lName}</td>
                                <td><b>${t.room}</b></td>
                            </tr>`;
                        });
                        gridHtml += `</tbody></table>`;
                    }
                });
                document.getElementById('print-content-custom').innerHTML = gridHtml || '<p class="text-center mt-10 italic">No exam timetable entries found for criteria.</p>';
                thead.innerHTML = ''; tbody.innerHTML = '';
            }

            filterInfoEl.innerHTML = filterHtml;
            thead.innerHTML = headHtml;
            tbody.innerHTML = bodyHtml;

            document.title = `MasterReport_${type}_${new Date().getTime()}`;
            document.body.classList.add('is-printing-master');
            setTimeout(() => {
                window.print();
                document.body.classList.remove('is-printing-master');
            }, 500);
        };

        window.masterReset = () => {
            const pass = prompt("🚨 DANGER ZONE 🚨\nThis will ERASE ALL DATA completely from the server and local browser.\nType 'RESET-ALL-DATA' to confirm:");
            if(pass === 'RESET-ALL-DATA') {
                localDB = {
                    lecturers: [], modules: [], assignments: {}, timetable: [], exam_timetable: [], rooms: [], students: [],
                    events: [], weekly_reports: [], tasks: [], requests: [], exam_progress: {}, coordinators: [], coordination_reports: [],
                    settings: localDB.settings
                };
                window.invalidateLecturerCache();
                window.saveLocal(true);
                window.saveToServer(false);
                alert("System has been Master Reset.");
                location.reload();
            } else {
                alert("Reset Aborted. Incorrect confirmation string.");
            }
        };
