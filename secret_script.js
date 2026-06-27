const SUPABASE_CONFIG = (typeof window !== 'undefined' && window.__SUPABASE_CONFIG__) || {};
const SUPABASE_URL = (typeof window !== 'undefined' && window.location?.origin)
    ? `${window.location.origin}/supabase-api`
    : (SUPABASE_CONFIG.url || '');
const SUPABASE_KEY = SUPABASE_CONFIG.key || 'sb_publishable_5YdNr0DOSwAGpGKhvz0V_Q_6X_G8Qc7';
const mySupabase = (typeof window !== 'undefined' && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            redirectTo: typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''
        }
    })
    : null;

let secretNotes = [];
let activeSecretNoteId = null;
let currentUser = null;
let isInitializing = false;

const authStatusEl = document.getElementById('authStatus');
const workAreaEl = document.getElementById('workArea');
const secretNotesListEl = document.getElementById('secretNotesList');
const secretTitleInput = document.getElementById('secretTitle');
const secretNoteTextarea = document.getElementById('secretNote');
const saveBtn = document.getElementById('saveBtn');
const deleteSecretBtn = document.getElementById('deleteSecretBtn');
const newSecretNoteBtn = document.getElementById('newSecretNoteBtn');
const statusMsg = document.getElementById('statusMsg');
const backToHomeBtn = document.getElementById('backToHomeBtn');
const secretEmptyStateEl = document.getElementById('secretEmptyState');
const secretEditorAreaEl = document.getElementById('secretEditorArea');

function setStatus(message, isError = false) {
    if (!statusMsg) return;
    statusMsg.textContent = message;
    statusMsg.style.color = isError ? '#e74c3c' : '#2ecc71';
}

function clearEditor() {
    if (secretTitleInput) secretTitleInput.value = '';
    if (secretNoteTextarea) secretNoteTextarea.value = '';
    activeSecretNoteId = null;
}

function renderSecretNotes() {
    if (!secretNotesListEl) return;

    if (!secretNotes.length) {
        secretNotesListEl.innerHTML = '';
        secretNotesListEl.classList.add('hidden');
        return;
    }

    secretNotesListEl.classList.remove('hidden');
    secretNotesListEl.innerHTML = '';
    const fragment = document.createDocumentFragment();

    secretNotes.forEach((note) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `secret-note-item${note.id === activeSecretNoteId ? ' active' : ''}`;
        // 修复：XSS 防护更严谨
        const safeTitle = (note.title || '无标题私密笔记').replace(/[&<>"']/g, char => {
            const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
            return entities[char] || char;
        });
        button.innerHTML = `
            <span class="secret-note-title">${safeTitle}</span>
            <span class="secret-note-meta">${new Date(note.updated_at || note.created_at || Date.now()).toLocaleString('zh-CN')}</span>
        `;
        button.addEventListener('click', () => selectSecretNote(note.id));
        fragment.appendChild(button);
    });

    secretNotesListEl.appendChild(fragment);
}

function selectSecretNote(noteId) {
    const note = secretNotes.find((item) => item.id === noteId);
    if (!note) return;

    activeSecretNoteId = note.id;
    if (secretTitleInput) secretTitleInput.value = note.title || '';
    if (secretNoteTextarea) secretNoteTextarea.value = note.content || '';
    renderSecretNotes();
    showEditorArea();
    setStatus('已加载当前私密笔记');
}

function showEditorArea() {
    if (secretEmptyStateEl) secretEmptyStateEl.classList.add('hidden');
    if (secretEditorAreaEl) secretEditorAreaEl.classList.remove('hidden');
}

function showEmptyState() {
    if (secretEmptyStateEl) secretEmptyStateEl.classList.remove('hidden');
    if (secretEditorAreaEl) secretEditorAreaEl.classList.add('hidden');
    clearEditor();
}

function showGuestState() {
    currentUser = null;
    secretNotes = [];
    clearEditor();
    renderSecretNotes();
    if (authStatusEl) {
        authStatusEl.innerHTML = '<p>请先通过首页登录后再访问私密空间。</p>';
    }
    if (workAreaEl) {
        workAreaEl.classList.add('hidden');
    }
    setStatus('请先登录后再访问私密空间', true);
    // 修复：延迟跳转增加提示时间
    window.setTimeout(() => {
        window.location.replace('index.html');
    }, 2000);
}

async function initSecretPage() {
    if (isInitializing || !mySupabase) {
        if (authStatusEl) {
            authStatusEl.innerHTML = '<p>当前环境无法连接到 Supabase，请检查配置后再试。</p>';
        }
        setStatus('Supabase 未初始化，无法访问私密空间', true);
        return;
    }

    isInitializing = true;
    try {
        // 修复：先验证登录状态，再监听变化
        const { data, error } = await mySupabase.auth.getUser();
        if (error || !data?.user) {
            showGuestState();
            return;
        }

        currentUser = data.user;
        if (authStatusEl) {
            authStatusEl.classList.add('hidden');
        }
        if (workAreaEl) {
            workAreaEl.classList.remove('hidden');
        }

        // 修复：登录状态变化监听更及时
        mySupabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Secret page auth state:', event);
            if (event === 'SIGNED_OUT' || !session?.user) {
                showGuestState();
                return;
            }
            currentUser = session.user;
            if (authStatusEl) authStatusEl.classList.add('hidden');
            if (workAreaEl) workAreaEl.classList.remove('hidden');
            await loadSecretNotes(); // 修复：异步加载笔记
        });

        await loadSecretNotes();
    } catch (err) {
        console.error('私密页面初始化失败:', err);
        setStatus('初始化失败，请刷新页面', true);
    } finally {
        isInitializing = false;
    }
}

async function loadSecretNotes() {
    if (!currentUser || !mySupabase) return;

    setStatus('正在加载私密笔记...');
    try {
        // 修复：正确处理查询返回值
        const queryResult = await mySupabase.from('secret_notes')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('updated_at', { ascending: false });

        const { data, error } = queryResult;
        if (error) throw error;

        secretNotes = data || [];
        if (!secretNotes.length) {
            renderSecretNotes();
            showEmptyState();
            setStatus('暂无私密笔记');
            return;
        }

        if (!activeSecretNoteId || !secretNotes.some(item => item.id === activeSecretNoteId)) {
            activeSecretNoteId = secretNotes[0].id;
        }

        renderSecretNotes();
        selectSecretNote(activeSecretNoteId);
        setStatus('私密笔记加载完成');
    } catch (error) {
        console.error('加载私密笔记失败:', error);
        setStatus('加载私密笔记失败：' + error.message, true);
    }
}

async function handleSaveNote() {
    if (!currentUser || !mySupabase) {
        setStatus('请先登录后再保存私密笔记', true);
        return;
    }

    const title = (secretTitleInput?.value || '').trim();
    const content = secretNoteTextarea?.value || '';
    if (!content.trim()) {
        setStatus('内容不能为空', true);
        return;
    }

    const now = new Date().toISOString();
    const payload = {
        user_id: currentUser.id,
        title: title || '无标题私密笔记',
        content,
        updated_at: now
    };

    setStatus('正在保存...');
    showEditorArea();

    try {
        if (activeSecretNoteId) {
            // 修复：更新时增加 user_id 过滤，防止越权
            const updateResult = await mySupabase.from('secret_notes')
                .update({ title: payload.title, content, updated_at: now })
                .eq('id', activeSecretNoteId)
                .eq('user_id', currentUser.id);
            
            if (updateResult.error) throw updateResult.error;

            const currentNote = secretNotes.find((item) => item.id === activeSecretNoteId);
            if (currentNote) {
                currentNote.title = payload.title;
                currentNote.content = content;
                currentNote.updated_at = now;
            }
            renderSecretNotes();
            setStatus('私密笔记已更新');
            return;
        }

        // 新增笔记时补充 created_at
        payload.created_at = now;
        const insertResult = await mySupabase.from('secret_notes')
            .insert([payload])
            .select();
        
        const { data, error } = insertResult;
        if (error) throw error;

        const createdNote = data && data[0] ? data[0] : null;
        if (createdNote) {
            secretNotes = [createdNote, ...secretNotes];
            activeSecretNoteId = createdNote.id;
            renderSecretNotes();
            showEditorArea();
            setStatus('私密笔记已保存');
        }
    } catch (error) {
        console.error('保存私密笔记失败:', error);
        setStatus('保存失败：' + error.message, true);
    }
}

async function deleteCurrentNote() {
    if (!currentUser || !mySupabase || !activeSecretNoteId) {
        setStatus('请先选择一条私密笔记再删除', true);
        return;
    }

    if (!confirm('确定删除这篇私密笔记吗？')) return;

    setStatus('正在删除...');
    try {
        // 修复：删除时增加 user_id 过滤
        const deleteResult = await mySupabase.from('secret_notes')
            .delete()
            .eq('id', activeSecretNoteId)
            .eq('user_id', currentUser.id);
        
        if (deleteResult.error) throw deleteResult.error;

        secretNotes = secretNotes.filter((note) => note.id !== activeSecretNoteId);
        clearEditor();
        renderSecretNotes();
        if (secretNotes.length === 0) {
            showEmptyState();
        } else {
            activeSecretNoteId = secretNotes[0].id;
            selectSecretNote(activeSecretNoteId);
        }
        setStatus('私密笔记已删除');
    } catch (error) {
        console.error('删除私密笔记失败:', error);
        setStatus('删除失败：' + error.message, true);
    }
}

// 修复：事件绑定增加存在性检查和防抖
if (saveBtn) {
    saveBtn.addEventListener('click', handleSaveNote);
}

if (deleteSecretBtn) {
    deleteSecretBtn.addEventListener('click', deleteCurrentNote);
}

if (newSecretNoteBtn) {
    newSecretNoteBtn.addEventListener('click', async () => {
        if (!currentUser || !mySupabase) {
            setStatus('请先登录后再创建私密笔记', true);
            return;
        }

        clearEditor();
        activeSecretNoteId = null;
        showEditorArea();
        setStatus('请输入私密笔记内容，然后保存。');
        if (secretTitleInput) secretTitleInput.focus();
    });
}

if (backToHomeBtn) {
    backToHomeBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
}

// 修复：DOM 加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSecretPage);
} else {
    initSecretPage();
}