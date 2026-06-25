// ==========================================
// 1. 核心云端配置区域
// ==========================================
// ⚠️ 已经严格修改为你专属的项目 ID 网址，绝对不再使用官方首页地址！
const SUPABASE_URL = 'https://fcfnxmptiffipykvemuj.supabase.co';
// ⚠️ 填入你之前从 Supabase 复制的以 sb_publishable_ 开头的真实长密钥
const SUPABASE_KEY = 'sb_publishable_5YdNr0DOSwAGpGKhvz0V_Q_6X_G8Qc7';

// 初始化你之前手工全部替换好的 mySupabase 客户端变量
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
const userEmailSpan = document.getElementById('user-email');
const deleteNoteBtn = document.getElementById('delete-note-btn');

// 弹窗相关 DOM
const authModal = document.getElementById('auth-modal');
const emailInput = document.getElementById('auth-input-email');
const passwordInput = document.getElementById('auth-input-password');

// ==========================================
// 3. 核心初始化系统（发令枪）
// ==========================================
async function init() {
    // 自动检查当前登录态
    const { data: { user } } = await mySupabase.auth.getUser();
    handleUserStatus(user);

    // 监听全局登录状态改变
    mySupabase.auth.onAuthStateChange((event, session) => {
        handleUserStatus(session?.user || null);
    });

    // 绑定所有交互事件
    authBtn.addEventListener('click', handleAuthButtonClick);
    document.getElementById('close-modal').addEventListener('click', () => authModal.classList.add('hidden'));
    document.getElementById('submit-register').addEventListener('click', handleRegister);
    document.getElementById('submit-login').addEventListener('click', handleLogin);
    deleteNoteBtn.addEventListener('click', deleteCurrentNote);
    
    newNoteBtn.addEventListener('click', createNewNote);
    noteTitle.addEventListener('input', () => { saveStatus.innerText = '修改中...'; updateCurrentNote(); });
    noteContent.addEventListener('input', () => { saveStatus.innerText = '修改中...'; updateCurrentNote(); });
}

// ==========================================
// 4. 用户与权限状态统一控制（完美校准版）
// ==========================================
function handleUserStatus(user) {
    currentUser = user;
    if (user) {
        // 💡 核心修复：全兼容抓取真云端返回的邮箱地址
        const realEmail = user.email || (user.user_metadata && user.user_metadata.email) || "已登录用户";
        
        userEmailSpan.innerText = realEmail; // 刷新显示你的邮箱
        authBtn.innerText = '退出登录';      // 强制按钮文字变为退出登录
        newNoteBtn.disabled = false;         // 保持解禁新建按钮
        fetchNotesFromCloud();               // 自动拉取该用户的云端笔记
    } else {
        userEmailSpan.innerText = '';
        authBtn.innerText = '登录 / 注册';
        newNoteBtn.disabled = true;
        noteTitle.disabled = true;
        noteContent.disabled = true;
        deleteNoteBtn.disabled = true;
        notes = [];
        renderNotesList();
        saveStatus.innerText = '未登录';
    }
}


// ==========================================
// 5. 真实云端：注册与登录逻辑（铁面无私版）
// ==========================================
async function handleRegister() {
    if(!emailInput.value || !passwordInput.value) {
        return alert('请输入完整的邮箱和密码');
    }
    
    saveStatus.innerText = '正在提交注册...';
    
    const { data, error } = await mySupabase.auth.signUp({
        email: emailInput.value,
        password: passwordInput.value,
    });

    if (error) {
        // 💡 核心修复：真云端的报错可能叫 message、msg 或 error_description，这里做全兼容抓取
        const errorMsg = error.message || error.msg || error.error_description || JSON.stringify(error);
        alert('注册失败原因: ' + errorMsg);
        saveStatus.innerText = '注册遇到错误';
    } else {
        alert('注册申请已提交！一封激活邮件已发往您的真实邮箱，请点击邮件中的链接激活后再尝试登录。');
        authModal.classList.add('hidden');
        saveStatus.innerText = '等待邮箱激活';
    }
}

async function handleLogin() {
    if(!emailInput.value || !passwordInput.value) {
        return alert('请输入邮箱和密码');
    }
    
    saveStatus.innerText = '正在验证登录...';

    const { data, error } = await mySupabase.auth.signInWithPassword({
        email: emailInput.value,
        password: passwordInput.value,
    });

    if (error) {
        // 💡 同样兼容抓取登录错误
        const errorMsg = error.message || error.msg || error.error_description || JSON.stringify(error);
        alert('登录失败原因: ' + errorMsg);
        saveStatus.innerText = '登录失败';
    } else {
        authModal.classList.add('hidden');
    }
}


// ==========================================
// 6. 真实云端：增删改查数据库逻辑
// ==========================================
async function fetchNotesFromCloud() {
    saveStatus.innerText = '正在同步云端...';
    const { data, error } = await mySupabase
        .from('notes')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('id', { ascending: false });

    if (!error && data) {
        notes = data;
        if (notes.length > 0 && !activeNoteId) activeNoteId = notes[0].id;
        renderNotesList();
        loadActiveNote();
        saveStatus.innerText = '云端同步完成';
    }
}

function renderNotesList() {
    notesList.innerHTML = notes.length === 0 ? '<div class="placeholder-text">暂无云端笔记，点击新建</div>' : '';
    notes.forEach(note => {
        const div = document.createElement('div');
        div.classList.add('note-item');
        if (note.id === activeNoteId) div.classList.add('active');
        div.innerHTML = `<div class="note-item-title">${note.title || '无标题笔记'}</div>`;
        div.addEventListener('click', () => { 
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
        noteTitle.value = currentNote.title || '';
        noteContent.value = currentNote.content || '';
        noteTitle.disabled = false;
        noteContent.disabled = false;
        deleteNoteBtn.disabled = false;
    } else {
        noteTitle.value = ''; 
        noteContent.value = '';
        noteTitle.disabled = true; 
        noteContent.disabled = true;
        deleteNoteBtn.disabled = true;
    }
}

async function createNewNote() {
    const newNoteData = {
        user_id: currentUser.id,
        title: '新笔记',
        content: ''
    };
    
    const { data, error } = await mySupabase.from('notes').insert([newNoteData]).select();
    if (!error && data && data.length > 0) {
        notes.unshift(data[0]);
        activeNoteId = data[0].id;
        renderNotesList();
        loadActiveNote();
    }
}

let saveTimeout;
function updateCurrentNote() {
    const currentNote = notes.find(n => n.id === activeNoteId);
    if (!currentNote) return;

    currentNote.title = noteTitle.value;
    currentNote.content = noteContent.value;

    const activeItem = document.querySelector('.note-item.active .note-item-title');
    if (activeItem) activeItem.innerText = noteTitle.value || '无标题笔记';

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        const { error } = await mySupabase
            .from('notes')
            .update({ title: noteTitle.value, content: noteContent.value })
            .eq('id', activeNoteId);
        
        if (!error) saveStatus.innerText = '所有更改已实时保存至云端';
        else saveStatus.innerText = '保存失败，请检查网络';
    }, 800);
}

async function deleteCurrentNote() {
    if (!activeNoteId || !confirm('确定要删除这篇笔记吗？此操作不可撤销。')) return;
    
    saveStatus.innerText = '正在从云端删除...';
    const { error } = await mySupabase
        .from('notes')
        .delete()
        .eq('id', activeNoteId);

    if (!error) {
        notes = notes.filter(n => n.id !== activeNoteId);
        activeNoteId = notes.length > 0 ? notes[0].id : null;
        renderNotesList();
        loadActiveNote();
        saveStatus.innerText = '删除成功';
    } else {
        saveStatus.innerText = '删除失败，请检查网络权限';
    }
}

// 启动系统
init();
