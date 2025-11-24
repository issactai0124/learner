// --- Global State Variables ---
let studentForm = '';
let subjectTopic = '';
let mainLanguage = '';
let quizData = [];
let studentAnswers = {};

// --- API Configuration ---
const API_URL = '/api/generate';

// --- Utility Functions ---
function getElement(id) { return document.getElementById(id); }

function getLocaleString(key) {
    try {
        if (mainLanguage && LOCALES[mainLanguage] && LOCALES[mainLanguage][key]) return LOCALES[mainLanguage][key];
        if (LOCALES['en'] && LOCALES['en'][key]) return LOCALES['en'][key];
    } catch (e) {}
    return key;
}

function toggleKind(kind) {
    const isForm = kind === 'form';
    const formInput = getElement('form-number');
    const gradeInput = getElement('grade-number');

    if (mainLanguage === 'zh') return;

    formInput.disabled = !isForm;
    gradeInput.disabled = isForm;

    if (formInput.disabled) {
        formInput.classList.add('bg-gray-50', 'text-gray-500');
    } else {
        formInput.classList.remove('bg-gray-50', 'text-gray-500');
    }

    if (gradeInput.disabled) {
        gradeInput.classList.add('bg-gray-50', 'text-gray-500');
    } else {
        gradeInput.classList.remove('bg-gray-50', 'text-gray-500');
    }
}

function transitionStep(hideId, showId) {
    const hideEl = getElement(hideId);
    const showEl = getElement(showId);

    hideEl.classList.remove('fade-in');
    hideEl.classList.add('fade-out');
    setTimeout(() => {
        hideEl.classList.add('hidden');
        showEl.classList.remove('hidden');
        setTimeout(() => {
            showEl.classList.remove('fade-out');
            showEl.classList.add('fade-in');
        }, 10);
    }, 300);
}

function setBreadcrumb(step) {
    const targets = ['crumb-lang','crumb-form','crumb-topic','crumb-quiz','crumb-feedback'];
    targets.forEach((id, idx) => {
        const el = getElement(id);
        if (!el) return;
        if (step === idx + 1) el.className = 'font-medium text-indigo-600'; else el.className = 'mx-2 text-gray-400';
    });
}

function showLoading(visible) {
    getElement('loading').classList.toggle('hidden', !visible);
    const submitBtn = getElement('submit-quiz-btn');
    submitBtn?.classList.toggle('pointer-events-none', visible);
    if (submitBtn) {
        submitBtn.disabled = visible;
        submitBtn.classList.toggle('hidden', visible || !(quizData && quizData.length));
        if (!visible) updateSubmitState();
    }
}

// --- Step Navigation Logic ---
function goToStep2() {
    try {
        let value = '';
        if (mainLanguage === 'zh') {
            const sel = getElement('zh-grade-select');
            const n = parseInt(sel?.value || '', 10);
            if (Number.isNaN(n) || n < 1 || n > 7) { alert('請選擇 1 到 7 之間的年級。'); return; }
            value = `中學 ${n} 年級`;
        } else {
            const kind = document.querySelector('input[name="levelKind"]:checked')?.value;
            if (kind === 'form') {
                const n = parseInt(getElement('form-number').value, 10);
                if (Number.isNaN(n) || n < 1 || n > 7) { alert('Please enter a Form number between 1 and 7.'); return; }
                value = `Form ${n}`;
            } else if (kind === 'grade') {
                const n = parseInt(getElement('grade-number').value, 10);
                if (Number.isNaN(n) || n < 7 || n > 12) { alert('Please enter a Grade number between 7 and 12.'); return; }
                value = `Grade ${n}`;
            } else { alert('Please select Form or Grade.'); return; }
        }

        studentForm = value;
        console.log('Selected studentForm:', studentForm);
        getElement('display-form').textContent = studentForm;
        try { sessionStorage.setItem('studentForm', studentForm); } catch (e) {}
        transitionStep('step-1', 'step-2');
        setBreadcrumb(3);
    } catch (err) { console.error('Error in goToStep2:', err); alert('An error occurred. See console for details.'); }
}

function backToStep1() {
    quizData = []; studentAnswers = {}; subjectTopic = '';
    try { sessionStorage.removeItem('quizData'); sessionStorage.removeItem('studentAnswers'); sessionStorage.removeItem('subjectTopic'); } catch (e) {}
    getElement('quiz-questions').innerHTML = '';
    getElement('answer-counter').textContent = '';
    getElement('quiz-topic').textContent = '';
    transitionStep('step-2', 'step-1'); setBreadcrumb(2);
}

function backToStep2FromQuiz() { getElement('subject-input').value = subjectTopic || ''; transitionStep('step-3', 'step-2'); setBreadcrumb(3); }
function backToStep2FromFeedback() { getElement('subject-input').value = subjectTopic || ''; transitionStep('step-4', 'step-2'); setBreadcrumb(3); }
function backToLanguage() { try { transitionStep('step-1','step-0'); } catch (e) { getElement('step-1').classList.add('hidden'); getElement('step-0').classList.remove('hidden'); } setBreadcrumb(1); }

function startQuizGeneration() {
    subjectTopic = getElement('subject-input').value.trim();
    if (!subjectTopic) { alert('Please enter a Subject or Topic to generate the quiz.'); return; }
    try { sessionStorage.setItem('subjectTopic', subjectTopic); } catch (e) {}
    getElement('quiz-topic').textContent = subjectTopic;
    transitionStep('step-2','step-3'); generateQuestions();
}

function updateStep1Display(lang) {
    const zhBlock = getElement('zh-grade-block');
    const step1 = getElement('step-1'); if (!step1) return;
    if (lang === 'zh') {
        const firstBlock = step1.querySelector('.flex.items-center.gap-6'); if (firstBlock) firstBlock.classList.add('hidden');
        const numberWrappers = step1.querySelectorAll('input[type="number"]'); numberWrappers.forEach(n => n.closest('div')?.classList.add('hidden'));
        if (zhBlock) zhBlock.classList.remove('hidden');
    } else {
        const firstBlock = step1.querySelector('.flex.items-center.gap-6'); if (firstBlock) firstBlock.classList.remove('hidden');
        const numberWrappers = step1.querySelectorAll('input[type="number"]'); numberWrappers.forEach(n => n.closest('div')?.classList.remove('hidden'));
        if (zhBlock) zhBlock.classList.add('hidden');
    }
}

// --- LLM API Call with Exponential Backoff ---
async function apiCallWithBackoff(payload, maxRetries = 5) {
    for (let i=0;i<maxRetries;i++) {
        try {
            const response = await fetch(API_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Attempt ${i+1} failed:`, error.message);
            if (i === maxRetries-1) throw error;
            const delay = Math.pow(2,i)*1000 + Math.random()*1000;
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

// --- Core Agent Function: Generate Questions (API Call 1) ---
async function generateQuestions() {
    showLoading(true);
    studentAnswers = {};
    sessionStorage.removeItem('studentAnswers'); sessionStorage.removeItem('quizData'); sessionStorage.removeItem('currentStep');
    getElement('quiz-questions').innerHTML = `<p class="text-center text-gray-500">${getLocaleString('preparing-questions')}</p>`;

    const mathWrapNote = 'When including mathematical expressions, use LaTeX and wrap inline math in $...$ and display math in $$...$$.';
    const langNote = (mainLanguage === 'zh') ? ('請以繁體中文回應。請用繁體中文撰寫題目、選項與解析，並保持輸出為結構化 JSON。' + ' ' + '當包含數學式時，請以 LaTeX 表示，並用 $...$ 包住行內數學，或用 $$...$$ 包住區塊數學。') : ('Please respond in English. Please write the questions, options, and explanations in English and return structured JSON.' + ' ' + mathWrapNote);
    const systemPrompt = "Act as a professional secondary school teacher and quiz master. Your task is to generate 5 unique multiple-choice questions for a student in " + studentForm + " on the topic: " + subjectTopic + ". Ensure the questions cover different subtopics. Provide 4 options (A, B, C, D) and the correct answer index (0-3) and a brief explanation for each question. " + langNote;
    const userQuery = (mainLanguage === 'zh') ? '請以 JSON 格式產生上述 5 題的多選題（問題、4 個選項、正確答案索引、簡短解析）。' : 'Generate the 5 multiple-choice questions now in the requested JSON format.';

    const payload = { contents:[{parts:[{text: userQuery}]}], systemInstruction:{parts:[{text: systemPrompt}]}, generationConfig:{ responseMimeType:"application/json", responseSchema:{ type:"ARRAY", items:{ type:"OBJECT", properties:{ "question": { "type": "STRING" }, "options":{ "type":"ARRAY", "items":{"type":"STRING"}}, "correctAnswerIndex":{"type":"INTEGER"}, "explanation":{"type":"STRING"} }, required:["question","options","correctAnswerIndex","explanation"] } } } };

    try {
        const result = await apiCallWithBackoff(payload);
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (jsonText) {
            quizData = JSON.parse(jsonText);
            renderQuestions(quizData);
            try { sessionStorage.setItem('quizData', JSON.stringify(quizData)); } catch (e) {}
        } else { throw new Error("No valid JSON response received from the agent."); }
    } catch (error) {
        console.error("Quiz generation failed:", error);
        getElement('quiz-questions').innerHTML = '<p class="text-red-500 font-semibold">Error generating quiz. Please try a different topic or refresh the page.</p>';
    } finally { showLoading(false); }
}

function renderQuestions(questions) {
    const container = getElement('quiz-questions'); container.innerHTML = ''; quizData = questions;
    questions.forEach((q, qIndex) => {
        const questionEl = document.createElement('div'); questionEl.className = 'bg-white p-4 rounded-xl border border-gray-200 shadow-sm';
        questionEl.innerHTML = `\n                <p class="font-semibold text-gray-800 mb-3">Q${qIndex + 1}: ${q.question}</p>\n                <div class="space-y-2">\n                    ${q.options.map((option, oIndex) => `\n                        <label class="flex items-center p-2 rounded-lg cursor-pointer hover:bg-indigo-50 transition duration-100">\n                            <input type="radio" name="question-${qIndex}" value="${oIndex}" \n                                onchange="captureAnswer(${qIndex}, ${oIndex})"\n                                class="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500">\n                            <span class="ml-3 text-sm text-gray-700">${['A', 'B', 'C', 'D'][oIndex]}. ${option}</span>\n                        </label>\n                    `).join('')}\n                </div>\n            `;
        container.appendChild(questionEl);
    });
    let saved = {}; try { saved = JSON.parse(sessionStorage.getItem('studentAnswers') || '{}'); } catch (e) { saved = {}; }
    Object.keys(saved).forEach(key => { const qIdx = parseInt(key,10); const val = saved[key]; const input = container.querySelector(`input[name="question-${qIdx}"][value="${val}"]`); if (input) { input.checked = true; studentAnswers[qIdx] = parseInt(val,10); } });
    try { sessionStorage.setItem('quizData', JSON.stringify(quizData)); } catch (e) {}
    const submitBtn = getElement('submit-quiz-btn'); if (submitBtn) submitBtn.classList.remove('hidden'); updateSubmitState(); try { renderMathsIn(container); } catch (e) {} setBreadcrumb(4);
}

function captureAnswer(qIndex, oIndex) { studentAnswers[qIndex] = oIndex; updateSubmitState(); try { sessionStorage.setItem('studentAnswers', JSON.stringify(studentAnswers)); } catch (e) {} }

function updateSubmitState() { const submitBtn = getElement('submit-quiz-btn'); if (!submitBtn) return; const total = quizData?.length || 0; const answered = Object.keys(studentAnswers).length; const enable = total > 0 && answered === total; submitBtn.disabled = !enable; submitBtn.classList.toggle('opacity-60', !enable); const counter = getElement('answer-counter'); if (counter) { const prefix = getLocaleString('answered-prefix') || 'Answered'; counter.textContent = `${prefix} ${answered} / ${total}`; } }

// Restore persisted state
function restoreState() {
    try {
        let appliedLang = false;
        const savedQuiz = JSON.parse(sessionStorage.getItem('quizData') || 'null');
        const savedAnswers = JSON.parse(sessionStorage.getItem('studentAnswers') || '{}');
        const savedForm = sessionStorage.getItem('studentForm');
        const savedTopic = sessionStorage.getItem('subjectTopic');
        const savedMainLang = sessionStorage.getItem('mainLanguage');

        if (savedForm) { studentForm = savedForm; getElement('display-form').textContent = studentForm; }
        if (savedTopic) { subjectTopic = savedTopic; getElement('quiz-topic').textContent = subjectTopic; }

        if (savedMainLang) {
            mainLanguage = savedMainLang; appliedLang = true; try { applyLocale(mainLanguage); } catch (e) { console.warn('applyLocale failed', e); }
            if (!savedQuiz) { try { transitionStep('step-0','step-1'); } catch (e) { getElement('step-0').classList.add('hidden'); getElement('step-1').classList.remove('hidden'); } try { updateStep1Display(mainLanguage); } catch (e) { console.warn('updateStep1Display', e); } setBreadcrumb(2); }
            setBreadcrumb(2);
        }
        if (savedQuiz) { window.__savedQuiz = savedQuiz; window.__savedAnswers = savedAnswers || {}; getElement('restore-banner').classList.remove('hidden'); }
    } catch (e) { console.warn('Failed to restore session state', e); }
    try { applyLocale(mainLanguage || 'en'); } catch (e) {}
    if (!appliedLang) setBreadcrumb(1);
    try { updateSubmitState(); } catch (e) {}
}

function chooseLanguage(lang) { mainLanguage = lang; try { sessionStorage.setItem('mainLanguage', lang); } catch (e) {} try { applyLocale(lang); } catch (e) { console.warn('applyLocale error', e); } try { updateStep1Display(lang); } catch (e) { console.warn('updateStep1Display', e); } transitionStep('step-0','step-1'); setBreadcrumb(2); }

function continueRestore() { const savedQuiz = window.__savedQuiz; const savedAnswers = window.__savedAnswers || {}; if (savedQuiz) { quizData = savedQuiz; studentAnswers = savedAnswers; renderQuestions(quizData); const fromStep = getElement('step-0') && !getElement('step-0').classList.contains('hidden') ? 'step-0' : 'step-1'; transitionStep(fromStep,'step-3'); setBreadcrumb(4); getElement('restore-banner').classList.add('hidden'); try { subjectTopic = sessionStorage.getItem('subjectTopic') || subjectTopic; } catch (e) {} } }

function discardRestore() { try { sessionStorage.removeItem('quizData'); sessionStorage.removeItem('studentAnswers'); } catch (e) {} window.__savedQuiz = null; window.__savedAnswers = null; getElement('restore-banner').classList.add('hidden'); }

window.addEventListener('DOMContentLoaded', restoreState);

// --- Core Agent Function: Evaluate and Suggest (API Call 2) ---
async function submitQuiz() {
    if (Object.keys(studentAnswers).length !== quizData.length) { alert('Please answer all 5 questions before submitting!'); return; }
    transitionStep('step-3','step-4'); showLoading(true);
    const startBtn = getElement('start-new-btn'); if (startBtn) startBtn.classList.add('hidden'); const teacherEl = getElement('teacher-feedback'); const reviewEl = getElement('review-panel'); if (teacherEl) teacherEl.innerHTML = `<p class="text-center text-gray-500">${getLocaleString('preparing-feedback')}</p>`; if (reviewEl) reviewEl.innerHTML = '';

    let score = 0; const studentPerformance = [];
    quizData.forEach((q,index) => { const studentA = studentAnswers[index]; const isCorrect = studentA === q.correctAnswerIndex; if (isCorrect) score++; studentPerformance.push({ question:q.question, correct:isCorrect, correct_index:q.correctAnswerIndex, student_index:studentA, options:q.options }); });
    getElement('final-score').textContent = score;

    const performanceSummary = studentPerformance.map((p,i) => { const status = p.correct ? "CORRECT" : "INCORRECT"; const studentChoice = p.options[p.student_index] || "Not Answered"; const correctChoice = p.options[p.correct_index]; return `Q${i+1} (${status}): Student chose "${studentChoice}". Correct answer was "${correctChoice}".`; }).join('\n');

    const evaluationPrompt = `\n            A student in ${studentForm} answered the following 5 questions on the topic "${subjectTopic}".\n            Their score was ${score}/5.\n            \n            Detailed Performance:\n            ---\n            ${performanceSummary}\n            ---\n\n            Based ONLY on the questions they got wrong, first provide a single paragraph of motivational and encouraging feedback (acting as a teacher). \n            Then, identify 2-3 specific subtopics where they struggled and provide 3 concrete, actionable study tips or suggestions for improvement tailored to a secondary student. \n            The output MUST use Markdown formatting for the suggestions (a bulleted list).\n        `;
    const evalLangNote = (mainLanguage === 'zh') ? '請以繁體中文回應。當包含數學式時，請使用 LaTeX 並用 $...$ 包住行內數學，或用 $$...$$ 包住區塊數學。' : 'Please respond in English. When including mathematical expressions, use LaTeX and wrap inline math in $...$ and display math in $$...$$.';
    const fullEvaluationPrompt = evalLangNote + "\n\n" + evaluationPrompt;
    const systemInstruction = "Act as a kind, insightful, and professional secondary school teacher. Provide personalized, motivational feedback and actionable study suggestions.";
    const payload = { contents:[{parts:[{text: fullEvaluationPrompt}]}], systemInstruction:{parts:[{text: systemInstruction}]}};

    try {
        const result = await apiCallWithBackoff(payload);
        const feedbackText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (feedbackText) { getElement('teacher-feedback').innerHTML = formatMarkdownToHtml(feedbackText); try { renderMathsIn(getElement('teacher-feedback')); } catch (e) {} } else { throw new Error("No evaluation feedback received."); }
        renderReviewPanel(studentPerformance);
        if (startBtn) startBtn.classList.remove('hidden'); setBreadcrumb(5);
    } catch (error) { console.error("Evaluation failed:", error); getElement('teacher-feedback').innerHTML = '<p class="text-red-500 font-semibold">Error receiving feedback from the teacher agent.</p>'; } finally { showLoading(false); }
}

// Markdown helper
function escapeHtml(str) { return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function formatMarkdownToHtml(markdown) { if (!markdown) return ''; let text = escapeHtml(markdown); text = text.replace(/`([^`]+)`/g,'<code>$1</code>'); text = text.replace(/^###\s*(.*)$/gm,'<h3>$1</h3>'); text = text.replace(/^##\s*(.*)$/gm,'<h2>$1</h2>'); text = text.replace(/^#\s*(.*)$/gm,'<h1>$1</h1>'); text = text.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>'); text = text.replace(/\*(.*?)\*/g,'<em>$1</em>'); const lines = text.split(/\r?\n/); let inList=false; const out=[]; for (let i=0;i<lines.length;i++){ const line = lines[i].trim(); if (line.startsWith('- ')) { if (!inList) { out.push('<ul>'); inList=true; } out.push('<li>'+line.slice(2)+'</li>'); } else { if (inList) { out.push('</ul>'); inList=false; } if (line==='' ) { out.push(''); } else { out.push('<p>'+line+'</p>'); } } } if (inList) out.push('</ul>'); return out.join('\n'); }

function renderReviewPanel(performance) { const reviewContainer = getElement('review-panel'); reviewContainer.innerHTML = ''; performance.forEach((p,i) => { const isCorrect = p.correct; const statusClass = isCorrect ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'; const studentChoiceText = p.options[p.student_index] || 'No Selection'; const reviewEl = document.createElement('div'); reviewEl.className = `${statusClass} p-4 rounded-lg border shadow-sm`; reviewEl.innerHTML = `\n                <p class="font-bold mb-2">Q${i + 1}: ${p.question}</p>\n                <p class="text-sm font-semibold mb-2">${isCorrect ? getLocaleString('correct-answer') : getLocaleString('incorrect-answer')}</p>\n                ${!isCorrect ? `\n                        <p class="text-sm">${getLocaleString('your-choice')}: <strong>${studentChoiceText}</strong></p>\n                    ` : ''}\n                    <div class="mt-3 p-3 bg-white border border-gray-300 rounded-md">\n                        <p class="font-semibold text-gray-800">${getLocaleString('correct-answer')}</p>\n                        <p class="text-sm mb-2 text-indigo-600"><strong>${p.options[p.correct_index]}</strong></p>\n                        <p class="text-xs text-gray-600">${quizData[i].explanation}</p>\n                    </div>\n            `; reviewContainer.appendChild(reviewEl); }); try { renderMathsIn(reviewContainer); } catch (e) {} }

function renderMathsIn(el) { if (!el) return; const attemptRender = (attemptsLeft) => { if (typeof renderMathInElement === 'function') { try { renderMathInElement(el, { delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}], throwOnError:false }); } catch (e) { console.warn('renderMathInElement failed', e); } } else { if (attemptsLeft>0) setTimeout(()=>attemptRender(attemptsLeft-1),250); else console.warn('KaTeX auto-render not available after retries. Math may not render.'); } }; attemptRender(6); }

// Post-processing helpers (kept but not auto-applied)
function wrapDetectedMath(s) { if (!s||typeof s!=='string') return s; if (s.includes('$')) return s; let modified = s; modified = modified.replace(/(^|[^\\])\bimes\b/g, (m,p1) => p1+'\\times'); modified = modified.replace(/([A-Za-z0-9]+)\^(-?\d+)/g, (m,p1,p2) => p1+'^{'+p2+'}'); const mathTokenRegex = /(\\frac\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|\\times|\^[{]?[-0-9A-Za-z]+[}]?|[A-Za-z]+\^{[-0-9A-Za-z]+}|[A-Za-z0-9]+\^[-0-9]+)/; if (mathTokenRegex.test(modified)) { const mathHint = /\\frac|\\sqrt|\\times|\^/; if (mathHint.test(modified)) modified = '$'+modified+'$'; } return modified; }
function postProcessQuizData(arr) { if (!Array.isArray(arr)) return arr; arr.forEach(item=>{ try { if (item.question) item.question = wrapDetectedMath(item.question); if (item.explanation) item.explanation = wrapDetectedMath(item.explanation); if (Array.isArray(item.options)) item.options = item.options.map(opt => wrapDetectedMath(opt)); } catch(e){ console.warn('postProcessQuizData error',e);} }); return arr; }
function postProcessFeedbackText(text) { if (!text||typeof text!=='string') return text; if (text.includes('$')) return text; const lines = text.split(/\r?\n/); for (let i=0;i<lines.length;i++){ const line = lines[i]; if (/\\frac|\\sqrt|\\times|\^|[A-Za-z0-9]+\/[A-Za-z0-9]+/.test(line)) lines[i] = '$'+line.trim()+'$'; else if (/([A-Za-z0-9]+)\^(-?\d+)/.test(line)) lines[i] = '$'+line.trim()+'$'; } const joined = lines.join('\n'); if (joined !== text) console.debug('postProcessFeedbackText applied wrapping'); return joined; }

// --- Localization support ---
const LOCALES = {
    en: {
        'app-title': 'Secondary School Knowledge Tester 🧠',
        'crumb-lang': 'Language',
        'crumb-form': 'Form/Grade',
        'crumb-topic': 'Topic',
        'crumb-quiz': 'Quiz',
        'crumb-feedback': 'Feedback',
        'restore-banner-text': 'We found a saved quiz from your previous session. Would you like to continue where you left off?',
        'btn-continue-restore': 'Continue',
        'btn-discard-restore': 'Discard',
        'step1-p': 'To start, choose whether you use "Form" or "Grade", then enter the corresponding number.',
        'step2-p': 'Got it! You are in {form}. Now, what subject or specific topic do you want to be tested on?',
        'btn-next': 'Next',
        'btn-generate': 'Generate Quiz',
        'btn-back': 'Back',
        'zh-grade-label': 'School Year',
        'submit-quiz-btn': 'Submit Answers & Get Feedback',
        'start-new-btn': 'Start New Quiz',
        'back-to-topic-btn': 'Back',
        'loading-text': 'Generating quiz and evaluation... please wait.',
        'quiz-label': 'Quiz',
        'answered-prefix': 'Answered',
        'results-title': 'Test Results & Personalized Feedback',
        'score-title': 'Your Score:',
        'eval-title': "Teacher's Evaluation:",
        'preparing-questions': 'The agent is preparing your questions...',
        'preparing-feedback': 'The agent is reviewing your answers and preparing personalized feedback...',
        'review-title': 'Review Your Answers:',
        'incorrect-answer': 'Incorrect Answer',
        'your-choice': 'Your Choice',
        'correct-answer': 'Correct Answer:',
        'subject-placeholder': 'e.g., Mathematics, Physics',
        'answer-label': 'Answer:'
    },
    zh: {
        'app-title': '中學知識測試器 🧠',
        'crumb-lang': '語言',
        'crumb-form': '年級',
        'crumb-topic': '主題',
        'crumb-quiz': '測驗',
        'crumb-feedback': '回饋',
        'restore-banner-text': '我們在上一次的瀏覽中發現未完成的測驗，要繼續剛剛的進度嗎？',
        'btn-continue-restore': '繼續',
        'btn-discard-restore': '捨棄',
        'step1-p': '開始前，請選擇你的年級。',
        'step2-p': '了解！你目前為 {form}。現在請輸入你想要測驗的科目或特定主題：',
        'btn-next': '下一步',
        'btn-generate': '產生測驗',
        'btn-back': '返回',
        'zh-grade-label': '中學',
        'submit-quiz-btn': '提交答案並獲得回饋',
        'start-new-btn': '開始新測驗',
        'back-to-topic-btn': '返回',
        'loading-text': '正在產生測驗，請稍候…',
        'quiz-label': '測驗',
        'answered-prefix': '已回答',
        'results-title': '測驗結果與個人化回饋',
        'score-title': '你的分數：',
        'eval-title': '老師回饋：',
        'preparing-questions': '代理正在準備你的題目…',
        'preparing-feedback': '代理正在審閱你的答案並準備個人化回饋…',
        'review-title': '檢視你的答案：',
        'incorrect-answer': '答錯',
        'your-choice': '你的選擇',
        'correct-answer': '正確答案：',
        'subject-placeholder': '例如：數學、物理',
        'answer-label': '答案：'
    }
};

function applyLocale(lang) {
    const dict = LOCALES[lang] || LOCALES['en'];
    Object.keys(dict).forEach(key => {
        const el = getElement(key);
        if (el) {
            if (key === 'step2-p') return;
            el.textContent = dict[key];
        }
    });
    const crumbs = ['crumb-lang','crumb-form','crumb-topic','crumb-quiz','crumb-feedback'];
    crumbs.forEach(id => {
        const el = getElement(id);
        if (!el) return;
        const mapKey = id;
        if (dict[mapKey]) el.textContent = dict[mapKey];
    });
    const step1p = document.querySelector('#step-1 p'); if (step1p && dict['step1-p']) step1p.textContent = dict['step1-p'];
    const step2p = document.querySelector('#step-2 p'); if (step2p && dict['step2-p']) step2p.innerHTML = dict['step2-p'].replace('{form}', `<span id="display-form" class="font-bold text-indigo-600">${studentForm || ''}</span>`);
    const subj = getElement('subject-input'); if (subj && dict['subject-placeholder']) subj.placeholder = dict['subject-placeholder'];
    const step1Next = getElement('btn-next'); if (step1Next && dict['btn-next']) step1Next.textContent = dict['btn-next'];
    const step1Back = getElement('btn-back-lang'); if (step1Back && dict['btn-back']) step1Back.textContent = dict['btn-back'];
    const step2Btns = document.querySelectorAll('#step-2 button'); if (step2Btns && step2Btns.length >= 2) { if (dict['btn-back']) step2Btns[0].textContent = dict['btn-back']; if (dict['btn-generate']) step2Btns[1].textContent = dict['btn-generate']; }
    const backStep2 = getElement('btn-back-step2'); if (backStep2 && dict['btn-back']) backStep2.textContent = dict['btn-back'];
    const backQuiz = getElement('btn-back-quiz'); if (backQuiz && dict['btn-back']) backQuiz.textContent = dict['btn-back'];
    const submitBtn = getElement('submit-quiz-btn'); if (submitBtn && dict['submit-quiz-btn']) submitBtn.textContent = dict['submit-quiz-btn'];
    const startBtn = getElement('start-new-btn'); if (startBtn && dict['start-new-btn']) startBtn.textContent = dict['start-new-btn'];
    const backToTopic = getElement('back-to-topic-btn'); if (backToTopic && dict['back-to-topic-btn']) backToTopic.textContent = dict['back-to-topic-btn'];
    const restoreText = getElement('restore-banner-text'); if (restoreText && dict['restore-banner-text']) restoreText.textContent = dict['restore-banner-text'];
    const contBtn = getElement('btn-continue-restore'); if (contBtn && dict['btn-continue-restore']) contBtn.textContent = dict['btn-continue-restore'];
    const discBtn = getElement('btn-discard-restore'); if (discBtn && dict['btn-discard-restore']) discBtn.textContent = dict['btn-discard-restore'];
    const loadingText = getElement('loading-text'); if (loadingText && dict['loading-text']) loadingText.textContent = dict['loading-text'];
    const quizLabel = getElement('quiz-label'); if (quizLabel && dict['quiz-label']) quizLabel.textContent = dict['quiz-label'];
    const resultsTitle = getElement('results-title'); if (resultsTitle && dict['results-title']) resultsTitle.textContent = dict['results-title'];
    const scoreTitle = getElement('score-title'); if (scoreTitle && dict['score-title']) scoreTitle.textContent = dict['score-title'];
    const evalTitle = getElement('eval-title'); if (evalTitle && dict['eval-title']) evalTitle.textContent = dict['eval-title'];
    const reviewTitle = getElement('review-title'); if (reviewTitle && dict['review-title']) reviewTitle.textContent = dict['review-title'];
}
