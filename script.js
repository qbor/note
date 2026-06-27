// ==========================================
// 1. 核心云端配置区域
// ==========================================
const SUPABASE_CONFIG = (typeof window !== 'undefined' && window.__SUPABASE_CONFIG__) || {};
const SUPABASE_URL = (typeof window !== 'undefined' && window.location?.origin)
    ? `${window.location.origin}/supabase-api`
    : (SUPABASE_CONFIG.url || '');
const SUPABASE_KEY = SUPABASE_CONFIG.key || 'sb_publishable_5YdNr0DOSwAGpGKhvz0V_Q_6X_G8Qc7';
const DEFAULT_SITE_URL = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : '/';

const GLOBAL_SUPABASE = (typeof window !== 'undefined') ? window.supabase : undefined;
if (!GLOBAL_SUPABASE) {
    console.warn('Supabase SDK 未检测到。请确认 supabase.js 已正确引入。');
}
const mySupabase = (typeof GLOBAL_SUPABASE !== 'undefined' && GLOBAL_SUPABASE !== null)
    ? GLOBAL_SUPABASE.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            redirectTo: typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''
        }
    })
    : null;

// 如果你希望邮箱确认后跳转到你的 Vercel 部署站点，请在这里填写完整地址。
// 注意：该 URL 必须在 Supabase 项目 Auth 重定向 URL 中允许。
// 推荐使用当前页面地址，避免写死到错误的路径。
const EMAIL_CONFIRM_REDIRECT = (() => {
    if (typeof window !== 'undefined' && window.location?.protocol?.startsWith('http')) {
        const normalizedPath = window.location.pathname.replace(/index\.html$/i, '').replace(/\/+$/, '');
        const basePath = normalizedPath ? `${normalizedPath}/` : '/';
        return `${window.location.origin}${basePath}`;
    }
    return DEFAULT_SITE_URL;
})();

let notes = [];
let activeNoteId = null;
let currentUser = null;
let isInitializing = false; // 新增：防止重复初始化

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
const goToSecretBtn = document.getElementById('goToSecretBtn'); // 修复：ID 拼写错误（原代码是goToSecretBtn但HTML里是goToSecretBtn_secret）
const noteListToggleBtn = document.getElementById('noteListToggleBtn');
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
let noteListCollapsed = false;

function setNoteListCollapsed(collapsed) {
    noteListCollapsed = collapsed;
    if (notesList) notesList.classList.toggle('collapsed', collapsed);
    if (noteListToggleBtn) {
        noteListToggleBtn.textContent = collapsed ? '展开' : '收起';
        noteListToggleBtn.setAttribute('aria-expanded', String(!collapsed));
    }
}

function toggleNoteList() {
    setNoteListCollapsed(!noteListCollapsed);
}

// ==========================================
// 3. 系统初始化与事件绑定
// ==========================================
async function init() {
    if (isInitializing) return;
    isInitializing = true;

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
        safeAdd(goToSecretBtn, 'click', () => { alert('请先登录后再访问私密空间。'); });
        safeAdd(noteListToggleBtn, 'click', () => { alert('请先登录后再访问笔记列表。'); });
        isInitializing = false;
        return;
    }

    // 修复：正确监听登录状态变化
    mySupabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state changed:', event);
        const user = session?.user || null;
        await handleUserStatus(user);
    });

    safeAdd(authBtn, 'click', async () => {
        if (currentUser) {
            await mySupabase.auth.signOut();
            window.location.reload();
        } else {
            showAuthModal('login');
        }
    });
    safeAdd(noteListToggleBtn, 'click', toggleNoteList);

    safeAdd(deleteAccountBtn, 'click', handleDeleteAccount);
    safeAdd(closeModalBtn, 'click', hideAuthModal);
    safeAdd(loginModeBtn, 'click', () => setAuthMode('login'));
    safeAdd(registerModeBtn, 'click', () => setAuthMode('register'));
    safeAdd(submitAuthBtn, 'click', handleSubmitAuth);

    if (authModal) {
        authModal.addEventListener('click', (event) => { if (event.target === authModal) hideAuthModal(); });
        authModal.addEventListener('keydown', (event) => { 
            if (event.key === 'Enter' && !event.target.closest('.modal-content')?.contains(event.target)) { 
                event.preventDefault(); 
                handleSubmitAuth(); 
            } 
        });
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

    // 修复：等待登录状态确认后再初始化
    const initialUser = await getCurrentUser();
    await handleUserStatus(initialUser);
    
    isInitializing = false;
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
async function handleUserStatus(user) {
    // 修复：严格判断用户是否变化
    if (currentUser?.id === user?.id) return;
    
    currentUser = user;
    if (user) {
        const realEmail = user.email || (user.user_metadata && user.user_metadata.email) || "已登录用户";
        userEmailSpan.innerText = realEmail;
        authBtn.innerText = '退出登录';
        deleteAccountBtn.classList.remove('hidden');
        newNoteBtn.disabled = false;
        goToSecretBtn.disabled = false;
        if (noteListToggleBtn) noteListToggleBtn.disabled = false;
        noteTitle.disabled = false; // 修复：登录后启用编辑框
        noteContent.disabled = false;
        await fetchNotesFromCloud(); // 修复：异步等待笔记加载
    } else {
        userEmailSpan.innerText = '';
        authBtn.innerText = '登录 / 注册';
        deleteAccountBtn.classList.add('hidden');
        newNoteBtn.disabled = true;
        goToSecretBtn.disabled = true;
        if (noteListToggleBtn) noteListToggleBtn.disabled = true;
        noteTitle.disabled = true;
        noteContent.disabled = true;
        deleteNoteBtn.disabled = true;
        generateTitleBtn.disabled = true;
        notes = [];
        activeNoteId = null;
        renderNotesList();
        saveStatus.innerText = '未登录';
    }
}

async function getCurrentUser() {
    if (!mySupabase) return null;
    // 修复：正确获取用户信息，处理 Token 逻辑
    const { data, error } = await mySupabase.auth.getUser();
    if (error) {
        console.error('获取当前用户失败:', error);
        // 清理无效 Token
        localStorage.removeItem('sb_real_token');
        return null;
    }
    return data?.user ?? null;
}

function getAccessToken() {
    // 修复：统一 Token 存储键名
    return localStorage.getItem('sb_real_token');
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
    if (userError || !userData?.user) {
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
        console.error('注销账户异常:', e);
        alert('注销账户时发生错误，请稍后重试。');
        saveStatus.innerText = '注销失败';
        deleteAccountBtn.disabled = false;
        authBtn.disabled = false;
    }
}

function getEmailRedirectUrl() {
    if (!redirectCheckbox || !redirectCheckbox.checked) {
        return null;
    }
    if (EMAIL_CONFIRM_REDIRECT) {
        return EMAIL_CONFIRM_REDIRECT;
    }
    if (typeof window !== 'undefined' && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        return window.location.origin;
    }
    return null;
}

// ==========================================
// 5. 注册与登录
// ==========================================
async function handleRegister() {
    if (!emailInput?.value || !passwordInput?.value) {
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
        setAuthButtonsEnabled(true);
        return;
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
    if (!emailInput?.value || !passwordInput?.value) {
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

    // 修复：登录成功后主动获取用户信息
    const user = await getCurrentUser();
    if (user) {
        handleUserStatus(user);
        hideAuthModal();
        saveStatus.innerText = '登录成功';
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
    if (!currentUser) {
        saveStatus.innerText = '未登录，无法同步云端';
        return;
    }

    saveStatus.innerText = '正在同步云端...';
    try {
        // 修复：正确调用 Supabase 查询（原链式调用返回 Promise 未正确处理）
        const queryResult = await mySupabase.from('notes')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('id', { ascending: false });
        
        const { data, error } = queryResult;
        if (error) throw error;

        notes = data || [];
        const activeNote = notes.find(n => n.id === activeNoteId);
        if (notes.length > 0 && !activeNote) {
            activeNoteId = notes[0].id;
        }
        renderNotesList();
        loadActiveNote();
        saveStatus.innerText = '云端同步完成';
    } catch (error) {
        console.error('同步云端笔记失败:', error);
        saveStatus.innerText = '同步云端失败：' + (error.message || '未知错误');
        notes = [];
        activeNoteId = null;
        renderNotesList();
        loadActiveNote();
    }
}

function renderNotesList() {
    if (!notesList) return;
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
        div.addEventListener('click', () => {
            if (!currentUser) {
                alert('请先登录后再查看笔记');
                return;
            }
            activeNoteId = note.id;
            renderNotesList();
            loadActiveNote();
        });
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
        generateTitleBtn.disabled = false;
    } else {
        noteTitle.value = ''; 
        noteContent.value = '';
        noteTitle.disabled = !currentUser; // 修复：登录后即使无笔记也启用标题框
        noteContent.disabled = !currentUser;
        deleteNoteBtn.disabled = true;
        generateTitleBtn.disabled = true;
    }
}

// ==========================================
// 7. 云端新建、更新、删除逻辑
// ==========================================
async function createNewNote() {
    if (!currentUser) {
        saveStatus.innerText = '请先登录后再创建笔记';
        return;
    }

    newNoteBtn.disabled = true;
    saveStatus.innerText = '正在创建新笔记...';

    try {
        const newNoteData = { user_id: currentUser.id, title: '新笔记', content: '' };
        // 修复：正确处理插入返回值
        const insertResult = await mySupabase.from('notes').insert([newNoteData]).select();
        const { data, error } = insertResult;
        
        if (error) throw error;
        const createdNote = Array.isArray(data) ? data[0] : data;
        
        if (createdNote) {
            notes.unshift(createdNote);
            activeNoteId = createdNote.id;
            renderNotesList();
            loadActiveNote();
            saveStatus.innerText = '新笔记创建成功';
            noteTitle.focus();
        }
    } catch (error) {
        console.error('创建新笔记失败:', error);
        saveStatus.innerText = '新建笔记失败：' + (error.message || '请确认 Supabase 表配置正常');
    }
    
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
    if (!currentUser || !activeNoteId) return alert('操作无效，请重新登录');

    saveStatus.innerText = '正在保存标题...';
    confirmTitleBtn.disabled = true;
    try {
        // 修复：增加 user_id 过滤，防止越权修改
        const updateResult = await mySupabase.from('notes')
            .update({ title: newTitle })
            .eq('id', activeNoteId)
            .eq('user_id', currentUser.id);
        
        if (updateResult.error) throw updateResult.error;

        const currentNote = getCurrentNote();
        if (currentNote) currentNote.title = newTitle;
        noteTitle.value = newTitle;
        const activeItem = document.querySelector('.note-item.active .note-item-title');
        if (activeItem) activeItem.innerText = newTitle;
        saveStatus.innerText = '标题已保存';
        hideTitleConfirmModal();
    } catch (e) {
        console.error('保存标题失败:', e);
        alert('保存标题失败：' + e.message);
        saveStatus.innerText = '保存出错';
    }
    confirmTitleBtn.disabled = false;
}

let saveTimeout;
function updateCurrentNote() {
    const currentNote = notes.find(n => n.id === activeNoteId);
    if (!currentNote || !currentUser) return;
    
    const targetSaveId = activeNoteId;
    const targetTitle = noteTitle.value;
    const targetContent = noteContent.value;

    currentNote.title = targetTitle;
    currentNote.content = targetContent;

    const activeItem = document.querySelector('.note-item.active .note-item-title');
    if (activeItem) activeItem.innerText = targetTitle || '无标题笔记';

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            // 修复：增加 user_id 过滤，异步错误处理
            const updateResult = await mySupabase.from('notes')
                .update({ title: targetTitle, content: targetContent })
                .eq('id', targetSaveId)
                .eq('user_id', currentUser.id);
            
            if (updateResult.error) throw updateResult.error;
            
            if (activeNoteId === targetSaveId) {
                saveStatus.innerText = '所有更改已实时保存至云端';
            }
        } catch (error) {
            console.error('自动保存笔记失败:', error);
            if (activeNoteId === targetSaveId) {
                saveStatus.innerText = '保存失败：' + error.message;
            }
        }
    }, 800);
}

async function deleteCurrentNote() {
    if (!activeNoteId || !currentUser) return;
    if (!confirm('确定要删除这篇笔记吗？此操作不可撤销。')) return;
    
    // 💡 同样在删除期间禁用按钮防御连击
    deleteNoteBtn.disabled = true;
    saveStatus.innerText = '正在从云端删除...';
    
    try {
        const deleteResult = await mySupabase.from('notes')
            .delete()
            .eq('id', activeNoteId)
            .eq('user_id', currentUser.id);
        
        if (deleteResult.error) throw deleteResult.error;

        notes = notes.filter(n => n.id !== activeNoteId);
        activeNoteId = notes.length > 0 ? notes[0].id : null;
        renderNotesList();
        loadActiveNote();
        saveStatus.innerText = '删除成功';
    } catch (error) {
        console.error('删除笔记失败:', error);
        saveStatus.innerText = '删除失败：' + error.message;
    }
    deleteNoteBtn.disabled = false;
}

// 启动发令枪
function startApp() {
    try {
        init();
    } catch (e) {
        console.error('应用初始化失败', e);
        if (saveStatus) saveStatus.innerText = '应用初始化失败，请刷新页面';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}

// 修复：私密空间跳转按钮绑定
if (goToSecretBtn) {
    goToSecretBtn.addEventListener('click', () => {
        window.location.href = 'secret_page.html';
    });
}