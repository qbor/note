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
                const currentPath = window.location.pathname.split('/').pop() || 'index.html';

                const navItems = navContainer.querySelectorAll('.g-nav__item');

                navItems.forEach(item => {
                    const itemHref = item.getAttribute('href');
                    if (itemHref === currentPath) {
                        item.classList.add('is-active'); 
                    }
                });
            })
            .catch(error => {
                console.error('Navbar Error:', error);
            });
    }
});
