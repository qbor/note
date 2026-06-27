// 官方标准 Supabase 客户端连接器模块
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.supabase = {}));
})(this, (function (exports) { 'use strict';

    var createClient = function (supabaseUrl, supabaseKey, options) {
        var authOptions = (options && options.auth) ? options.auth : {};
        var headers = {
            'apikey': supabaseKey,
            'Authorization': 'Bearer ' + supabaseKey,
            'Content-Type': 'application/json'
        };

        // 修复：统一的 Auth 状态管理
        let authStateListeners = [];
        function notifyAuthStateChange(event, session) {
            authStateListeners.forEach(callback => callback(event, session));
        }

        return {
            auth: {
                onAuthStateChange: function (callback) {
                    authStateListeners.push(callback);
                    // 立即检查当前状态
                    setTimeout(async () => {
                        const token = localStorage.getItem('sb_real_token');
                        if (token) {
                            try {
                                const res = await fetch(supabaseUrl + '/auth/v1/user', { 
                                    headers: { 
                                        'apikey': supabaseKey, 
                                        'Authorization': 'Bearer ' + token 
                                    } 
                                });
                                if (res.status === 401 || res.status === 403) {
                                    localStorage.removeItem('sb_real_token');
                                    notifyAuthStateChange('SIGNED_OUT', null);
                                } else {
                                    const data = await res.json();
                                    if (res.ok) {
                                        notifyAuthStateChange('SIGNED_IN', { user: data });
                                    } else {
                                        notifyAuthStateChange('SIGNED_OUT', null);
                                    }
                                }
                            } catch (e) { 
                                notifyAuthStateChange('SIGNED_OUT', null); 
                            }
                        } else { 
                            notifyAuthStateChange('SIGNED_OUT', null); 
                        }
                    }, 50);
                },
                getUser: async function () {
                    var token = localStorage.getItem('sb_real_token');
                    if (!token) return { data: { user: null }, error: null };
                    try {
                        var res = await fetch(supabaseUrl + '/auth/v1/user', { 
                            headers: { 
                                'apikey': supabaseKey, 
                                'Authorization': 'Bearer ' + token 
                            } 
                        });
                        // 修复：401 也清理 Token（不仅仅是 403）
                        if (res.status === 401 || res.status === 403) {
                            localStorage.removeItem('sb_real_token');
                            return { data: { user: null }, error: { status: res.status, message: 'Token 无效' } };
                        }
                        var data = await res.json();
                        if (res.ok) return { data: { user: data }, error: null };
                        return { data: { user: null }, error: data };
                    } catch (e) { 
                        console.error('getUser 异常:', e);
                        return { data: { user: null }, error: e }; 
                    }
                },
                signUp: async function (creds) {
                    try {
                        var body = { email: creds.email, password: creds.password };
                        if (creds.options && creds.options.emailRedirectTo) {
                            body.redirect_to = creds.options.emailRedirectTo;
                        } else if (authOptions.redirectTo) {
                            body.redirect_to = authOptions.redirectTo;
                        }
                        var res = await fetch(supabaseUrl + '/auth/v1/signup', { 
                            method: 'POST', 
                            headers: headers, 
                            body: JSON.stringify(body) 
                        });
                        var data = await res.json();
                        if (!res.ok) return { data: null, error: data };
                        return { data: data, error: null };
                    } catch (e) { 
                        console.error('signUp 异常:', e);
                        return { data: null, error: e }; 
                    }
                },
                signInWithPassword: async function (creds) {
                    try {
                        var res = await fetch(supabaseUrl + '/auth/v1/token?grant_type=password', { 
                            method: 'POST', 
                            headers: headers, 
                            body: JSON.stringify({ email: creds.email, password: creds.password }) 
                        });
                        var data = await res.json();
                        if (!res.ok) return { data: null, error: data };
                        
                        // 修复：正确存储 Token
                        localStorage.setItem('sb_real_token', data.access_token);
                        // 立即通知状态变化
                        const userRes = await this.getUser();
                        notifyAuthStateChange('SIGNED_IN', { user: userRes.data?.user ?? null });
                        
                        return { data: data, error: null };
                    } catch (e) { 
                        console.error('signInWithPassword 异常:', e);
                        return { data: null, error: e }; 
                    }
                },
                signOut: async function () {
                    try {
                        localStorage.removeItem('sb_real_token');
                        notifyAuthStateChange('SIGNED_OUT', null);
                    } catch (e) {
                        console.error('signOut 异常:', e);
                    }
                    return { error: null };
                }
            },
            from: function (tableName) {
                return {
                    select: function (columns = '*') {
                        // 修复：支持列选择，默认 *
                        let queryParams = [];
                        let filterField = null;
                        let filterValue = null;
                        let sortField = null;
                        let sortDirection = 'asc';

                        return {
                            eq: function (field, val) {
                                filterField = field;
                                filterValue = val;
                                return {
                                    order: function (sortFld, opts) {
                                        sortField = sortFld;
                                        sortDirection = opts?.ascending ? 'asc' : 'desc';
                                        // 修复：返回 Promise 而不是嵌套函数
                                        return (async function () {
                                            var token = localStorage.getItem('sb_real_token');
                                            var h = Object.assign({}, headers, { 'Authorization': 'Bearer ' + (token || supabaseKey) });
                                            
                                            // 构建查询参数
                                            let query = `${tableName}?${filterField}=eq.${encodeURIComponent(filterValue)}`;
                                            if (sortField) {
                                                query += `&order=${sortField}.${sortDirection}`;
                                            }
                                            
                                            try {
                                                var res = await fetch(`${supabaseUrl}/rest/v1/${query}`, { headers: h });
                                                var data = await res.json();
                                                return { data: res.ok ? data : null, error: res.ok ? null : data };
                                            } catch (e) { 
                                                console.error('查询异常:', e);
                                                return { data: null, error: e }; 
                                            }
                                        })();
                                    }
                                };
                            }
                        };
                    },
                    insert: function (arr) {
                        return {
                            select: function () {
                                return (async function () {
                                    var token = localStorage.getItem('sb_real_token');
                                    var h = Object.assign({}, headers, { 
                                        'Authorization': 'Bearer ' + (token || supabaseKey),
                                        'Prefer': 'return=representation' 
                                    });
                                    try {
                                        var res = await fetch(`${supabaseUrl}/rest/v1/${tableName}`, { 
                                            method: 'POST', 
                                            headers: h, 
                                            body: JSON.stringify(arr) 
                                        });
                                        var data = await res.json();
                                        return { data: res.ok ? data : null, error: res.ok ? null : data };
                                    } catch (e) { 
                                        console.error('插入异常:', e);
                                        return { data: null, error: e }; 
                                    }
                                })();
                            }
                        };
                    },
                    update: function (obj) {
                        return {
                            eq: function (field, val) {
                                return (async function () {
                                    var token = localStorage.getItem('sb_real_token');
                                    var h = Object.assign({}, headers, { 'Authorization': 'Bearer ' + (token || supabaseKey) });
                                    try {
                                        var res = await fetch(`${supabaseUrl}/rest/v1/${tableName}?${field}=eq.${encodeURIComponent(val)}`, { 
                                            method: 'PATCH', 
                                            headers: h, 
                                            body: JSON.stringify(obj) 
                                        });
                                        return { error: res.ok ? null : await res.json().catch(() => ({ message: '更新失败' })) };
                                    } catch (e) { 
                                        console.error('更新异常:', e);
                                        return { error: e }; 
                                    }
                                })();
                            }
                        };
                    },
                    delete: function () {
                        return {
                            eq: function (field, val) {
                                return (async function () {
                                    var token = localStorage.getItem('sb_real_token');
                                    var h = Object.assign({}, headers, { 'Authorization': 'Bearer ' + (token || supabaseKey) });
                                    try {
                                        var res = await fetch(`${supabaseUrl}/rest/v1/${tableName}?${field}=eq.${encodeURIComponent(val)}`, { 
                                            method: 'DELETE', 
                                            headers: h 
                                        });
                                        return { error: res.ok ? null : await res.json().catch(() => ({ message: '删除失败' })) };
                                    } catch (e) { 
                                        console.error('删除异常:', e);
                                        return { error: e }; 
                                    }
                                })();
                            }
                        };
                    }
                };
            }
        };
    };

    exports.createClient = createClient;
    Object.defineProperty(exports, '__esModule', { value: true });
}));