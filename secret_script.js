{
var SUPABASE_CONFIG = typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG : {};
var SUPABASE_URL = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '';
var SUPABASE_KEY = typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : '';
var mySupabase = typeof mySupabase !== 'undefined' ? mySupabase : null;

let secretNotes = [];
let activeSecretNoteId = null;
let currentUser = null;
let isInitializing = false;
let hasLoadedNotesOnce = false; 
let hasUnsavedChanges = false;  

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

function confirmDiscardUnsaved() {
    if (!hasUnsavedChanges) return true;
    return confirm('当前笔记有尚未保存的修改，确定要放弃修改并离开吗？');
}

function markDirty() {
    if (!hasUnsavedChanges) {
        hasUnsavedChanges = true;
        setStatus('内容已修改 (尚未保存)', false);
    }
}

function clearEditor() {
    if (secretTitleInput) secretTitleInput.value = '';
    if (secretNoteTextarea) secretNoteTextarea.value = '';
    activeSecretNoteId = null;
    hasUnsavedChanges = false;
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
    if (activeSecretNoteId === noteId) return; 
    if (!confirmDiscardUnsaved()) return;      

    const note = secretNotes.find((item) => item.id === noteId);
    if (!note) return;

    activeSecretNoteId = note.id;
    if (secretTitleInput) secretTitleInput.value = note.title || '';
    if (secretNoteTextarea) secretNoteTextarea.value = note.content || '';
    
    hasUnsavedChanges = false; 
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
    if (authStatusEl) authStatusEl.innerHTML = '<p>请先通过首页登录后再访问私密空间。</p>';
    if (workAreaEl) workAreaEl.classList.add('hidden');
    setStatus('请先登录后再访问私密空间', true);
    
    window.setTimeout(() => {
        window.location.replace('index.html');
    }, 2000);
}

async function initSecretPage() {
    if (isInitializing || !mySupabase) {
        if (authStatusEl) authStatusEl.innerHTML = '<p>当前环境无法连接到 Supabase，请检查配置后再试。</p>';
        setStatus('Supabase 未初始化，无法访问私密空间', true);
        return;
    }

    isInitializing = true;
    try {
        const { data, error } = await mySupabase.auth.getUser();
        if (error || !data?.user) {
            showGuestState();
            return;
        }

        currentUser = data.user;
        if (authStatusEl) authStatusEl.classList.add('hidden');
        if (workAreaEl) workAreaEl.classList.remove('hidden');

        mySupabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Secret page auth state:', event);
            if (event === 'SIGNED_OUT' || !session?.user) {
                showGuestState();
                return;
            }
            currentUser = session.user;
            if (authStatusEl) authStatusEl.classList.add('hidden');
            if (workAreaEl) workAreaEl.classList.remove('hidden');
            
            // 严防竞态：只允许触发一次网络拉取
            if (!hasLoadedNotesOnce) {
                hasLoadedNotesOnce = true;
                await loadSecretNotes();
            }
        });

        if (!hasLoadedNotesOnce) {
            hasLoadedNotesOnce = true;
            await loadSecretNotes();
        }
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
        const { data, error } = await mySupabase.from('secret_notes')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('updated_at', { ascending: false });

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

        hasUnsavedChanges = false;
        renderSecretNotes();
        selectSecretNote(activeSecretNoteId);
        setStatus('私密笔记加载完成');
    } catch (error) {
        console.error('加载私密笔记失败:', error);
        setStatus('加载私密笔记失败：' + error.message, true);
    }
}

async function handleSaveNote() {
    if (!currentUser || !mySupabase) return setStatus('请先登录后再保存私密笔记', true);

    const title = (secretTitleInput?.value || '').trim();
    const content = secretNoteTextarea?.value || '';
    if (!content.trim()) return setStatus('内容不能为空', true);

    const now = new Date().toISOString();
    const payload = {
        user_id: currentUser.id,
        title: title || '无标题私密笔记',
        content,
        updated_at: now
    };

    if (saveBtn) saveBtn.disabled = true; 
    setStatus('正在保存...');
    showEditorArea();

    try {
        if (activeSecretNoteId) {
            const { error } = await mySupabase.from('secret_notes')
                .update({ title: payload.title, content, updated_at: now })
                .eq('id', activeSecretNoteId)
                .eq('user_id', currentUser.id);
            
            if (error) throw error;

            const currentNote = secretNotes.find((item) => item.id === activeSecretNoteId);
            if (currentNote) {
                currentNote.title = payload.title;
                currentNote.content = content;
                currentNote.updated_at = now;
            }
            hasUnsavedChanges = false;
            renderSecretNotes();
            setStatus('私密笔记已保存更新');
            return;
        }

        payload.created_at = now;
        const { data, error } = await mySupabase.from('secret_notes').insert([payload]).select();
        if (error) throw error;

        const createdNote = data && data[0] ? data[0] : null;
        if (createdNote) {
            secretNotes = [createdNote, ...secretNotes];
            activeSecretNoteId = createdNote.id;
            hasUnsavedChanges = false;
            renderSecretNotes();
            showEditorArea();
            setStatus('新私密笔记已保存');
        }
    } catch (error) {
        console.error('保存私密笔记失败:', error);
        setStatus('保存失败：' + error.message, true);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

async function deleteCurrentNote() {
    if (!currentUser || !mySupabase || !activeSecretNoteId) return setStatus('请先选择一条私密笔记再删除', true);
    if (!confirm('确定删除这篇私密笔记吗？此操作无法撤销。')) return;

    if (deleteSecretBtn) deleteSecretBtn.disabled = true;
    setStatus('正在从云端删除...');
    try {
        const { error } = await mySupabase.from('secret_notes')
            .delete()
            .eq('id', activeSecretNoteId)
            .eq('user_id', currentUser.id);
        
        if (error) throw error;

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
    } finally {
        if (deleteSecretBtn) deleteSecretBtn.disabled = false;
    }
}
if (saveBtn) saveBtn.addEventListener('click', handleSaveNote);
if (deleteSecretBtn) deleteSecretBtn.addEventListener('click', deleteCurrentNote);

if (newSecretNoteBtn) {
    newSecretNoteBtn.addEventListener('click', () => {
        if (!currentUser || !mySupabase) return setStatus('请先登录后再创建私密笔记', true);
        if (!confirmDiscardUnsaved()) return; 

        clearEditor();
        renderSecretNotes(); 
        showEditorArea();
        setStatus('请输入私密笔记内容，然后点击保存。');
        if (secretTitleInput) secretTitleInput.focus();
    });
}

if (backToHomeBtn) {
    backToHomeBtn.addEventListener('click', (e) => {
        if (!confirmDiscardUnsaved()) return;
        window.location.href = 'index.html';
    });
}
if (secretTitleInput) secretTitleInput.addEventListener('input', markDirty);
if (secretNoteTextarea) secretNoteTextarea.addEventListener('input', markDirty);

window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = ''; 
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSecretPage);
} else {
    initSecretPage();
}
}
