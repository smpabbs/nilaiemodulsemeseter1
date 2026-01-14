// ================= VARIABLES GLOBAL =================
let dataBackup = [];
let rekapData = [];
let assignmentMap = {};
let evaluatorAssignment = {};
let firebaseDB = null; 

// ================= ASPEK PENILAIAN =================
const aspekBase = [
    ["Teknis", "Modul berjalan tanpa error atau bug"],
    ["Materi", "Konten sesuai dengan kurikulum dan akurat"],
    ["Penyajian", "Materi disajikan secara runtut dan sistematis"],
    ["Tampilan", "Desain antarmuka rapi, menarik, dan user-friendly"],
    ["Multimedia", "Penggunaan gambar, video, dan audio yang relevan dan mendukung"],
    ["Interaktivitas", "Ada elemen interaktif yang melibatkan peserta didik"],
    ["Evaluasi", "Quiz/soal evaluasi sesuai dengan materi dan level kesulitan tepat"]
];

const aspekVirtual = ["Virtual Lab", "Simulasi lab relevan, mudah digunakan, dan realistis"];

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM Loaded, starting initialization...");
    
    // Initialize Firebase first
    initFirebase();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load saved data dari localStorage
    loadSavedData();
    
    // Load data dari backup.json
    loadDataFromBackup();
    
    // Show input tab by default
    showTab('input');
});

// ================= FIREBASE FUNCTIONS =================
function initFirebase() {
    console.log("Initializing Firebase...");
    
    // Cek apakah Firebase sudah tersedia di window
    if (window.firebaseDB) {
        firebaseDB = window.firebaseDB;
        console.log("✅ Firebase DB available from window.firebaseDB");
        showTempMessage("✅ Firebase siap digunakan", "success");
        return true;
    }
    
    // Jika tidak ada, coba tunggu sebentar
    setTimeout(() => {
        if (window.firebaseDB) {
            firebaseDB = window.firebaseDB;
            console.log("✅ Firebase DB available after wait");
        } else {
            firebaseDB = null;
            console.warn("⚠️ Firebase DB not available");
            showTempMessage("⚠️ Mode offline: Data hanya disimpan di localStorage", "warning");
        }
    }, 1000);
    
    return !!firebaseDB;
}

async function saveToFirebase(data, isUpdate) {
    console.log("📤 Attempting to save to Firebase...", data);
    
    if (!firebaseDB) {
        console.error("❌ Firebase DB is null!");
        showTempMessage("⚠️ Firebase tidak tersedia - data hanya disimpan lokal", "warning");
        return false;
    }
    
    try {
        // Buat document ID yang unik dan valid
        const docId = `${data.mapel}_${data.level}_${data.lesson}`
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .substring(0, 150);
        
        console.log("Firebase Document ID:", docId);
        
        // Tambahkan timestamp jika belum ada
        if (!data.timestampISO) {
            data.timestampISO = new Date().toISOString();
        }
        
        // Tambahkan server timestamp
        data.serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
        
        // Simpan ke Firestore
        const docRef = firebaseDB.collection('penilaian').doc(docId);
        
        // SELALU gunakan set() dengan merge: true
        await docRef.set(data, { merge: true });
        
        console.log("✅ Saved to Firebase (merged):", docId);
        
        showTempMessage("✅ Data berhasil disimpan ke cloud!", "success");
        return true;
        
    } catch (error) {
        console.error("❌ Error saving to Firebase:", error);
        
        let errorMessage = "Gagal menyimpan ke cloud";
        if (error.code === 'permission-denied') {
            errorMessage = "Izin ditolak. Periksa Firebase Rules.";
        } else if (error.code === 'unavailable') {
            errorMessage = "Koneksi internet bermasalah";
        }
        
        showTempMessage(`⚠️ ${errorMessage}. Data tetap disimpan lokal.`, "warning");
        return false;
    }
}

async function loadFromFirebase() {
    console.log("📥 Loading data from Firebase...");
    
    if (!firebaseDB) {
        console.log("Firebase not available, skipping Firebase load");
        return [];
    }
    
    try {
        const snapshot = await firebaseDB.collection('penilaian').get();
        const firebaseData = [];
        
        snapshot.forEach(doc => {
            firebaseData.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        console.log(`✅ Loaded ${firebaseData.length} ratings from Firebase`);
        return firebaseData;
    } catch (error) {
        console.error("❌ Error loading from Firebase:", error);
        showTempMessage("⚠️ Gagal memuat data dari cloud", "warning");
        return [];
    }
}

// ================= LOAD SAVED DATA =================
async function loadSavedData() {
    console.log("💾 Loading saved data...");
    
    try {
        // Load from localStorage
        const savedData = localStorage.getItem('rekapData');
        if (savedData) {
            rekapData = JSON.parse(savedData);
            console.log(`📁 Loaded ${rekapData.length} ratings from localStorage`);
        }
        
        // Load from Firebase (jika tersedia)
        if (firebaseDB) {
            const firebaseData = await loadFromFirebase();
            if (firebaseData.length > 0) {
                // Merge Firebase data
                firebaseData.forEach(fbItem => {
                    const existingIndex = rekapData.findIndex(r => 
                        r.mapel === fbItem.mapel && 
                        r.level === fbItem.level && 
                        r.lesson === fbItem.lesson
                    );
                    
                    if (existingIndex >= 0) {
                        // Keep the latest version
                        const localTime = new Date(rekapData[existingIndex].timestampISO || rekapData[existingIndex].timestamp);
                        const firebaseTime = new Date(fbItem.timestampISO || fbItem.timestamp);
                        
                        if (firebaseTime > localTime) {
                            rekapData[existingIndex] = fbItem;
                        }
                    } else {
                        rekapData.push(fbItem);
                    }
                });
                
                // Save merged data back to localStorage
                localStorage.setItem('rekapData', JSON.stringify(rekapData));
                console.log(`☁️ Merged ${firebaseData.length} ratings from Firebase`);
            }
        }
        
    } catch (e) {
        console.error('❌ Error parsing saved data:', e);
        rekapData = [];
    }
}

// ================= LOAD DATA FROM BACKUP.JSON =================
function loadDataFromBackup() {
    console.log("Loading data from backup.json...");
    
    // Show loading state
    const tbody = document.getElementById('rekapTableBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 40px; color: var(--gray);">
            <i class="fas fa-spinner fa-spin"></i> Memuat data dari backup.json...
        </td></tr>`;
    }
    
    fetch('backup.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Data loaded successfully:", data.length, "items");
            
            // Process data from backup.json
            processBackupData(data);
            
            // Initialize the system
            initSystem();
            
            showTempMessage(`✅ Data berhasil dimuat: ${dataBackup.length} lesson`, 'success');
        })
        .catch(error => {
            console.error("Error loading backup.json:", error);
            showCriticalError("Gagal memuat backup.json. Pastikan file ada di folder yang sama.");
            
            // Try alternative method
            setTimeout(() => {
                loadBackupAlternative();
            }, 1000);
        });
}

function loadBackupAlternative() {
    // Alternative loading method using XMLHttpRequest
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'backup.json', true);
    xhr.onload = function() {
        if (xhr.status === 200) {
            try {
                const data = JSON.parse(xhr.responseText);
                processBackupData(data);
                initSystem();
                showTempMessage(`✅ Data berhasil dimuat: ${dataBackup.length} lesson`, 'success');
            } catch (e) {
                showCriticalError("Gagal parsing data dari backup.json");
            }
        } else {
            showCriticalError("Gagal memuat backup.json. Status: " + xhr.status);
        }
    };
    xhr.onerror = function() {
        showCriticalError("Tidak dapat mengakses backup.json");
    };
    xhr.send();
}

function processBackupData(rawData) {
    // Transform data to match our structure
    dataBackup = rawData.map((item, index) => {
        // Create a unique lesson identifier
        const lessonName = item.lesson || `Lesson ${index + 1}`;
        const mapel = item.mapel || 'Unknown';
        const level = item.level ? item.level.toString() : '';
        const chapter = item.chapter || '';
        const writer = item.writer || 'Tidak diketahui';
        
        // Create display name with chapter if available
        const displayName = chapter ? `${chapter} - ${lessonName}` : lessonName;
        
        return {
            id: index + 1,
            mapel: mapel,
            level: level,
            lesson: displayName,
            originalLesson: lessonName,
            chapter: chapter,
            writer: writer,
            embed: item.embed || '#',
            fullKey: `${mapel}|${level}|${displayName}`
        };
    });
    
    console.log("Processed data:", dataBackup.length, "lessons");
}

// ================= FUNGSI PEMBAGIAN TUGAS =================
function calculateAssignment() {
    console.log("Calculating assignment for", dataBackup.length, "lessons");
    
    // Reset assignment
    assignmentMap = {};
    evaluatorAssignment = {};
    
    if (dataBackup.length === 0) {
        console.warn("No data to calculate assignment");
        return;
    }
    
    // Count total lessons
    const totalLessons = dataBackup.length;
    document.getElementById('totalCount').textContent = totalLessons;
    document.getElementById('statTotalLessons').textContent = totalLessons;
    document.getElementById('totalModuls').textContent = totalLessons;
    document.getElementById('totalRekapLessons').textContent = totalLessons;
    
    // Target: Amar 36, Rina 35 (total 71 from JSON)
    const targetAmar = 36;
    const targetRina = 35;
    
    document.getElementById('amarTarget').textContent = targetAmar;
    document.getElementById('rinaTarget').textContent = targetRina;
    
    console.log(`Targets - Total: ${totalLessons}, Amar: ${targetAmar}, Rina: ${targetRina}`);
    
    // Group lessons by subject
    let amarMandatorySubjects = ["SCIENCE", "INFORMATIKA ICT", "INFORMATIKA non ICT"];
    let rinaMandatorySubject = ["MATH"];
    
    let amarAssigned = [];
    let rinaAssigned = [];
    let unassigned = [];
    
    // First pass: Categorize lessons
    dataBackup.forEach(lesson => {
        const key = lesson.fullKey;
        
        if (amarMandatorySubjects.includes(lesson.mapel)) {
            amarAssigned.push(lesson);
            assignmentMap[key] = 'amar';
            evaluatorAssignment[key] = 'Mr. Amar';
        } else if (rinaMandatorySubject.includes(lesson.mapel)) {
            rinaAssigned.push(lesson);
            assignmentMap[key] = 'rina';
            evaluatorAssignment[key] = 'Ms. Rina';
        } else {
            unassigned.push(lesson);
        }
    });
    
    console.log(`After mandatory: Amar ${amarAssigned.length}, Rina ${rinaAssigned.length}, Unassigned: ${unassigned.length}`);
    
    // Second pass: Distribute remaining lessons to meet targets
    let amarRemaining = Math.max(0, targetAmar - amarAssigned.length);
    let rinaRemaining = Math.max(0, targetRina - rinaAssigned.length);
    
    console.log(`Remaining slots: Amar ${amarRemaining}, Rina ${rinaRemaining}`);
    
    // Shuffle unassigned lessons for fair distribution
    unassigned.sort(() => Math.random() - 0.5);
    
    // Distribute to Amar first, then Rina
    for (let lesson of unassigned) {
        const key = lesson.fullKey;
        
        if (amarRemaining > 0) {
            amarAssigned.push(lesson);
            assignmentMap[key] = 'amar';
            evaluatorAssignment[key] = 'Mr. Amar';
            amarRemaining--;
        } else if (rinaRemaining > 0) {
            rinaAssigned.push(lesson);
            assignmentMap[key] = 'rina';
            evaluatorAssignment[key] = 'Ms. Rina';
            rinaRemaining--;
        } else {
            // If all slots are filled, assign to whoever has fewer
            if (amarAssigned.length <= rinaAssigned.length) {
                amarAssigned.push(lesson);
                assignmentMap[key] = 'amar';
                evaluatorAssignment[key] = 'Mr. Amar';
            } else {
                rinaAssigned.push(lesson);
                assignmentMap[key] = 'rina';
                evaluatorAssignment[key] = 'Ms. Rina';
            }
        }
    }
    
    console.log(`Final assignment: Amar ${amarAssigned.length}, Rina ${rinaAssigned.length}`);
    
    updateAssignmentStats();
}

function updateAssignmentStats() {
    let amarCount = 0;
    let rinaCount = 0;
    
    dataBackup.forEach(lesson => {
        let key = lesson.fullKey;
        if (assignmentMap[key] === 'amar') amarCount++;
        if (assignmentMap[key] === 'rina') rinaCount++;
    });
    
    // Update all counters
    document.getElementById('amarCount').textContent = amarCount;
    document.getElementById('rinaCount').textContent = rinaCount;
    document.getElementById('totalAmarLessons').textContent = amarCount;
    document.getElementById('totalRinaLessons').textContent = rinaCount;
    document.getElementById('badgeAmarCount').textContent = amarCount;
    document.getElementById('badgeRinaCount').textContent = rinaCount;
    document.getElementById('amarAssigned').textContent = amarCount;
    document.getElementById('rinaAssigned').textContent = rinaCount;
    
    // Calculate progress for each evaluator
    let amarRated = rekapData.filter(r => r.evaluator === 'Mr. Amar').length;
    let rinaRated = rekapData.filter(r => r.evaluator === 'Ms. Rina').length;
    
    let amarProgress = amarCount > 0 ? Math.round((amarRated / amarCount) * 100) : 0;
    let rinaProgress = rinaCount > 0 ? Math.round((rinaRated / rinaCount) * 100) : 0;
    
    document.getElementById('amarProgress').textContent = `${amarProgress}% (${amarRated}/${amarCount})`;
    document.getElementById('rinaProgress').textContent = `${rinaProgress}% (${rinaRated}/${rinaCount})`;
}

// ================= DROPDOWN FUNCTIONS =================
function initDropdown() {
    console.log("Initializing dropdown with", dataBackup.length, "lessons");
    
    if (dataBackup.length === 0) {
        console.warn("No data to populate dropdowns");
        return;
    }
    
    // Get unique subjects
    let mapelSet = [...new Set(dataBackup.map(x => x.mapel).filter(Boolean))].sort();
    const mapelSelect = document.getElementById('mapel');
    
    mapelSelect.innerHTML = "<option value=''>Pilih Mapel</option>";
    mapelSet.forEach(m => mapelSelect.innerHTML += `<option value="${m}">${m}</option>`);
    
    console.log("Mapel options:", mapelSet);
}

function onMapelChange() {
    const mapel = document.getElementById('mapel').value;
    if (!mapel) {
        resetLevelAndLesson();
        return;
    }
    
    // Get unique levels for selected subject
    let levelSet = [...new Set(dataBackup
        .filter(x => x.mapel === mapel && x.level)
        .map(x => x.level))].sort();
    
    const levelSelect = document.getElementById('level');
    levelSelect.innerHTML = "<option value=''>Pilih Level</option>";
    levelSet.forEach(l => levelSelect.innerHTML += `<option value="${l}">Level ${l}</option>`);
    
    resetLesson();
}

function onLevelChange() {
    const mapel = document.getElementById('mapel').value;
    const level = document.getElementById('level').value;
    
    if (!mapel || !level) {
        resetLesson();
        return;
    }
    
    // Get lessons for selected subject and level
    let lessons = dataBackup
        .filter(x => x.mapel === mapel && x.level === level && x.lesson)
        .map(x => ({
            value: x.lesson,
            text: x.lesson,
            writer: x.writer
        }));
    
    // Remove duplicates
    const uniqueLessons = [];
    const seen = new Set();
    lessons.forEach(lesson => {
        if (!seen.has(lesson.value)) {
            seen.add(lesson.value);
            uniqueLessons.push(lesson);
        }
    });
    
    const lessonSelect = document.getElementById('lesson');
    lessonSelect.innerHTML = "<option value=''>Pilih Lesson</option>";
    uniqueLessons.forEach(lesson => {
        lessonSelect.innerHTML += `<option value="${lesson.value}">${lesson.text}</option>`;
    });
    
    hidePreviewAndEvaluator();
}

function onLessonChange() {
    const mapel = document.getElementById('mapel').value;
    const level = document.getElementById('level').value;
    const lesson = document.getElementById('lesson').value;
    
    if (!mapel || !level || !lesson) {
        hidePreviewAndEvaluator();
        return;
    }
    
    // Find the selected lesson
    let obj = dataBackup.find(x => 
        x.mapel === mapel && 
        x.level === level && 
        x.lesson === lesson
    );
    
    if (obj) {
        console.log("Selected lesson:", obj);
        
        // Show writer info
        document.getElementById('writerInfo').textContent = obj.writer || 'Tidak diketahui';
        document.getElementById('writerDetail').style.display = 'block';
        
        // Show/hide preview based on embed URL
        let preview = document.getElementById('modulPreview');
        let iframe = document.getElementById('embedFrame');
        
        if (obj.embed && obj.embed !== '#') {
            iframe.src = obj.embed;
            preview.classList.remove('hidden');
        } else {
            preview.classList.add('hidden');
        }
        
        // Show evaluator info
        let key = obj.fullKey;
        let evaluator = evaluatorAssignment[key] || 'Belum ditentukan';
        let evaluatorClass = assignmentMap[key] === 'amar' ? 'badge-amar' : 
                            assignmentMap[key] === 'rina' ? 'badge-rina' : '';
        
        document.getElementById('currentEvaluator').textContent = evaluator;
        document.getElementById('evaluatorDetail').innerHTML = 
            evaluatorClass ? 
            `<span class="assignment-badge ${evaluatorClass}">${evaluator}</span> bertugas menilai modul ini` :
            `<span style="color: var(--gray)">${evaluator}</span>`;
        
        document.getElementById('evaluatorInfo').style.display = 'block';
        
        // Update save button text
        document.getElementById('saveButtonText').textContent = evaluator;
        
        // Load existing scores
        setTimeout(() => {
            renderAspek();
        }, 100);
    } else {
        hidePreviewAndEvaluator();
    }
}

function resetLevelAndLesson() {
    const levelSelect = document.getElementById('level');
    const lessonSelect = document.getElementById('lesson');
    
    levelSelect.innerHTML = "<option value=''>Pilih Level</option>";
    lessonSelect.innerHTML = "<option value=''>Pilih Lesson</option>";
    
    hidePreviewAndEvaluator();
}

function resetLesson() {
    const lessonSelect = document.getElementById('lesson');
    lessonSelect.innerHTML = "<option value=''>Pilih Lesson</option>";
    
    hidePreviewAndEvaluator();
}

function hidePreviewAndEvaluator() {
    document.getElementById('modulPreview').classList.add('hidden');
    document.getElementById('evaluatorInfo').style.display = 'none';
    document.getElementById('writerDetail').style.display = 'none';
}

// ================= FORM PENILAIAN =================
function renderAspek() {
    const mapel = document.getElementById('mapel').value;
    const level = document.getElementById('level').value;
    const lesson = document.getElementById('lesson').value;
    
    if (!mapel || !level || !lesson) return;
    
    let html = "";
    let aspek = [...aspekBase];

    // Add virtual lab aspect for MATH and SCIENCE
    if (mapel === "MATH" || mapel === "SCIENCE") {
        aspek.push(aspekVirtual);
    }

    // Check if there's existing rating for this module
    let existingScore = rekapData.find(r => 
        r.mapel === mapel && 
        r.level === level && 
        r.lesson === lesson
    );

    aspek.forEach((a, i) => {
        let selectedValue = "";
        if (existingScore && existingScore.details && existingScore.details[i] !== undefined) {
            selectedValue = existingScore.details[i];
        }
        
        html += `<tr>
            <td style="text-align: center; font-weight: bold;">${i+1}</td>
            <td><strong>${a[0]}</strong></td>
            <td><small style="color: #666;">${a[1]}</small></td>
            <td>
                <select class="skor" data-aspek="${i}" style="width: 80px; margin: 0 auto;">
                    <option value="">-</option>
                    ${[...Array(11).keys()].map(n => 
                        `<option value="${n}" ${selectedValue == n ? "selected" : ""}>${n}</option>`
                    ).join("")}
                </select>
            </td>
        </tr>`;
    });

    document.getElementById('tabelAspek').innerHTML = html;
}

// ================= SIMPAN DATA =================
async function simpan() {
    const mapel = document.getElementById('mapel').value;
    const level = document.getElementById('level').value;
    const lesson = document.getElementById('lesson').value;
    
    if (!mapel || !level || !lesson) {
        showTempMessage("⚠️ Silakan pilih Mapel, Level, dan Lesson terlebih dahulu!", "warning");
        return;
    }
    
    // Check if evaluator is assigned
    let key = `${mapel}|${level}|${lesson}`;
    let assignedEvaluator = evaluatorAssignment[key];
    if (!assignedEvaluator) {
        showTempMessage("⚠️ Lesson ini belum ditetapkan penilainya!", "warning");
        return;
    }
    
    // Get writer info
    let modulData = dataBackup.find(x => 
        x.mapel === mapel && 
        x.level === level && 
        x.lesson === lesson
    );
    
    if (!modulData) {
        showTempMessage("⚠️ Data lesson tidak ditemukan!", "warning");
        return;
    }
    
    // Get all scores
    let skorElements = document.querySelectorAll(".skor");
    let details = [];
    let total = 0;
    let allFilled = true;
    
    skorElements.forEach(s => {
        let value = s.value;
        if (!value && value !== "0") {
            allFilled = false;
            s.style.borderColor = "var(--warning)";
        } else {
            s.style.borderColor = "";
            let numValue = Number(value);
            details.push(numValue);
            total += numValue;
        }
    });
    
    if (!allFilled) {
        showTempMessage("⚠️ Harap isi semua skor penilaian!", "warning");
        return;
    }

    // Calculate score on 100 scale
    let max = skorElements.length * 10;
    let skala100 = Math.round((total / max) * 100);
    
    // Check if rating already exists
    let existingIndex = rekapData.findIndex(r => 
        r.mapel === mapel && 
        r.level === level && 
        r.lesson === lesson
    );
    
    let newEntry = {
        mapel: mapel,
        level: level,
        lesson: lesson,
        evaluator: assignedEvaluator,
        writer: modulData.writer || 'Tidak diketahui',
        embed: modulData.embed || "",
        total: total,
        skala100: skala100,
        details: details,
        timestamp: new Date().toLocaleString(),
        timestampISO: new Date().toISOString()
    };
    
    let isUpdate = false;
    
    if (existingIndex >= 0) {
        // Update existing
        rekapData[existingIndex] = newEntry;
        isUpdate = true;
        console.log("Updated existing rating:", newEntry);
    } else {
        // Add new
        rekapData.push(newEntry);
        console.log("Added new rating:", newEntry);
    }
    
    // Save to localStorage
    try {
        localStorage.setItem('rekapData', JSON.stringify(rekapData));
        console.log("💾 Saved to localStorage");
    } catch (e) {
        console.error("❌ Error saving to localStorage:", e);
    }
    
    // Save to Firebase (jika tersedia)
    if (firebaseDB) {
        const firebaseSuccess = await saveToFirebase(newEntry, isUpdate);
        if (firebaseSuccess) {
            showSuccessMessage(assignedEvaluator, total, skala100);
        } else {
            showTempMessage(`✅ Data disimpan lokal! Skor: ${total} | Skala 100: ${skala100}`, "success");
        }
    } else {
        showTempMessage(`✅ Data disimpan lokal! Skor: ${total} | Skala 100: ${skala100}`, "success");
    }
    
    // Update UI
    updateProgress();
    renderRekap();
    
    // Clear form for next input
    setTimeout(() => {
        document.getElementById('mapel').value = '';
        document.getElementById('level').value = '';
        document.getElementById('lesson').value = '';
        document.getElementById('tabelAspek').innerHTML = '';
        hidePreviewAndEvaluator();
        document.getElementById('saveButtonText').textContent = '-';
        document.getElementById('currentEvaluator').textContent = '-';
    }, 1500);
}

// ================= REKAP FUNCTIONS =================
function renderRekap() {
    let tbody = document.getElementById('rekapTableBody');
    
    if (!tbody) {
        console.error("Rekap table body not found!");
        return;
    }
    
    if (!dataBackup || dataBackup.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 40px; color: var(--gray);">
            <i class="fas fa-exclamation-circle"></i> Tidak ada data yang dimuat
        </td></tr>`;
        return;
    }
    
    console.log("Rendering rekap for", dataBackup.length, "lessons");
    
    tbody.innerHTML = '';
    
    // Sort data: rated first, then by subject and level
    let sortedData = [...dataBackup].sort((a, b) => {
        let aRated = rekapData.some(r => r.mapel === a.mapel && r.level === a.level && r.lesson === a.lesson);
        let bRated = rekapData.some(r => r.mapel === b.mapel && r.level === b.level && r.lesson === b.lesson);
        
        if (aRated && !bRated) return -1;
        if (!aRated && bRated) return 1;
        
        if (a.mapel !== b.mapel) return a.mapel.localeCompare(b.mapel);
        if (a.level !== b.level) return a.level.localeCompare(b.level);
        return (a.lesson || "").localeCompare(b.lesson || "");
    });
    
    // Render all lessons
    sortedData.forEach((modul, index) => {
        let row = document.createElement('tr');
        
        let key = modul.fullKey;
        let assignedEvaluator = assignmentMap[key];
        let evaluatorName = evaluatorAssignment[key];
        
        // Find rating for this module
        let rating = rekapData.find(r => 
            r.mapel === modul.mapel && 
            r.level === modul.level && 
            r.lesson === modul.lesson
        );
        
        let isRated = !!rating;
        
        // Apply classes based on evaluator and status
        if (assignedEvaluator === 'amar') {
            row.classList.add('assigned-amar');
        } else if (assignedEvaluator === 'rina') {
            row.classList.add('assigned-rina');
        }
        
        if (isRated) {
            row.classList.add('rated');
        }
        
        let status, statusClass, totalSkor, skala100, details, writer;
        
        if (isRated) {
            status = "SELESAI";
            statusClass = "status-completed";
            totalSkor = rating.total;
            skala100 = rating.skala100;
            details = rating.details ? rating.details.map((s, i) => 
                `<span title="Aspek ${i+1}: ${aspekBase[i]?.[0] || 'Virtual Lab'}">${s}</span>`
            ).join(', ') : '-';
            writer = rating.writer || modul.writer || 'Tidak diketahui';
        } else {
            status = "BELUM";
            statusClass = "status-pending";
            totalSkor = '-';
            skala100 = '-';
            details = '-';
            writer = modul.writer || 'Tidak diketahui';
        }
        
        let evaluatorBadge = assignedEvaluator === 'amar' 
            ? `<span class="assignment-badge badge-amar">${evaluatorName}</span>`
            : assignedEvaluator === 'rina'
            ? `<span class="assignment-badge badge-rina">${evaluatorName}</span>`
            : '<span style="color: var(--gray); font-size: 12px;">Belum ditentukan</span>';
        
        row.innerHTML = `
            <td style="text-align: center; font-weight: bold;">${index + 1}</td>
            <td><strong>${modul.mapel}</strong></td>
            <td>Level ${modul.level}</td>
            <td>${modul.lesson || '-'}</td>
            <td><small>${writer}</small></td>
            <td>${evaluatorBadge}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td style="text-align: center;"><strong>${totalSkor}</strong></td>
            <td style="text-align: center;"><strong>${skala100}</strong></td>
            <td><small style="font-family: monospace;">${details}</small></td>
        `;
        
        tbody.appendChild(row);
    });
    
    updateProgress();
    console.log("Rekap rendered successfully");
}

// ================= PROGRESS FUNCTIONS =================
function updateProgress() {
    if (!dataBackup || dataBackup.length === 0) {
        console.warn("Cannot update progress: no data");
        return;
    }
    
    let totalModuls = dataBackup.length;
    let ratedModuls = rekapData.length;
    let percentage = Math.round((ratedModuls / totalModuls) * 100);
    
    // Update progress bars
    const progressPercent = document.getElementById('progressPercent');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    if (progressPercent) progressPercent.textContent = percentage + '%';
    if (progressFill) progressFill.style.width = percentage + '%';
    if (progressText) progressText.textContent = `${ratedModuls} dari ${totalModuls} modul sudah dinilai`;
    
    const totalProgressPercent = document.getElementById('totalProgressPercent');
    const totalProgressFill = document.getElementById('totalProgressFill');
    const totalProgressText = document.getElementById('totalProgressText');
    
    if (totalProgressPercent) totalProgressPercent.textContent = percentage + '%';
    if (totalProgressFill) totalProgressFill.style.width = percentage + '%';
    if (totalProgressText) totalProgressText.textContent = `${ratedModuls} dari ${totalModuls} modul sudah dinilai (${percentage}%)`;
    
    // Update summary
    const totalModulsEl = document.getElementById('totalModuls');
    const ratedModulsEl = document.getElementById('ratedModuls');
    const pendingModulsEl = document.getElementById('pendingModuls');
    const averageScoreEl = document.getElementById('averageScore');
    
    if (totalModulsEl) totalModulsEl.textContent = totalModuls;
    if (ratedModulsEl) ratedModulsEl.textContent = ratedModuls;
    if (pendingModulsEl) pendingModulsEl.textContent = totalModuls - ratedModuls;
    
    // Calculate average score
    let avgScore = ratedModuls > 0 
        ? (rekapData.reduce((sum, r) => sum + r.skala100, 0) / ratedModuls).toFixed(1)
        : 0;
    if (averageScoreEl) averageScoreEl.textContent = avgScore;
    
    // Update assignment stats
    updateAssignmentStats();
}

// ================= TAB FUNCTIONS =================
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-pane').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Deactivate all tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // Show selected tab
    const tabElement = document.getElementById(tabName + 'Tab');
    if (tabElement) {
        tabElement.classList.remove('hidden');
    }
    
    // Activate selected tab button
    const tabBtn = document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1) + 'Btn');
    if (tabBtn) {
        tabBtn.classList.add('active');
    }
    
    // Refresh rekap if rekap tab is selected
    if (tabName === 'rekap') {
        setTimeout(() => {
            renderRekap();
        }, 100);
    }
}

// ================= MODUL PREVIEW FUNCTIONS =================
function toggleModulPreview() {
    let content = document.getElementById('modulContent');
    let toggle = document.getElementById('previewToggle');
    
    if (content.style.display === 'none' || content.style.display === '') {
        content.style.display = 'block';
        if (toggle) toggle.innerHTML = '<i class="fas fa-chevron-up"></i>';
    } else {
        content.style.display = 'none';
        if (toggle) toggle.innerHTML = '<i class="fas fa-chevron-down"></i>';
    }
}

function resizeFrame(height) {
    let iframe = document.getElementById('embedFrame');
    if (iframe) {
        iframe.style.height = height + 'px';
    }
}

// ================= EXPORT TO EXCEL =================
function exportToExcel() {
    console.log("Exporting to Excel...");
    
    if (!dataBackup || dataBackup.length === 0) {
        showTempMessage("⚠️ Tidak ada data untuk diexport", "warning");
        return;
    }
    
    try {
        // Prepare data for Excel
        const excelData = prepareExcelData();
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(excelData);
        
        // Set column widths
        const wscols = [
            { wch: 5 },   // No
            { wch: 15 },  // Mapel
            { wch: 8 },   // Level
            { wch: 40 },  // Lesson
            { wch: 25 },  // Writer/Penulis
            { wch: 15 },  // Penilai
            { wch: 10 },  // Status
            { wch: 12 },  // Total Skor
            { wch: 12 },  // Skala 100
            { wch: 50 }   // Detail Skor
        ];
        ws['!cols'] = wscols;
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, "Rekap Penilaian");
        
        // Create summary sheet
        const summaryData = prepareSummaryData();
        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Ringkasan");
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const filename = `Rekap_Penilaian_Modul_${timestamp}.xlsx`;
        
        // Save file
        XLSX.writeFile(wb, filename);
        
        console.log("✅ Excel exported:", filename);
        showTempMessage(`✅ Excel berhasil diexport: ${filename}`, "success");
        
    } catch (error) {
        console.error("❌ Error exporting to Excel:", error);
        showTempMessage("⚠️ Gagal mengekspor ke Excel", "warning");
    }
}

function prepareExcelData() {
    const excelRows = [];
    
    // Add header
    excelRows.push({
        "No": "No",
        "Mata Pelajaran": "Mata Pelajaran",
        "Level": "Level",
        "Lesson/Modul": "Lesson/Modul",
        "Penulis/Writer": "Penulis/Writer",
        "Penilai/Evaluator": "Penilai/Evaluator",
        "Status": "Status",
        "Total Skor": "Total Skor",
        "Skala 100": "Skala 100",
        "Detail Skor (0-10)": "Detail Skor (0-10)"
    });
    
    // Add data rows
    dataBackup.forEach((modul, index) => {
        let key = modul.fullKey;
        let assignedEvaluator = assignmentMap[key];
        let evaluatorName = evaluatorAssignment[key];
        
        // Find rating for this module
        let rating = rekapData.find(r => 
            r.mapel === modul.mapel && 
            r.level === modul.level && 
            r.lesson === modul.lesson
        );
        
        let isRated = !!rating;
        let status = isRated ? "SELESAI" : "BELUM";
        let totalSkor = isRated ? rating.total : "-";
        let skala100 = isRated ? rating.skala100 : "-";
        let writer = rating?.writer || modul.writer || 'Tidak diketahui';
        
        // Format details
        let details = "-";
        if (isRated && rating.details) {
            details = rating.details.map((s, i) => {
                const aspekName = aspekBase[i] ? aspekBase[i][0] : 'Virtual Lab';
                return `${aspekName}: ${s}`;
            }).join('; ');
        }
        
        excelRows.push({
            "No": index + 1,
            "Mata Pelajaran": modul.mapel,
            "Level": `Level ${modul.level}`,
            "Lesson/Modul": modul.lesson || '-',
            "Penulis/Writer": writer,
            "Penilai/Evaluator": evaluatorName || 'Belum ditentukan',
            "Status": status,
            "Total Skor": totalSkor,
            "Skala 100": skala100,
            "Detail Skor (0-10)": details
        });
    });
    
    return excelRows;
}

function prepareSummaryData() {
    const totalModuls = dataBackup.length;
    const ratedModuls = rekapData.length;
    const pendingModuls = totalModuls - ratedModuls;
    const percentage = totalModuls > 0 ? Math.round((ratedModuls / totalModuls) * 100) : 0;
    
    // Calculate average score
    let avgScore = ratedModuls > 0 
        ? (rekapData.reduce((sum, r) => sum + r.skala100, 0) / ratedModuls).toFixed(1)
        : 0;
    
    // Count by evaluator
    let amarCount = 0, rinaCount = 0;
    dataBackup.forEach(lesson => {
        let key = lesson.fullKey;
        if (assignmentMap[key] === 'amar') amarCount++;
        if (assignmentMap[key] === 'rina') rinaCount++;
    });
    
    // Rated by evaluator
    let amarRated = rekapData.filter(r => r.evaluator === 'Mr. Amar').length;
    let rinaRated = rekapData.filter(r => r.evaluator === 'Ms. Rina').length;
    
    // Count unique writers
    const writers = [...new Set(dataBackup.map(x => x.writer).filter(Boolean))];
    
    const summaryRows = [
        { "Parameter": "Total Lesson", "Nilai": totalModuls },
        { "Parameter": "Sudah Dinilai", "Nilai": `${ratedModuls} (${percentage}%)` },
        { "Parameter": "Belum Dinilai", "Nilai": pendingModuls },
        { "Parameter": "Rata-rata Skor (0-100)", "Nilai": avgScore },
        { "Parameter": "Jumlah Penulis Modul", "Nilai": writers.length },
        { "Parameter": "", "Nilai": "" },
        { "Parameter": "=== Mr. Amar ===", "Nilai": "" },
        { "Parameter": "Jumlah Lesson", "Nilai": amarCount },
        { "Parameter": "Sudah Dinilai", "Nilai": `${amarRated} (${amarCount > 0 ? Math.round((amarRated / amarCount) * 100) : 0}%)` },
        { "Parameter": "", "Nilai": "" },
        { "Parameter": "=== Ms. Rina ===", "Nilai": "" },
        { "Parameter": "Jumlah Lesson", "Nilai": rinaCount },
        { "Parameter": "Sudah Dinilai", "Nilai": `${rinaRated} (${rinaCount > 0 ? Math.round((rinaRated / rinaCount) * 100) : 0}%)` },
        { "Parameter": "", "Nilai": "" },
        { "Parameter": "Tanggal Export", "Nilai": new Date().toLocaleString('id-ID') },
        { "Parameter": "Total Penilaian di Firebase", "Nilai": rekapData.length }
    ];
    
    return summaryRows;
}

// ================= EXPORT TO PDF =================
function exportToPDF() {
    console.log("Exporting to PDF...");
    
    if (!dataBackup || dataBackup.length === 0) {
        showTempMessage("⚠️ Tidak ada data untuk diexport", "warning");
        return;
    }
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        
        // Add title
        doc.setFontSize(16);
        doc.text("REKAP PENILAIAN MODUL DIGITAL", 14, 15);
        doc.setFontSize(10);
        doc.text(`Tanggal: ${new Date().toLocaleString('id-ID')}`, 14, 22);
        
        // Prepare table data
        const tableData = [];
        const headers = ["No", "Mapel", "Level", "Lesson", "Penulis", "Penilai", "Status", "Total", "Skala100", "Detail"];
        
        // Add data rows
        dataBackup.forEach((modul, index) => {
            let key = modul.fullKey;
            let evaluatorName = evaluatorAssignment[key];
            let rating = rekapData.find(r => 
                r.mapel === modul.mapel && 
                r.level === modul.level && 
                r.lesson === modul.lesson
            );
            
            let isRated = !!rating;
            let status = isRated ? "✓" : "✗";
            let totalSkor = isRated ? rating.total.toString() : "-";
            let skala100 = isRated ? rating.skala100.toString() : "-";
            let details = isRated && rating.details ? rating.details.join(', ') : "-";
            let writer = rating?.writer || modul.writer || '-';
            
            tableData.push([
                (index + 1).toString(),
                modul.mapel.substring(0, 12),
                modul.level,
                modul.lesson.substring(0, 25),
                writer.substring(0, 20),
                evaluatorName ? evaluatorName.substring(0, 10) : "-",
                status,
                totalSkor,
                skala100,
                details.substring(0, 30)
            ]);
        });
        
        // Create table
        doc.autoTable({
            head: [headers],
            body: tableData,
            startY: 30,
            theme: 'grid',
            styles: { fontSize: 7 },
            headStyles: { fillColor: [67, 97, 238] },
            columnStyles: {
                0: { cellWidth: 8 },
                1: { cellWidth: 20 },
                2: { cellWidth: 12 },
                3: { cellWidth: 30 },
                4: { cellWidth: 25 },
                5: { cellWidth: 18 },
                6: { cellWidth: 12 },
                7: { cellWidth: 12 },
                8: { cellWidth: 12 },
                9: { cellWidth: 35 }
            }
        });
        
        // Add summary on second page
        doc.addPage();
        doc.setFontSize(14);
        doc.text("RINGKASAN STATISTIK", 14, 15);
        
        const summaryData = prepareSummaryData();
        const summaryTable = summaryData.filter(row => row.Parameter && row.Nilai !== "");
        
        doc.autoTable({
            body: summaryTable.map(row => [row.Parameter, row.Nilai]),
            startY: 25,
            theme: 'plain',
            styles: { fontSize: 10 },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 70 },
                1: { cellWidth: 40 }
            }
        });
        
        // Save PDF
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        doc.save(`Rekap_Penilaian_${timestamp}.pdf`);
        
        console.log("✅ PDF exported");
        showTempMessage("✅ PDF berhasil diexport", "success");
        
    } catch (error) {
        console.error("❌ Error exporting to PDF:", error);
        showTempMessage("⚠️ Gagal mengekspor ke PDF", "warning");
    }
}

// ================= UTILITY FUNCTIONS =================
function showTempMessage(message, type = 'info') {
    console.log(`${type.toUpperCase()}: ${message}`);
    
    // Hapus notifikasi sebelumnya
    const existingNotifications = document.querySelectorAll('.temp-notification');
    existingNotifications.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = 'temp-notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'warning' ? '#ffc107' : 
                    type === 'error' ? '#dc3545' : 
                    type === 'success' ? '#28a745' : '#17a2b8'};
        color: ${type === 'warning' ? '#856404' : 'white'};
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        z-index: 1000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
        word-wrap: break-word;
        display: flex;
        align-items: center;
        gap: 10px;
    `;
    notification.innerHTML = `
        <i class="fas fa-${type === 'warning' ? 'exclamation-triangle' : 
                        type === 'error' ? 'exclamation-circle' : 
                        type === 'success' ? 'check-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function showCriticalError(message) {
    console.error(message);
    
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #dc3545;
        color: white;
        padding: 15px;
        text-align: center;
        z-index: 9999;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
    `;
    errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    document.body.prepend(errorDiv);
    
    // Update rekap table
    const tbody = document.getElementById('rekapTableBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 40px; color: #dc3545;">
            <i class="fas fa-exclamation-triangle"></i> ${message}
        </td></tr>`;
    }
}

function showSuccessMessage(evaluator, total, skala100) {
    const evalColor = evaluator === 'Mr. Amar' ? '#4cc9f0' : '#f72585';
    const successMsg = document.createElement('div');
    successMsg.className = 'temp-notification';
    successMsg.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, ${evalColor}, ${evalColor}99);
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        box-shadow: 0 4px 15px ${evalColor}33;
        z-index: 1000;
        animation: slideIn 0.5s ease;
        max-width: 400px;
    `;
    successMsg.innerHTML = `
        <i class="fas fa-check-circle"></i> 
        <div>
            <strong>${evaluator}</strong>: Data penilaian berhasil disimpan!
            <br><small>Skor: ${total} | Skala 100: ${skala100}</small>
        </div>
    `;
    
    // Hapus notifikasi sebelumnya
    const existingNotifications = document.querySelectorAll('.temp-notification');
    existingNotifications.forEach(n => n.remove());
    
    document.body.appendChild(successMsg);
    
    setTimeout(() => {
        successMsg.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => successMsg.remove(), 300);
    }, 3000);
}

// ================= SETUP EVENT LISTENERS =================
function setupEventListeners() {
    console.log("Setting up event listeners...");
    
    // Tab buttons
    document.getElementById('tabInputBtn').addEventListener('click', () => showTab('input'));
    document.getElementById('tabRekapBtn').addEventListener('click', () => showTab('rekap'));
    
    // Save button
    document.getElementById('saveBtn').addEventListener('click', simpan);
    
    // Export buttons
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    const exportPDFBtn = document.getElementById('exportPDFBtn');
    
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', exportToExcel);
    }
    if (exportPDFBtn) {
        exportPDFBtn.addEventListener('click', exportToPDF);
    }
    
    // Modul preview toggle
    document.getElementById('modulHeader').addEventListener('click', toggleModulPreview);
    
    // Resize buttons
    document.querySelectorAll('.resize-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const height = parseInt(this.getAttribute('data-height'));
            resizeFrame(height);
        });
    });
    
    // Dropdown change events
    document.getElementById('mapel').addEventListener('change', onMapelChange);
    document.getElementById('level').addEventListener('change', onLevelChange);
    document.getElementById('lesson').addEventListener('change', onLessonChange);
}

function initSystem() {
    // Initialize dropdown
    initDropdown();
    
    // Calculate assignment
    calculateAssignment();
    
    // Show rekap
    renderRekap();
    
    // Update progress
    updateProgress();
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Check if running on file:// protocol
function isFileProtocol() {
    return window.location.protocol === 'file:';
}

// If running on file protocol, warn user
if (isFileProtocol()) {
    console.warn("Running on file:// protocol. Some features may be limited.");
    document.addEventListener('DOMContentLoaded', function() {
        const warningDiv = document.createElement('div');
        warningDiv.style.cssText = `
            background: #ffc107;
            color: #856404;
            padding: 10px;
            text-align: center;
            font-size: 12px;
            border-bottom: 1px solid #ffb74d;
        `;
        warningDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Running from local file. For best results, use a local server (XAMPP, Live Server, etc.)';
        document.body.prepend(warningDiv);
    });
}