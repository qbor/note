// ==========================================
// 1. 核心云端配置区域
// ==========================================
const SUPABASE_URL = 'https://fcfnxmptiffipykvemuj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5YdNr0DOSwAGpGKhvz0V_Q_6X_G8Qc7';

// 如果你希望邮箱确认后跳转到你的 GitHub 网站，请在这里填写完整地址。
// 注意：该 URL 必须在 Supabase 项目 Auth 重定向 URL 中允许。
// 推荐使用当前页面地址，避免写死到错误的 GitHub Pages 路径。
const EMAIL_CONFIRM_REDIRECT = window.location.protocol.startsWith('http')
    ? window.location.origin + window.location.pathname.replace(/index\.html$/, '')
    : '';

const mySupabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let notes = [];
let activeNoteId = null;
let currentUser = null;

// ==========================================
// 2. DOM 节点获取区域
// ==========================================
const notesList = document.getElementById('notes-list');
const noteTitle = document.getElementById('note-title');
const noteContent = document.getElementById('note-content');
const newNoteBtn = document.getElementById('new-note-btn');
const saveStatus = document.getElementById('save-status');
const authBtn = document.getElementById('auth-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');
const userEmailSpan = document.getElementById('user-email');
const deleteNoteBtn = document.getElementById('delete-note-btn');
const generateTitleBtn = document.getElementById('generate-title-btn');
const titleConfirmModal = document.getElementById('title-confirm-modal');
const generatedTitleInput = document.getElementById('generated-title-input');
const confirmTitleBtn = document.getElementById('confirm-title-btn');
const cancelTitleBtn = document.getElementById('cancel-title-btn');

const closeModalBtn = document.getElementById('close-modal');

const authModal = document.getElementById('auth-modal');
const emailInput = document.getElementById('auth-input-email');
const passwordInput = document.getElementById('auth-input-password');
const redirectOptionContainer = document.getElementById('redirect-option-container');
const redirectCheckbox = document.getElementById('auth-redirect-checkbox');
const modalTitle = document.getElementById('modal-title');
const authError = document.getElementById('auth-error');
const loginModeBtn = document.getElementById('login-mode-btn');
const registerModeBtn = document.getElementById('register-mode-btn');
const submitAuthBtn = document.getElementById('submit-auth');

let authMode = 'login';

// ==========================================
// 3. 系统初始化与事件绑定
// ==========================================
async function init() {
    // 初始化完成，开始绑定事件（调试日志已移除）
    function safeAdd(el, evt, handler) {
        if (el && typeof el.addEventListener === 'function') {
            el.addEventListener(evt, handler);
        } else {
            console.warn(`缺少 DOM 元素或无法绑定事件：${evt}`);
        }
    }

    if (!mySupabase) {
        console.warn('Supabase 客户端不可用，禁用所有需要网络的交互。');
        safeAdd(authBtn, 'click', () => { alert('Supabase 未初始化，无法进行登录。'); });
        safeAdd(newNoteBtn, 'click', () => { alert('未登录或 Supabase 未初始化，无法新建笔记。'); });
        return;
    }

    mySupabase.auth.onAuthStateChange((event, session) => {
        handleUserStatus(session?.user || null);
    });

    safeAdd(authBtn, 'click', async () => {
        if (currentUser) {
            await mySupabase.auth.signOut();
            window.location.reload();
        } else {
            showAuthModal('login');
        }
    });

    safeAdd(deleteAccountBtn, 'click', handleDeleteAccount);
    safeAdd(closeModalBtn, 'click', hideAuthModal);
    safeAdd(loginModeBtn, 'click', () => setAuthMode('login'));
    safeAdd(registerModeBtn, 'click', () => setAuthMode('register'));
    safeAdd(submitAuthBtn, 'click', handleSubmitAuth);

    if (authModal) {
        authModal.addEventListener('click', (event) => { if (event.target === authModal) hideAuthModal(); });
        authModal.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSubmitAuth(); } });
    } else {
        console.warn('未找到 authModal，无法监听模态框事件');
    }

    safeAdd(deleteNoteBtn, 'click', deleteCurrentNote);
    safeAdd(generateTitleBtn, 'click', generateTitleFromContent);
    safeAdd(confirmTitleBtn, 'click', confirmGeneratedTitle);
    safeAdd(cancelTitleBtn, 'click', () => hideTitleConfirmModal());
    
    safeAdd(newNoteBtn, 'click', createNewNote);
    if (noteTitle) noteTitle.addEventListener('input', () => { saveStatus.innerText = '修改中...'; updateCurrentNote(); });
    if (noteContent) noteContent.addEventListener('input', () => { saveStatus.innerText = '修改中...'; updateCurrentNote(); });

    const initialUser = await getCurrentUser();
    handleUserStatus(initialUser);
}

function setAuthMode(mode) {
    authMode = mode;
    const isLogin = mode === 'login';
    if (modalTitle) modalTitle.innerText = isLogin ? '账户登录' : '创建账号';
    if (submitAuthBtn) submitAuthBtn.innerText = isLogin ? '登录' : '注册';
    if (loginModeBtn) {
        loginModeBtn.classList.toggle('btn-primary', isLogin);
        loginModeBtn.classList.toggle('btn-secondary', !isLogin);
    }
    if (registerModeBtn) {
        registerModeBtn.classList.toggle('btn-primary', !isLogin);
        registerModeBtn.classList.toggle('btn-secondary', isLogin);
    }
    if (redirectOptionContainer) redirectOptionContainer.style.display = isLogin ? 'none' : 'block';
    clearAuthError();
}

function showAuthModal(mode = 'login') {
    setAuthMode(mode);
    if (authModal) authModal.classList.remove('hidden');
    clearAuthInputs();
    clearAuthError();
    if (emailInput && typeof emailInput.focus === 'function') emailInput.focus();
}

function hideAuthModal() {
    if (authModal) authModal.classList.add('hidden');
    clearAuthInputs();
    clearAuthError();
}

function clearAuthInputs() {
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
}

function clearAuthError() {
    if (authError) authError.innerText = '';
}

function showAuthError(message) {
    if (authError) authError.innerText = message;
    if (saveStatus) saveStatus.innerText = authMode === 'login' ? '登录失败' : '注册失败';
}

function setAuthButtonsEnabled(enabled) {
    if (submitAuthBtn) submitAuthBtn.disabled = !enabled;
    if (loginModeBtn) loginModeBtn.disabled = !enabled;
    if (registerModeBtn) registerModeBtn.disabled = !enabled;
}

// ==========================================
// 4. 用户与权限状态统一控制
// ==========================================
function handleUserStatus(user) {
    if (currentUser?.id === user?.id && currentUser !== null) return;
    
    currentUser = user;
    if (user) {
        const realEmail = user.email || (user.user_metadata && user.user_metadata.email) || "已登录用户";
        userEmailSpan.innerText = realEmail;
        authBtn.innerText = '退出登录';
        deleteAccountBtn.classList.remove('hidden');
        newNoteBtn.disabled = false;
        fetchNotesFromCloud();
    } else {
        userEmailSpan.innerText = '';
        authBtn.innerText = '登录 / 注册';
        deleteAccountBtn.classList.add('hidden');
        newNoteBtn.disabled = true;
        noteTitle.disabled = true;
        noteContent.disabled = true;
        deleteNoteBtn.disabled = true;
        notes = [];
        activeNoteId = null;
        renderNotesList();
        saveStatus.innerText = '未登录';
    }
}

async function getCurrentUser() {
    const { data, error } = await mySupabase.auth.getUser();
    if (error) return null;
    return data?.user ?? null;
}

function getAccessToken() {
    return localStorage.getItem('sb_real_token') || localStorage.getItem('sb-access-token');
}

async function handleDeleteAccount() {
    if (!currentUser) return;
    if (!confirm('确定要注销当前账户吗？此操作不可撤销，所有笔记和账户信息将永久删除。')) return;

    deleteAccountBtn.disabled = true;
    authBtn.disabled = true;
    saveStatus.innerText = '正在注销账户...';

    const token = getAccessToken();
    if (!token) {
        alert('未检测到有效登录凭证，请先重新登录后再试。');
        await mySupabase.auth.signOut();
        deleteAccountBtn.disabled = false;
        authBtn.disabled = false;
        saveStatus.innerText = '注销失败';
        return;
    }

    const { data: userData, error: userError } = await mySupabase.auth.getUser();
    if (userError || !userData) {
        alert('当前登录凭证已失效，请重新登录后再尝试注销账户。');
        await mySupabase.auth.signOut();
        deleteAccountBtn.disabled = false;
        authBtn.disabled = false;
        saveStatus.innerText = '注销失败';
        return;
    }

    try {
        const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            method: 'DELETE',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const errorMessage = errorData?.msg || errorData?.error || response.statusText || '账户注销失败';
            alert(`注销失败：${errorMessage}`);
            saveStatus.innerText = '注销失败';
            deleteAccountBtn.disabled = false;
            authBtn.disabled = false;
            return;
        }

        await mySupabase.auth.signOut();
        saveStatus.innerText = '账户已注销';
        window.location.reload();
    } catch (e) {
        alert('注销账户时发生错误，请稍后重试。');
        saveStatus.innerText = '注销失败';
        deleteAccountBtn.disabled = false;
        authBtn.disabled = false;
    }
}

function getEmailRedirectUrl() {
    if (!redirectCheckbox.checked) {
        return null;
    }
    if (EMAIL_CONFIRM_REDIRECT) {
        return EMAIL_CONFIRM_REDIRECT;
    }
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        return window.location.origin;
    }
    return null;
}

// ==========================================
// 5. 注册与登录
// ==========================================
async function handleRegister() {
    if (!emailInput.value || !passwordInput.value) {
        return showAuthError('请输入完整的邮箱和密码');
    }

    saveStatus.innerText = '正在提交注册...';
    setAuthButtonsEnabled(false);

    const redirectUrl = getEmailRedirectUrl();
    const signUpParams = {
        email: emailInput.value,
        password: passwordInput.value
    };
    if (redirectUrl) {
        signUpParams.options = { emailRedirectTo: redirectUrl };
    }

    const { data, error } = await mySupabase.auth.signUp(signUpParams);
    if (error) {
        const errorMsg = error.message || error.msg || error.error_description || JSON.stringify(error);
        showAuthError('注册失败：' + errorMsg);
        return setAuthButtonsEnabled(true);
    }

    const emailConfirmed = data?.user?.email_confirmed_at || data?.user?.confirmed_at;
    if (!emailConfirmed) {
        saveStatus.innerText = '已发送验证邮件，请前往邮箱完成认证';
        authError.innerText = '注册成功，请打开邮箱点击确认链接后再登录。';
        hideAuthModal();
        setAuthButtonsEnabled(true);
        return;
    }

    saveStatus.innerText = '注册成功，正在自动登录...';
    const { error: loginError } = await mySupabase.auth.signInWithPassword({ email: emailInput.value, password: passwordInput.value });
    if (loginError) {
        const errorMsg = loginError.message || loginError.msg || loginError.error_description || JSON.stringify(loginError);
        showAuthError('注册成功，但自动登录失败：' + errorMsg);
        setAuthButtonsEnabled(true);
        return;
    }

    const user = await getCurrentUser();
    handleUserStatus(user);
    hideAuthModal();
    setAuthButtonsEnabled(true);
}

async function handleLogin() {
    if (!emailInput.value || !passwordInput.value) {
        return showAuthError('请输入邮箱和密码');
    }

    saveStatus.innerText = '正在验证登录...';
    setAuthButtonsEnabled(false);

    const { error } = await mySupabase.auth.signInWithPassword({ email: emailInput.value, password: passwordInput.value });
    if (error) {
        const errorMsg = error.message || error.msg || error.error_description || JSON.stringify(error);
        showAuthError('登录失败：' + errorMsg);
        setAuthButtonsEnabled(true);
        return;
    }

    const user = await getCurrentUser();
    if (user) {
        handleUserStatus(user);
        hideAuthModal();
    } else {
        showAuthError('登录成功，但未获取用户信息，请刷新页面重试。');
    }
    setAuthButtonsEnabled(true);
}

async function handleSubmitAuth() {
    clearAuthError();
    if (authMode === 'login') {
        await handleLogin();
    } else {
        await handleRegister();
    }
}

// ==========================================
// 6. 云端拉取、渲染、加载笔记
// ==========================================
async function fetchNotesFromCloud() {
    saveStatus.innerText = '正在同步云端...';
    const { data, error } = await mySupabase.from('notes').select('*').eq('user_id', currentUser.id).order('id', { ascending: false });
    if (!error && data) {
        notes = data;
        const activeNote = notes.find(n => n.id === activeNoteId);
        if (notes.length > 0 && !activeNote) activeNoteId = notes[0].id;
        renderNotesList();
        loadActiveNote();
        saveStatus.innerText = '云端同步完成';
        return;
    }
    saveStatus.innerText = '同步云端失败';
    notes = [];
    activeNoteId = null;
    renderNotesList();
    loadActiveNote();
}

function renderNotesList() {
    notesList.innerHTML = '';
    if (notes.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.classList.add('placeholder-text');
        placeholder.textContent = '暂无云端笔记，点击新建';
        notesList.appendChild(placeholder);
        return;
    }

    notes.forEach(note => {
        const div = document.createElement('div');
        div.classList.add('note-item');
        if (note.id === activeNoteId) div.classList.add('active');

        const titleDiv = document.createElement('div');
        titleDiv.classList.add('note-item-title');
        titleDiv.textContent = note.title || '无标题笔记';

        div.appendChild(titleDiv);
        div.addEventListener('click', () => { activeNoteId = note.id; renderNotesList(); loadActiveNote(); });
        notesList.appendChild(div);
    });
}

function loadActiveNote() {
    const currentNote = notes.find(n => n.id === activeNoteId);
    if (currentNote) {
        saveStatus.innerText = '已加载云端内容';
        noteTitle.value = currentNote.title || '';
        noteContent.value = currentNote.content || '';
        noteTitle.disabled = false;
        noteContent.disabled = false;
        deleteNoteBtn.disabled = false;
    } else {
        noteTitle.value = ''; noteContent.value = '';
        noteTitle.disabled = true; noteContent.disabled = true;
        deleteNoteBtn.disabled = true;
    }
}

// ==========================================
// 7. 云端新建、更新、删除逻辑
// ==========================================
async function createNewNote() {
    // 💡 解决连击隐患：点击瞬间立刻禁用按钮，并显示 loading 状态文案
    newNoteBtn.disabled = true;
    saveStatus.innerText = '正在创建新笔记...';

    const newNoteData = { user_id: currentUser.id, title: '新笔记', content: '' };
    const { data, error } = await mySupabase.from('notes').insert([newNoteData]).select();
    const createdNote = Array.isArray(data) ? data[0] : data;
    
    if (!error && createdNote) {
        notes.unshift(createdNote);
        activeNoteId = createdNote.id;
        renderNotesList();
        loadActiveNote();
    } else {
        alert('新建笔记失败，请确认您的 Supabase 后台 notes 表配置正确，并且您已登录。');
    }
    if (createdNote) {
        noteTitle.focus();
    }
    
    // 💡 异步请求结束后，重新恢复新建按钮的可用状态
    newNoteBtn.disabled = false;
}

function getCurrentNote() {
    return notes.find(n => n.id === activeNoteId) || null;
}

async function generateTitleFromContent() {
    const currentNote = getCurrentNote();
    if (!currentNote) return alert('请先选择或新建一篇笔记');
    if (!noteContent.value || noteContent.value.trim().length === 0) return alert('笔记内容为空，无法生成标题');

    generateTitleBtn.disabled = true;
    saveStatus.innerText = '正在生成标题...';

    // 取内容第一段或首行作为候选标题，限制长度
    const lines = noteContent.value.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let candidate = lines.length > 0 ? lines[0] : noteContent.value.trim();
    if (candidate.length > 60) candidate = candidate.slice(0, 57) + '...';

    // 在弹窗中显示并允许编辑确认
    generatedTitleInput.value = candidate;
    showTitleConfirmModal();
    generateTitleBtn.disabled = false;
}

function showTitleConfirmModal() {
    titleConfirmModal.classList.remove('hidden');
    generatedTitleInput.focus();
}

function hideTitleConfirmModal() {
    titleConfirmModal.classList.add('hidden');
    generatedTitleInput.value = '';
}

async function confirmGeneratedTitle() {
    const newTitle = generatedTitleInput.value.trim();
    if (!newTitle) return alert('标题不能为空');
    saveStatus.innerText = '正在保存标题...';
    confirmTitleBtn.disabled = true;
    try {
        const { error } = await mySupabase.from('notes').update({ title: newTitle }).eq('id', activeNoteId).eq('user_id', currentUser?.id);
        if (error) {
            alert('保存标题失败');
            saveStatus.innerText = '保存失败';
        } else {
            const currentNote = getCurrentNote();
            if (currentNote) currentNote.title = newTitle;
            noteTitle.value = newTitle;
            const activeItem = document.querySelector('.note-item.active .note-item-title');
            if (activeItem) activeItem.innerText = newTitle;
            saveStatus.innerText = '标题已保存';
            hideTitleConfirmModal();
        }
    } catch (e) {
        alert('保存标题出错');
        saveStatus.innerText = '保存出错';
    }
    confirmTitleBtn.disabled = false;
}

let saveTimeout;
function updateCurrentNote() {
    const currentNote = notes.find(n => n.id === activeNoteId);
    if (!currentNote) return;
    
    const targetSaveId = activeNoteId;
    const targetTitle = noteTitle.value;
    const targetContent = noteContent.value;

    currentNote.title = targetTitle;
    currentNote.content = targetContent;

    const activeItem = document.querySelector('.note-item.active .note-item-title');
    if (activeItem) activeItem.innerText = targetTitle || '无标题笔记';

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        await mySupabase.from('notes').update({ title: targetTitle, content: targetContent }).eq('id', targetSaveId).eq('user_id', currentUser?.id);
        if (activeNoteId === targetSaveId) {
            saveStatus.innerText = '所有更改已实时保存至云端';
        }
    }, 800);
}

async function deleteCurrentNote() {
    if (!activeNoteId || !confirm('确定要删除这篇笔记吗？此操作不可撤销。')) return;
    
    // 💡 同样在删除期间禁用按钮防御连击
    deleteNoteBtn.disabled = true;
    saveStatus.innerText = '正在从云端删除...';
    
    const { error } = await mySupabase.from('notes').delete().eq('id', activeNoteId).eq('user_id', currentUser?.id);
    if (!error) {
        notes = notes.filter(n => n.id !== activeNoteId);
        activeNoteId = notes.length > 0 ? notes[0].id : null;
        renderNotesList();
        loadActiveNote();
        saveStatus.innerText = '删除成功';
    } else {
        saveStatus.innerText = '删除失败，请检查网络权限';
    }
    deleteNoteBtn.disabled = false;
}

// 启动发令枪
init();
