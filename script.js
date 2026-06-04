
/* ============================================================
   AI INTERNSHIP ALLOCATION & RECOMMENDATION SYSTEM
   script.js — Shared Logic · API Layer · LocalStorage Fallback
   ============================================================ */
'use strict';

// ── API Configuration ─────────────────────────────────────────
const API_BASE = "https://online-internship-allocation-system.onrender.com/api";
let API_TOKEN  = localStorage.getItem('aiias_token') || null;

// ── Feature flag: use real API or LocalStorage fallback ───────
// Auto-detects: if backend is reachable, switches to API mode
let USE_API = false;

async function detectBackend() {
  try {
    const r = await fetch(`${API_BASE}/health`);
    const data = await r.json();

    USE_API = true;
    console.info("✅ Backend connected — API mode ON");

  } catch (err) {
    USE_API = false;
    console.info("ℹ️ Backend offline — LocalStorage mode");
  }
}

detectBackend();

// ─────────────────────────────────────────────────────────────
//  API LAYER
// ─────────────────────────────────────────────────────────────
const Api = {
  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (API_TOKEN) h['Authorization'] = `Bearer ${API_TOKEN}`;
    return h;
  },

  async _request(method, path, body = null, isFormData = false) {
  const headers = isFormData
    ? { Authorization: API_TOKEN ? `Bearer ${API_TOKEN}` : '' }
    : this._headers();

  const opts = { method, headers };

  if (body) {
    opts.body = isFormData ? body : JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, opts);
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON response from server");
  }

  return json;
},

  get   (path)        { return this._request('GET',    path); },
  post  (path, body)  { return this._request('POST',   path, body); },
  put   (path, body)  { return this._request('PUT',    path, body); },
  patch (path, body)  { return this._request('PATCH',  path, body); },
  del   (path)        { return this._request('DELETE', path); },
  upload(path, fd)    { return this._request('POST',   path, fd, true); },
  uploadPut(path, fd) { return this._request('PUT',    path, fd, true); },
};

// Auth helpers
const Auth = {
  setToken(token) { API_TOKEN = token; localStorage.setItem('aiias_token', token); },
  clearToken()    { API_TOKEN = null;  localStorage.removeItem('aiias_token'); },
  isLoggedIn()    { return !!API_TOKEN; },
  async login(email, password) {
    const res = await Api.post('/auth/login', { email, password });
    Auth.setToken(res.data.token);
    return res.data;
  },
  async logout() {
    try { await Api.post('/auth/logout'); } catch {}
    Auth.clearToken();
  },
};

// ─────────────────────────────────────────────────────────────
//  LOCALSTORAGE STORE (Offline fallback)
// ─────────────────────────────────────────────────────────────
const KEYS = {
  STUDENTS:    'aiias_students',
  INTERNSHIPS: 'aiias_internships',
  APPLICATIONS:'aiias_applications',
};

const Store = {
  get(key)       { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
  set(key, val)  { localStorage.setItem(key, JSON.stringify(val)); },
  getOne(key, id){ return Store.get(key).find(i => i.id === id || i._id === id) || null; },
  save(key, item) {
    const list = Store.get(key);
    const idx  = list.findIndex(i => (i.id || i._id) === (item.id || item._id));
    idx >= 0 ? list.splice(idx, 1, item) : list.push(item);
    Store.set(key, list);
  },
  remove(key, id) {
    Store.set(key, Store.get(key).filter(i => (i.id || i._id) !== id));
  },
};

// ─────────────────────────────────────────────────────────────
//  UNIFIED DATA LAYER
//  All pages call these — they auto-route to API or LocalStorage
// ─────────────────────────────────────────────────────────────
const DataService = {
  // ── Students ─────────────────────────────────────────────────
  async getStudents(params = {}) {
    if (USE_API) {
      const qs  = new URLSearchParams(params).toString();
      const res = await Api.get(`/students${qs ? '?' + qs : ''}`);
      return { data: res.data, meta: res.meta };
    }
    let data = Store.get(KEYS.STUDENTS);
    if (params.search) {
      const s = params.search.toLowerCase();
      data = data.filter(st =>
        st.fullName?.toLowerCase().includes(s) ||
        st.rollNo?.toLowerCase().includes(s)   ||
        st.department?.toLowerCase().includes(s)
      );
    }
    if (params.department) data = data.filter(st => st.department === params.department);
    if (params.semester)   data = data.filter(st => st.semester   === params.semester);
    return { data, meta: { total: data.length } };
  },

  async getStudent(id) {
    if (USE_API) { const r = await Api.get(`/students/${id}`); return r.data; }
    return Store.getOne(KEYS.STUDENTS, id);
  },

  async createStudent(formData, isFormData = true) {
  if (USE_API) {
    const r = isFormData
      ? await Api.upload('/students', formData)
      : await Api.post('/students', formData);

    return r.data;
  }

  const student = {
    ...(isFormData ? Object.fromEntries(formData) : formData),
    id: genId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  ['technicalSkills','softSkills','certifications','areasOfInterest'].forEach(f => {
    if (typeof student[f] === 'string') {
      student[f] = student[f]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    }
  });

  Store.save(KEYS.STUDENTS, student);
  return student;
},

  async updateStudent(id, formData, isFormData = false) {
    if (USE_API) {
      const r = isFormData ? await Api.uploadPut(`/students/${id}`, formData) : await Api.put(`/students/${id}`, formData);
      return r.data;
    }
    const existing = Store.getOne(KEYS.STUDENTS, id) || {};
    const updates  = isFormData ? Object.fromEntries(formData) : formData;
    ['technicalSkills','softSkills','certifications','areasOfInterest'].forEach(f => {
      if (updates[f] !== undefined && typeof updates[f] === 'string')
        updates[f] = updates[f].split(',').map(s=>s.trim()).filter(Boolean);
    });
    const updated = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
    Store.save(KEYS.STUDENTS, updated);
    return updated;
  },

  async deleteStudent(id) {
    if (USE_API) { await Api.del(`/students/${id}`); return; }
    Store.remove(KEYS.STUDENTS, id);
  },

  async getRecommendations(studentId, topN = 10) {
    if (USE_API) {
      const r = await Api.get(`/students/${studentId}/recommendations?topN=${topN}`);
      return r.data;
    }
    const student     = Store.getOne(KEYS.STUDENTS, studentId);
    const internships = Store.get(KEYS.INTERNSHIPS);
    if (!student) return [];
    return internships
      .map(i => ({ internship: i, matchScore: calcMatchScore(student, i), label: '' }))
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, topN)
      .map(r => ({
        ...r,
        label: r.matchScore>=80?'Excellent Match':r.matchScore>=60?'Good Match':r.matchScore>=40?'Fair Match':'Low Match'
      }));
  },

  // ── Internships ───────────────────────────────────────────────
  async getInternships(params = {}) {
    if (USE_API) {
      const qs  = new URLSearchParams(params).toString();
      const res = await Api.get(`/internships${qs ? '?' + qs : ''}`);
      return { data: res.data, meta: res.meta };
    }
    let data = Store.get(KEYS.INTERNSHIPS);
    if (params.search) {
      const s = params.search.toLowerCase();
      data = data.filter(i => i.title?.toLowerCase().includes(s) || i.company?.toLowerCase().includes(s));
    }
    if (params.domain)   data = data.filter(i => i.domain   === params.domain);
    if (params.location) data = data.filter(i => i.location === params.location);
    return { data, meta: { total: data.length } };
  },

  async getInternship(id) {
    if (USE_API) { const r = await Api.get(`/internships/${id}`); return r.data; }
    return Store.getOne(KEYS.INTERNSHIPS, id);
  },

  // ── Applications ──────────────────────────────────────────────
  async applyForInternship(studentId, internshipId, coverLetter = '') {
    if (USE_API) {
      const r = await Api.post('/applications', { studentId, internshipId, coverLetter });
      return r.data;
    }
    const student     = Store.getOne(KEYS.STUDENTS, studentId);
    const internship  = Store.getOne(KEYS.INTERNSHIPS, internshipId);
    const existing    = Store.get(KEYS.APPLICATIONS).find(a =>
      a.studentId === studentId && a.internshipId === internshipId
    );
    if (existing) throw new Error('You have already applied for this internship');
    const app = {
      id: genId(), studentId, internshipId,
      studentName: student?.fullName || '', rollNo: student?.rollNo || '',
      appliedAt: new Date().toISOString(), status: 'Pending',
      matchScore: calcMatchScore(student, internship), coverLetter,
    };
    Store.save(KEYS.APPLICATIONS, app);
    return app;
  },

  async getApplications(params = {}) {
    if (USE_API) {
      const qs  = new URLSearchParams(params).toString();
      const res = await Api.get(`/applications${qs ? '?' + qs : ''}`);
      return { data: res.data, meta: res.meta };
    }
    let data = Store.get(KEYS.APPLICATIONS);
    if (params.status)       data = data.filter(a => a.status      === params.status);
    if (params.studentId)    data = data.filter(a => a.studentId   === params.studentId);
    if (params.internshipId) data = data.filter(a => a.internshipId=== params.internshipId);
    return { data, meta: { total: data.length } };
  },

  async updateApplicationStatus(appId, status, adminNotes = '') {
    if (USE_API) {
      const r = await Api.patch(`/applications/${appId}/status`, { status, adminNotes });
      return r.data;
    }
    const apps = Store.get(KEYS.APPLICATIONS);
    const idx  = apps.findIndex(a => a.id === appId);
    if (idx >= 0) { apps[idx].status = status; apps[idx].adminNotes = adminNotes; }
    Store.set(KEYS.APPLICATIONS, apps);
    return apps[idx];
  },

  async getAdminDashboard() {
    if (USE_API) { const r = await Api.get('/admin/dashboard'); return r.data; }
    // Build from LocalStorage
    const students    = Store.get(KEYS.STUDENTS);
    const internships = Store.get(KEYS.INTERNSHIPS);
    const apps        = Store.get(KEYS.APPLICATIONS);
    return {
      stats: {
        totalStudents:    students.length,
        totalInternships: internships.length,
        totalApplications:apps.length,
        accepted:  apps.filter(a=>a.status==='Accepted').length,
        pending:   apps.filter(a=>a.status==='Pending').length,
        shortlisted:apps.filter(a=>a.status==='Shortlisted').length,
      },
      deptBreakdown:   Object.entries(students.reduce((m,s)=>{m[s.department]=(m[s.department]||0)+1;return m;},{})).map(([_id,count])=>({_id,count})),
      domainBreakdown: Object.entries(students.reduce((m,s)=>{m[s.preferredDomain]=(m[s.preferredDomain]||0)+1;return m;},{})).map(([_id,count])=>({_id,count})),
      recentStudents: students.slice(-5).reverse(),
      recentApplications: apps.slice(-5).reverse(),
    };
  },
};

// ─────────────────────────────────────────────────────────────
//  AI MATCH SCORE (frontend copy — mirrors backend algorithm)
// ─────────────────────────────────────────────────────────────
function calcMatchScore(student, internship) {
  if (!student || !internship) return 0;
  const toTokens = v => {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(s=>s.toLowerCase().trim()).filter(Boolean);
    return String(v).split(',').map(s=>s.toLowerCase().trim()).filter(Boolean);
  };

  // Skill match (40)
  const sSkills = toTokens(student.technicalSkills);
  const rSkills = toTokens(internship.requiredSkills);
  let skillScore = 0;
  if (rSkills.length && sSkills.length) {
    const matched = rSkills.filter(r => sSkills.some(s => s.includes(r)||r.includes(s))).length;
    skillScore = Math.round((matched / rSkills.length) * 40);
  } else if (sSkills.length) skillScore = 20;

  // Domain match (25)
  const pDomain = (student.preferredDomain||'').toLowerCase();
  const iDomain = (internship.domain||'').toLowerCase();
  let domainScore = 0;
  if (pDomain === iDomain) domainScore = 25;
  else if (pDomain && iDomain && pDomain.split(' ').some(w=>iDomain.includes(w))) domainScore = 12;

  // CGPA match (20)
  const cgpa    = parseFloat(student.cgpa||0);
  const minCgpa = parseFloat(internship.minCgpa||0);
  let cgpaScore = 0;
  if (cgpa >= minCgpa)        cgpaScore = Math.min(20, 15 + Math.round((cgpa-minCgpa)*2));
  else if (minCgpa-cgpa<=0.5) cgpaScore = 8;

  // Interest match (15)
  const interests  = toTokens(student.areasOfInterest);
  const dWords     = iDomain.split(/\s+/).filter(w=>w.length>2);
  let interestScore = 0;
  if (interests.some(i=>dWords.some(d=>i.includes(d)||d.includes(i)))) interestScore += 10;
  const certWords = toTokens(student.certifications).join(' ').split(/\s+/);
  if (certWords.some(c=>dWords.some(d=>c.includes(d)||d.includes(c)))) interestScore += 5;
  interestScore = Math.min(15, interestScore);

  return Math.min(100, skillScore + domainScore + cgpaScore + interestScore);
}

// ─────────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────────
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function fmtDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

// ── Toast Notifications ──────────────────────────────────────
function showToast(msg, type = 'info') {
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const container = document.getElementById('toastContainer') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(toast);
  setTimeout(() => toast?.remove(), 3500);
}
function createToastContainer() {
  const div = document.createElement('div');
  div.id = 'toastContainer'; div.className = 'toast-container';
  document.body.appendChild(div); return div;
}

// ── Modal Helpers ─────────────────────────────────────────────
function openModal(id)  { const m=document.getElementById(id); if(m){m.classList.add('open');document.body.style.overflow='hidden';} }
function closeModal(id) { const m=document.getElementById(id); if(m){m.classList.remove('open');document.body.style.overflow='';} }

// ── Form Validation ───────────────────────────────────────────
function validateField(input) {
  const errEl = input.parentElement.querySelector('.form-error');
  const rules = {
    required:(v)=>v.trim()!=='',
    email:   (v)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    phone:   (v)=>/^[0-9]{10}$/.test(v.replace(/\s/g,'')),
    cgpa:    (v)=>{ const n=parseFloat(v); return !isNaN(n)&&n>=0&&n<=10; },
    percent: (v)=>{ const n=parseFloat(v); return !isNaN(n)&&n>=0&&n<=100; },
  };
  const messages = {
    required:'This field is required.',
    email:   'Enter a valid email address.',
    phone:   'Enter a valid 10-digit phone number.',
    cgpa:    'CGPA must be between 0 and 10.',
    percent: 'Percentage must be between 0 and 100.',
  };
  let valid=true, msg='';
  for (const rule of (input.dataset.validate||'').split(' ')) {
    if (rules[rule] && !rules[rule](input.value)) { valid=false; msg=messages[rule]; break; }
  }
  if (errEl) { errEl.textContent=msg; errEl.classList.toggle('show',!valid); }
  input.classList.toggle('error',!valid);
  return valid;
}
function validateForm(formId) {
  const form=document.getElementById(formId); if(!form) return false;
  let ok=true;
  form.querySelectorAll('[data-validate]').forEach(inp=>{ if(!validateField(inp)) ok=false; });
  return ok;
}

// ── Tags Input ─────────────────────────────────────────────────
function initTagsInput(wrapperId, hiddenInputId) {
  const wrapper = document.getElementById(wrapperId);
  const hidden  = document.getElementById(hiddenInputId);
  if (!wrapper || !hidden) return;
  let tags = hidden.value ? hidden.value.split(',').map(t=>t.trim()).filter(Boolean) : [];

  function render() {
    const input = wrapper.querySelector('.tags-input');
    wrapper.querySelectorAll('.tag-item').forEach(el=>el.remove());
    tags.forEach(tag => {
      const el = document.createElement('span');
      el.className = 'tag-item';
      el.innerHTML = `${tag}<button class="tag-remove">✕</button>`;
      el.querySelector('.tag-remove').addEventListener('click', ()=>{ tags=tags.filter(t=>t!==tag); hidden.value=tags.join(','); render(); });
      wrapper.insertBefore(el, input);
    });
    hidden.value = tags.join(',');
  }

  const input = wrapper.querySelector('.tags-input');
  if (input) {
    input.addEventListener('keydown', e=>{
      if ((e.key==='Enter'||e.key===',') && input.value.trim()) {
        e.preventDefault();
        const v=input.value.trim().replace(/,$/,'');
        if (v && !tags.includes(v)) { tags.push(v); render(); }
        input.value='';
      } else if (e.key==='Backspace' && !input.value && tags.length) { tags.pop(); render(); }
    });
    wrapper.addEventListener('click', ()=>input.focus());
  }
  render();
  return { getTags:()=>tags, setTags:(t)=>{ tags=t; render(); } };
}

// ── File Upload Init ──────────────────────────────────────────
function initFileUpload(areaId) {
  const area=document.getElementById(areaId); if(!area) return;
  const input=area.querySelector('input[type=file]');
  const label=area.querySelector('.file-name');
  area.addEventListener('click', ()=>input.click());
  area.addEventListener('dragover', e=>{ e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', ()=>area.classList.remove('dragover'));
  area.addEventListener('drop', e=>{ e.preventDefault(); area.classList.remove('dragover'); if(e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
  input.addEventListener('change', ()=>{ if(input.files.length) handleFile(input.files[0]); });
  function handleFile(file) {
    if (label) label.textContent=`📎 ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
    area.dataset.fileName=file.name; area._file=file;
  }
}

// ── Navigation ─────────────────────────────────────────────────
function initNav() {
  const toggle=document.querySelector('.nav-toggle');
  const links =document.querySelector('.nav-links');
  if (toggle&&links) {
    toggle.addEventListener('click', ()=>{ toggle.classList.toggle('open'); links.classList.toggle('open'); });
  }
  const path=location.pathname.split('/').pop()||'index.html';
  document.querySelectorAll('.nav-links a').forEach(a=>{
    const href=a.getAttribute('href');
    if (href===path||(path===''&&href==='index.html')) a.classList.add('active');
  });
  window.addEventListener('scroll', ()=>{ document.querySelector('.navbar')?.classList.toggle('scrolled',window.scrollY>20); });
}

// ── Seed default internships (LocalStorage mode) ──────────────
function seedInternships() {
  if (Store.get(KEYS.INTERNSHIPS).length>0) return;
  const defaults=[
    { id:genId(),title:'AI/ML Engineering Intern',company:'TechCorp Solutions',domain:'Artificial Intelligence',location:'Pune',duration:'3 months',stipend:'₹15,000/mo',requiredSkills:['Python','Machine Learning','TensorFlow','NumPy'],minCgpa:'7.0',seats:5,description:'Work on cutting-edge ML models and deployment pipelines. Build and train deep learning models for real-world problems.',deadline:'2025-08-30',tags:['AI','Python','ML'],isActive:true },
    { id:genId(),title:'Full Stack Web Developer Intern',company:'InnovateTech',domain:'Web Development',location:'Mumbai',duration:'6 months',stipend:'₹12,000/mo',requiredSkills:['React','Node.js','MongoDB','JavaScript','CSS'],minCgpa:'6.5',seats:8,description:'Build responsive web applications using React and Node.js. Collaborate with design and backend teams.',deadline:'2025-09-15',tags:['React','Node.js','Full Stack'],isActive:true },
    { id:genId(),title:'Data Science Intern',company:'DataInsights Pvt Ltd',domain:'Data Science',location:'Bangalore',duration:'4 months',stipend:'₹18,000/mo',requiredSkills:['Python','Pandas','SQL','Data Visualization','Statistics'],minCgpa:'7.5',seats:4,description:'Analyze large datasets and build predictive models. Create dashboards for business decisions.',deadline:'2025-07-20',tags:['Data Science','Python','SQL'],isActive:true },
    { id:genId(),title:'Android App Developer Intern',company:'MobileFirst Studios',domain:'Mobile Development',location:'Hyderabad',duration:'3 months',stipend:'₹10,000/mo',requiredSkills:['Java','Kotlin','Android Studio','Firebase'],minCgpa:'6.0',seats:6,description:'Develop Android applications for millions of users. Work with Kotlin and Jetpack Compose.',deadline:'2025-09-01',tags:['Android','Kotlin','Mobile'],isActive:true },
    { id:genId(),title:'Cybersecurity Analyst Intern',company:'SecureNet Labs',domain:'Cybersecurity',location:'Delhi',duration:'3 months',stipend:'₹14,000/mo',requiredSkills:['Network Security','Linux','Python','Ethical Hacking','OWASP'],minCgpa:'7.0',seats:3,description:'Assist in vulnerability assessments and penetration testing.',deadline:'2025-08-10',tags:['Security','Linux','Networking'],isActive:true },
    { id:genId(),title:'Cloud Infrastructure Intern',company:'CloudScale Inc',domain:'Cloud Computing',location:'Pune',duration:'6 months',stipend:'₹20,000/mo',requiredSkills:['AWS','Docker','Kubernetes','Linux','Terraform'],minCgpa:'7.0',seats:4,description:'Deploy and manage cloud infrastructure on AWS with containerization and CI/CD.',deadline:'2025-08-25',tags:['AWS','Docker','Cloud'],isActive:true },
    { id:genId(),title:'UI/UX Design Intern',company:'PixelCraft Design',domain:'UI/UX Design',location:'Bangalore',duration:'3 months',stipend:'₹10,000/mo',requiredSkills:['Figma','Adobe XD','HTML','CSS','User Research'],minCgpa:'6.0',seats:5,description:'Design beautiful user interfaces and conduct usability testing.',deadline:'2025-07-25',tags:['Figma','Design','UX'],isActive:true },
    { id:genId(),title:'IoT Systems Intern',company:'SmartTech Industries',domain:'Internet of Things',location:'Chennai',duration:'4 months',stipend:'₹12,000/mo',requiredSkills:['Arduino','Raspberry Pi','Python','C++','Embedded Systems'],minCgpa:'6.5',seats:4,description:'Develop IoT prototypes and integrate sensors with cloud platforms.',deadline:'2025-08-20',tags:['IoT','Arduino','Embedded'],isActive:true },
    { id:genId(),title:'DevOps Engineer Intern',company:'Infra Solutions Ltd',domain:'DevOps',location:'Noida',duration:'6 months',stipend:'₹16,000/mo',requiredSkills:['Linux','Docker','Jenkins','Git','Bash'],minCgpa:'6.5',seats:3,description:'Build CI/CD pipelines, automate deployments, and manage Linux servers.',deadline:'2025-09-10',tags:['DevOps','Linux','Docker'],isActive:true },
    { id:genId(),title:'Data Analyst Intern',company:'BizAnalytics Corp',domain:'Data Science',location:'Mumbai',duration:'3 months',stipend:'₹12,000/mo',requiredSkills:['SQL','Excel','Python','Tableau','Statistics'],minCgpa:'6.0',seats:6,description:'Analyse sales data and build automated reporting dashboards.',deadline:'2025-08-05',tags:['SQL','Tableau','Analytics'],isActive:true },
  ];
  Store.set(KEYS.INTERNSHIPS, defaults);
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  seedInternships();
  document.querySelectorAll('[data-validate]').forEach(inp=>{
    inp.addEventListener('blur', ()=>validateField(inp));
  });
  document.querySelectorAll('.modal-overlay').forEach(m=>{
    m.addEventListener('click', e=>{ if(e.target===m) closeModal(m.id); });
  });
});
