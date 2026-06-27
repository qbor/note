window.addEventListener('DOMContentLoaded', () => {
    const navContainer = document.getElementById('global-navbar');
    
    if (navContainer) {
        fetch('nav.html')
            .then(response => {
                if (!response.ok) throw new Error('导航栏加载失败');
                return response.text();
            })
            .then(htmlContent => {
                navContainer.innerHTML = htmlContent;

                // 🌟 【核心高亮逻辑开始】
                // 1. 获取当前浏览器地址栏的完整文件名（例如 "index.html" 或 "secret_page.html"）
                // 如果直接访问根域名，默认判定为 "index.html"
                const currentPath = window.location.pathname.split('/').pop() || 'index.html';

                // 2. 抓取刚刚注入的导航栏里所有的 <a> 标签
                const navItems = navContainer.querySelectorAll('.g-nav__item');

                // 3. 循环比对，谁的 href 包含当前路径，谁就高亮
                navItems.forEach(item => {
                    const itemHref = item.getAttribute('href');
                    if (itemHref === currentPath) {
                        item.classList.add('is-active'); // 盖上高亮印章
                    }
                });
                // 🌟 【核心高亮逻辑结束】
            })
            .catch(error => {
                console.error('Navbar Error:', error);
            });
    }
});
