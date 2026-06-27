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
        button.innerHTML = `
            <span class="secret-note-title">${(note.title || '无标题私密笔记').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
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
    window.setTimeout(() => {
        window.location.replace('index.html');
    }, 1200);
}

async function initSecretPage() {
    if (!mySupabase) {
        if (authStatusEl) {
            authStatusEl.innerHTML = '<p>当前环境无法连接到 Supabase，请检查配置后再试。</p>';
        }
        setStatus('Supabase 未初始化，无法访问私密空间', true);
        return;
    }

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

    mySupabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
            showGuestState();
            return;
        }
        currentUser = session.user;
        if (authStatusEl) authStatusEl.classList.add('hidden');
        if (workAreaEl) workAreaEl.classList.remove('hidden');
        loadSecretNotes();
    });

    loadSecretNotes();
}

async function loadSecretNotes() {
    if (!currentUser || !mySupabase) return;

    const { data, error } = await mySupabase.from('secret_notes')
        .select()
        .eq('user_id', currentUser.id)
        .order('updated_at', { ascending: false });

    if (error) {
        setStatus('加载私密笔记失败，请检查 Supabase 表结构', true);
        return;
    }

    secretNotes = data || [];
    if (!secretNotes.length) {
        renderSecretNotes();
        showEmptyState();
        return;
    }

    if (!activeSecretNoteId || !secretNotes.some(item => item.id === activeSecretNoteId)) {
        activeSecretNoteId = secretNotes[0].id;
    }

    renderSecretNotes();
    selectSecretNote(activeSecretNoteId);
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
        created_at: now,
        updated_at: now
    };

    setStatus('正在保存...');
    showEditorArea();

    if (activeSecretNoteId) {
        const { error } = await mySupabase.from('secret_notes')
            .update({ title: payload.title, content, updated_at: now })
            .eq('id', activeSecretNoteId)
            .eq('user_id', currentUser.id);

        if (error) {
            setStatus('更新失败，请检查权限与表结构', true);
            return;
        }

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

    const { data, error } = await mySupabase.from('secret_notes')
        .insert([payload])
        .select();

    if (error) {
        setStatus('保存失败，请检查 Supabase 表结构', true);
        return;
    }

    const createdNote = data && data[0] ? data[0] : null;
    if (createdNote) {
        secretNotes = [createdNote, ...secretNotes];
        activeSecretNoteId = createdNote.id;
        renderSecretNotes();
        showEditorArea();
        setStatus('私密笔记已保存');
    }
}

async function deleteCurrentNote() {
    if (!currentUser || !mySupabase || !activeSecretNoteId) {
        setStatus('请先选择一条私密笔记再删除', true);
        return;
    }

    if (!confirm('确定删除这篇私密笔记吗？')) return;

    const { error } = await mySupabase.from('secret_notes')
        .delete()
        .eq('id', activeSecretNoteId)
        .eq('user_id', currentUser.id);

    if (error) {
        setStatus('删除失败，请检查权限与表结构', true);
        return;
    }

    secretNotes = secretNotes.filter((note) => note.id !== activeSecretNoteId);
    clearEditor();
    renderSecretNotes();
    setStatus('私密笔记已删除');
}

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
    });
}

if (backToHomeBtn) {
    backToHomeBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
}

window.addEventListener('load', initSecretPage);
