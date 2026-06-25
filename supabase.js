// 官方标准 Supabase 客户端连接器模块
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.supabase = {}));
})(this, (function (exports) { 'use strict';

    var createClient = function (supabaseUrl, supabaseKey) {
        var headers = {
            'apikey': supabaseKey,
            'Authorization': 'Bearer ' + supabaseKey,
            'Content-Type': 'application/json'
        };
        return {
            auth: {
                __authStateChangeCallback: null,
                getUser: async function () {
                    var token = localStorage.getItem('sb_real_token');
                    if (!token) return { data: { user: null }, error: null };
                    try {
                        var res = await fetch(supabaseUrl + '/auth/v1/user', { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + token } });
                        var data = await res.json();
                        if (res.ok) return { data: { user: data }, error: null };
                        return { data: { user: null }, error: data };
                    } catch (e) { return { data: { user: null }, error: e }; }
                },
                onAuthStateChange: function (callback) {
                    this.__authStateChangeCallback = callback;
                    setTimeout(async function () {
                        var token = localStorage.getItem('sb_real_token');
                        if (token) {
                            try {
                                var res = await fetch(supabaseUrl + '/auth/v1/user', { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + token } });
                                var data = await res.json();
                                if (res.ok) callback('SIGNED_IN', { user: data });
                                else callback('SIGNED_OUT', null);
                            } catch (e) { callback('SIGNED_OUT', null); }
                        } else { callback('SIGNED_OUT', null); }
                    }, 50);
                },
                signUp: async function (creds) {
                    try {
                        var res = await fetch(supabaseUrl + '/auth/v1/signup', { method: 'POST', headers: headers, body: JSON.stringify({ email: creds.email, password: creds.password }) });
                        var data = await res.json();
                        if (!res.ok) return { data: null, error: data };
                        return { data: data, error: null };
                    } catch (e) { return { data: null, error: e }; }
                },
                signInWithPassword: async function (creds) {
                    try {
                        var res = await fetch(supabaseUrl + '/auth/v1/token?grant_type=password', { method: 'POST', headers: headers, body: JSON.stringify({ email: creds.email, password: creds.password }) });
                        var data = await res.json();
                        if (!res.ok) return { data: null, error: data };
                        localStorage.setItem('sb_real_token', data.access_token);
                        if (this.__authStateChangeCallback) {
                            var userRes = await this.getUser();
                            this.__authStateChangeCallback('SIGNED_IN', { user: userRes.data?.user ?? null });
                        }
                        return { data: data, error: null };
                    } catch (e) { return { data: null, error: e }; }
                },
                signOut: async function () {
                    localStorage.removeItem('sb_real_token');
                    if (this.__authStateChangeCallback) this.__authStateChangeCallback('SIGNED_OUT', null);
                    return { error: null };
                }
            },
            from: function (tableName) {
                return {
                    select: function () {
                        return {
                            eq: function (field, val) {
                                return {
                                    order: function (sortField, opts) {
                                        return (async function () {
                                            var token = localStorage.getItem('sb_real_token');
                                            var h = Object.assign({}, headers, { 'Authorization': 'Bearer ' + token });
                                            try {
                                                var res = await fetch(supabaseUrl + '/rest/v1/' + tableName + '?' + field + '=eq.' + val + '&order=' + sortField + '.' + (opts.ascending ? 'asc' : 'desc'), { headers: h });
                                                var data = await res.json();
                                                return { data: data, error: res.ok ? null : data };
                                            } catch (e) { return { data: null, error: e }; }
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
                                    var h = Object.assign({}, headers, { 'Authorization': 'Bearer ' + token, 'Prefer': 'return=representation' });
                                    try {
                                        var res = await fetch(supabaseUrl + '/rest/v1/' + tableName, { method: 'POST', headers: h, body: JSON.stringify(arr) });
                                        var data = await res.json();
                                        return { data: data, error: res.ok ? null : data };
                                    } catch (e) { return { data: null, error: e }; }
                                })();
                            }
                        };
                    },
                    update: function (obj) {
                        return {
                            eq: function (field, val) {
                                return (async function () {
                                    var token = localStorage.getItem('sb_real_token');
                                    var h = Object.assign({}, headers, { 'Authorization': 'Bearer ' + token });
                                    try {
                                        var res = await fetch(supabaseUrl + '/rest/v1/' + tableName + '?' + field + '=eq.' + val, { method: 'PATCH', headers: h, body: JSON.stringify(obj) });
                                        return { error: res.ok ? null : true };
                                    } catch (e) { return { error: e }; }
                                })();
                            }
                        };
                    },
                    delete: function () {
                        return {
                            eq: function (field, val) {
                                return (async function () {
                                    var token = localStorage.getItem('sb_real_token');
                                    var h = Object.assign({}, headers, { 'Authorization': 'Bearer ' + token });
                                    try {
                                        var res = await fetch(supabaseUrl + '/rest/v1/' + tableName + '?' + field + '=eq.' + val, { method: 'DELETE', headers: h });
                                        return { error: res.ok ? null : true };
                                    } catch (e) { return { error: e }; }
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
