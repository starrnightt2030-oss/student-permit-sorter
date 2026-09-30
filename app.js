const DB_NAME = 'permitSorterDB';
const STORE = 'students';
const DB_VERSION = 1;

let students = [];
let recognition = null;
let listening = false;
let deferredInstall = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const demo = [
  ['1001', 'أحمد محمد علي', 'كهرباء'],
  ['1002', 'محمد أحمد حسن', 'تبريد وتكييف'],
  ['1003', 'محمود علي إبراهيم', 'ميكانيكا'],
  ['1004', 'عبد الرحمن محمد سالم', 'تركيبات كهربائية'],
  ['1005', 'يوسف خالد محمود', 'كهرباء'],
  ['1006', 'عمر أحمد السيد', 'ميكانيكا'],
  ['1007', 'سيف محمد حسن', 'تبريد وتكييف'],
  ['1008', 'إسلام محمود علي', 'تركيبات كهربائية'],
  ['1009', 'أحمد محمود إبراهيم', 'كهرباء'],
  ['1010', 'محمود محمد عبد الله', 'ميكانيكا'],
  ['1011', 'مصطفى أحمد علي', 'تبريد وتكييف'],
  ['1012', 'حسن إبراهيم محمد', 'كهرباء'],
  ['1013', 'علي محمد حسن', 'تركيبات كهربائية'],
  ['1014', 'زياد محمود أحمد', 'ميكانيكا'],
  ['1015', 'كريم أحمد سالم', 'كهرباء'],
  ['1016', 'عبد الله محمد علي', 'تبريد وتكييف'],
  ['1017', 'يوسف محمود حسن', 'تركيبات كهربائية'],
  ['1018', 'خالد إبراهيم علي', 'ميكانيكا'],
  ['1019', 'محمد علي محمود', 'كهرباء'],
  ['1020', 'سيف أحمد إبراهيم', 'تبريد وتكييف']
].map(([id, name, major]) => ({
  id,
  name,
  major,
  sorted: false,
  sortedAt: null
}));

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Database error'));
  });
}

async function saveAll(items) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);

    store.clear();

    items.forEach((item) => store.put(item));

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Database write error'));
    };
  });
}

async function loadAll() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly')
      .objectStore(STORE)
      .getAll();

    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };

    request.onerror = () => {
      db.close();
      reject(request.error || new Error('Database read error'));
    };
  });
}

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/\s+/g, '');
}

function score(a, b) {
  a = normalize(a);
  b = normalize(b);

  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const m = a.length;
  const n = b.length;

  const dp = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }

  return 1 - dp[m][n] / Math.max(m, n);
}

function searchStudents(query) {
  return students
    .map((student) => ({
      ...student,
      score: score(student.name, query)
    }))
    .filter((student) => student.score >= 0.42)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);
}

function renderStats() {
  const total = students.length;
  const done = students.filter((student) => student.sorted).length;

  const totalCount = $('#totalCount');
  const sortedCount = $('#sortedCount');
  const remainingCount = $('#remainingCount');

  if (totalCount) totalCount.textContent = total;
  if (sortedCount) sortedCount.textContent = done;
  if (remainingCount) remainingCount.textContent = total - done;

  renderSpecs();
}

function renderSpecs() {
  const container = $('#specializationList');
  if (!container) return;

  const map = {};

  students.forEach((student) => {
    if (!map[student.major]) {
      map[student.major] = { total: 0, done: 0 };
    }

    map[student.major].total++;

    if (student.sorted) {
      map[student.major].done++;
    }
  });

  const entries = Object.entries(map);

  container.innerHTML =
    entries
      .map(([major, values]) => {
        const percent = values.total
          ? Math.round((values.done / values.total) * 100)
          : 0;

        return `
          <div class="spec-row">
            <div class="spec-line">
              <b>${esc(major)}</b>
              <span>${values.done} / ${values.total} • ${percent}%</span>
            </div>
            <div class="bar">
              <i style="width:${percent}%"></i>
            </div>
          </div>
        `;
      })
      .join('') ||
    '<div style="text-align:center;color:#718096;font-size:11px;padding:20px">استورد بيانات الطلاب للبدء</div>';
}

function renderResults(list) {
  const box = $('#results');
  if (!box) return;

  if (!list.length) {
    box.innerHTML =
      '<div style="padding:18px;text-align:center;color:#718096;font-size:11px">لم يتم العثور على طالب مطابق.</div>';
    return;
  }

  box.innerHTML = list
    .map(
      (student) => `
        <div class="student-card" data-id="${esc(student.id)}">
          <div class="student-top">
            <div class="avatar">${esc(student.name.trim()[0] || 'ط')}</div>
            <div>
              <div class="student-name">${esc(student.name)}</div>
              <div class="student-id">رقم الطالب: ${esc(student.id)}</div>
            </div>
          </div>

          ${
            student.sorted
              ? '<div class="warning">⚠️ تم فرز تصريح هذا الطالب بالفعل.</div>'
              : ''
          }

          <div class="major">
            <small>التخصص</small>
            <b>${esc(student.major)}</b>
          </div>

          <button
            class="sort-btn ${student.sorted ? 'done' : ''}"
            onclick="toggleSorted('${esc(student.id)}')"
          >
            ${student.sorted ? '✓ تم الفرز' : '✓ تم فرز التصريح'}
          </button>
        </div>
      `
    )
    .join('');
}

window.toggleSorted = async (id) => {
  const student = students.find(
    (item) => String(item.id) === String(id)
  );

  if (!student) return;

  student.sorted = !student.sorted;
  student.sortedAt = student.sorted
    ? new Date().toISOString()
    : null;

  try {
    await saveAll(students);
    renderStats();

    const input = $('#searchInput');
    if (input && input.value.trim()) {
      renderResults(searchStudents(input.value));
    } else {
      renderResults([]);
    }

    toast(
      student.sorted
        ? 'تم تسجيل فرز التصريح ✓'
        : 'تم إلغاء حالة الفرز'
    );
  } catch (error) {
    console.error(error);
    toast('تعذر حفظ حالة الطالب');
  }
};

function doSearch(query) {
  query = String(query || '').trim();

  if (!query) {
    const results = $('#results');
    const status = $('#searchStatus');

    if (results) results.innerHTML = '';
    if (status) status.textContent = 'جاهز للبحث';
    return;
  }

  const status = $('#searchStatus');

  if (status) status.textContent = 'جاري البحث...';

  const results = searchStudents(query);
  renderResults(results);

  if (status) {
    status.textContent = results.length
      ? `تم العثور على ${results.length} نتيجة`
      : 'لم يتم العثور على نتيجة';
  }
}

function setupSearch() {
  const searchInput = $('#searchInput');
  const clearSearch = $('#clearSearch');

  if (!searchInput) return;

  let timer;

  searchInput.addEventListener('input', (event) => {
    clearTimeout(timer);

    timer = setTimeout(() => {
      doSearch(event.target.value);
    }, 120);
  });

  if (clearSearch) {
    clearSearch.onclick = () => {
      searchInput.value = '';

      const results = $('#results');
      const status = $('#searchStatus');

      if (results) results.innerHTML = '';
      if (status) status.textContent = 'جاهز للبحث';

      searchInput.focus();
    };
  }
}

function setupSpeech() {
  const voiceButton = $('#voiceBtn');

  if (!voiceButton) return;

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    voiceButton.onclick = () => {
      toast(
        'البحث الصوتي غير مدعوم في هذا المتصفح، استخدم البحث الكتابي'
      );
    };
    return;
  }

  recognition = new SpeechRecognition();

  recognition.lang = 'ar-EG';
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 4;

  recognition.onstart = () => {
    listening = true;

    voiceButton.classList.add('listening');

    const status = $('#searchStatus');
    if (status) status.textContent = 'أنا أستمع...';

    const title = voiceButton.querySelector('strong');
    if (title) title.textContent = 'تحدث الآن';
  };

  recognition.onresult = (event) => {
    const result = event.results?.[0];

    if (!result) return;

    const text = Array.from(result)
      .map((item) => item.transcript)
      .join(' ')
      .trim();

    const input = $('#searchInput');

    if (input) input.value = text;

    doSearch(text);
  };

  recognition.onerror = (event) => {
    const error = event?.error;

    if (error === 'not-allowed' || error === 'service-not-allowed') {
      toast(
        'اسمح للتطبيق بالوصول إلى الميكروفون من إعدادات المتصفح'
      );
    } else if (error === 'no-speech') {
      toast('لم يتم التقاط صوت، حاول مرة أخرى');
    } else {
      toast('تعذر التقاط الصوت، حاول مرة أخرى');
    }
  };

  recognition.onend = () => {
    listening = false;

    voiceButton.classList.remove('listening');

    const title = voiceButton.querySelector('strong');
    if (title) title.textContent = 'اضغط وتحدث';

    const input = $('#searchInput');
    const status = $('#searchStatus');

    if (status && (!input || !input.value.trim())) {
      status.textContent = 'جاهز للبحث';
    }
  };

  voiceButton.onclick = () => {
    if (listening) {
      recognition.stop();
      return;
    }

    try {
      recognition.start();
    } catch (error) {
      console.warn('Speech recognition start:', error);
    }
  };
}

function setupImport() {
  const importButton = $('#importBtn');
  const fileInput = $('#fileInput');

  if (!importButton || !fileInput) return;

  importButton.onclick = () => fileInput.click();
  fileInput.onchange = handleFile;
}

async function handleFile(event) {
  const file = event.target.files?.[0];

  if (!file) return;

  if (!window.XLSX) {
    toast('مكتبة Excel لم تُحمّل بعد، حاول مرة أخرى بعد لحظات');
    event.target.value = '';
    return;
  }

  try {
    const data = await file.arrayBuffer();

    const workbook = XLSX.read(data, {
      type: 'array'
    });

    const firstSheetName = workbook.SheetNames?.[0];

    if (!firstSheetName) {
      throw new Error('No worksheet');
    }

    const worksheet = workbook.Sheets[firstSheetName];

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      defval: ''
    });

    if (!rows.length) {
      throw new Error('Empty spreadsheet');
    }

    const keys = Object.keys(rows[0]);

    const pick = (names) =>
      keys.find((key) =>
        names.some((name) =>
          normalize(key).includes(normalize(name))
        )
      );

    const idKey = pick([
      'رقم الطالب',
      'رقم',
      'student id',
      'student number',
      'id'
    ]);

    const nameKey = pick([
      'اسم الطالب',
      'الاسم',
      'student name',
      'name'
    ]);

    const majorKey = pick([
      'التخصص',
      'القسم',
      'التخصص الدراسي',
      'major',
      'specialization'
    ]);

    if (!idKey || !nameKey || !majorKey) {
      toast(
        'لم أجد الأعمدة المطلوبة: رقم الطالب، اسم الطالب، التخصص'
      );
      event.target.value = '';
      return;
    }

    const imported = rows
      .map((row) => ({
        id: String(row[idKey]).trim(),
        name: String(row[nameKey]).trim(),
        major: String(row[majorKey]).trim(),
        sorted: false,
        sortedAt: null
      }))
      .filter(
        (student) =>
          student.id &&
          student.name &&
          student.major
      );

    if (!imported.length) {
      throw new Error('No valid students');
    }

    await saveAll(imported);

    students = imported;

    renderStats();
    renderResults([]);

    toast(`تم استيراد ${imported.length} طالب بنجاح ✓`);
  } catch (error) {
    console.error(error);
    toast(
      'تعذر قراءة ملف Excel. تأكد من وجود الأعمدة المطلوبة'
    );
  } finally {
    event.target.value = '';
  }
}

function setupDemo() {
  const demoButton = $('#demoBtn');

  if (!demoButton) return;

  demoButton.onclick = async () => {
    try {
      const data = JSON.parse(JSON.stringify(demo));

      await saveAll(data);

      students = data;

      renderStats();
      renderResults([]);

      toast('تم تحميل بيانات تجريبية ✓');
    } catch (error) {
      console.error(error);
      toast('تعذر تحميل البيانات التجريبية');
    }
  };
}

function setupNavigation() {
  $$('.nav-item').forEach((button) => {
    button.onclick = () => {
      const view = button.dataset.view;

      $$('.nav-item').forEach((item) => {
        item.classList.toggle('active', item === button);
      });

      if (view === 'students') {
        showStudents();
      } else if (view === 'settings') {
        showSettings();
      } else {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }
    };
  });
}

function showStudents() {
  const content = `
    <h2 style="margin:0">كل الطلاب</h2>
    <p style="color:#718096;font-size:11px">
      ${students.length} طالب • ابحث أو راجع حالة الفرز
    </p>

    <input
      id="modalSearch"
      class="search-wrap"
      style="width:100%;font-family:inherit;padding:0 12px"
      placeholder="ابحث بالاسم أو الرقم..."
    >

    <div id="modalList" class="student-list"></div>
  `;

  openModal(content);

  const modalSearch = $('#modalSearch');
  const modalList = $('#modalList');

  if (!modalSearch || !modalList) return;

  const render = () => {
    const query = normalize(modalSearch.value);

    const list = students.filter(
      (student) =>
        !query ||
        normalize(student.name).includes(query) ||
        normalize(student.id).includes(query)
    );

    modalList.innerHTML =
      list
        .slice(0, 100)
        .map(
          (student) => `
            <div class="list-item">
              <div>
                <b>${esc(student.name)}</b>
                <small>
                  ${esc(student.id)} • ${esc(student.major)}
                </small>
              </div>

              <span class="pill ${student.sorted ? 'done' : ''}">
                ${student.sorted ? 'تم الفرز' : 'متبقي'}
              </span>
            </div>
          `
        )
        .join('') ||
      '<div style="text-align:center;color:#718096;font-size:11px">لا توجد نتائج</div>';
  };

  modalSearch.addEventListener('input', render);

  render();
}

function showSettings() {
  openModal(`
    <h2 style="margin:0">الإعدادات والبيانات</h2>

    <p style="color:#718096;font-size:11px">
      بيانات الطلاب محفوظة محليًا على هذا الجهاز.
    </p>

    <div class="student-list">

      <button
        class="action-card"
        style="width:100%"
        onclick="document.querySelector('#fileInput').click()"
      >
        <span>📥</span>
        <div>
          <b>استيراد ملف جديد</b>
          <small>استبدال قاعدة البيانات الحالية</small>
        </div>
      </button>

      <button
        class="action-card"
        style="width:100%"
        onclick="exportCSV()"
      >
        <span>📤</span>
        <div>
          <b>تصدير النتائج</b>
          <small>تحميل ملف CSV متوافق مع Excel</small>
        </div>
      </button>

      <button
        class="action-card"
        style="width:100%"
        onclick="clearData()"
      >
        <span>🗑️</span>
        <div>
          <b>مسح جميع البيانات</b>
          <small>لا يمكن التراجع عن هذا الإجراء</small>
        </div>
      </button>

    </div>
  `);
}

window.exportCSV = () => {
  const rows = [
    [
      'رقم الطالب',
      'اسم الطالب',
      'التخصص',
      'الحالة',
      'تاريخ الفرز'
    ],
    ...students.map((student) => [
      student.id,
      student.name,
      student.major,
      student.sorted ? 'تم الفرز' : 'متبقي',
      student.sortedAt
        ? new Date(student.sortedAt).toLocaleString('ar-EG')
        : ''
    ])
  ];

  const csv =
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map(
            (value) =>
              '"' +
              String(value ?? '').replaceAll('"', '""') +
              '"'
          )
          .join(',')
      )
      .join('\n');

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = 'student-permits-results.csv';

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  toast('تم تجهيز ملف النتائج ✓');
};

window.clearData = async () => {
  if (!confirm('هل تريد مسح جميع بيانات الطلاب؟')) {
    return;
  }

  try {
    await saveAll([]);

    students = [];

    renderStats();
    renderResults([]);

    closeModal();

    toast('تم مسح البيانات');
  } catch (error) {
    console.error(error);
    toast('تعذر مسح البيانات');
  }
};

function openModal(html) {
  const modal = $('#modal');
  const content = $('#modalContent');

  if (!modal || !content) return;

  content.innerHTML = html;
  modal.classList.remove('hidden');
}

function closeModal() {
  const modal = $('#modal');

  if (modal) {
    modal.classList.add('hidden');
  }
}

function setupModal() {
  const closeButton = $('#modalClose');
  const modal = $('#modal');

  if (closeButton) {
    closeButton.onclick = closeModal;
  }

  if (modal) {
    modal.onclick = (event) => {
      if (event.target.id === 'modal') {
        closeModal();
      }
    };
  }
}

function toast(message) {
  const element = $('#toast');

  if (!element) return;

  element.textContent = message;
  element.classList.add('show');

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    element.classList.remove('show');
  }, 2400);
}

function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      })[character]
  );
}

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();

    deferredInstall = event;

    const installButton = $('#installBtn');

    if (installButton) {
      installButton.classList.remove('hidden');
    }
  });

  const installButton = $('#installBtn');

  if (installButton) {
    installButton.onclick = async () => {
      if (!deferredInstall) {
        toast('يمكنك تثبيت التطبيق من قائمة المتصفح');
        return;
      }

      deferredInstall.prompt();

      try {
        await deferredInstall.userChoice;
      } catch (error) {
        console.warn(error);
      }

      deferredInstall = null;
      installButton.classList.add('hidden');
    };
  }
}

function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .catch((error) => {
        console.warn('Service Worker:', error);
      });
  });
}

async function initializeApp() {
  try {
    students = await loadAll();
  } catch (error) {
    console.warn('Could not load local database:', error);
    students = [];
  }

  renderStats();
  setupSearch();
  setupSpeech();
  setupImport();
  setupDemo();
  setupNavigation();
  setupModal();
  setupInstallPrompt();
  setupServiceWorker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
