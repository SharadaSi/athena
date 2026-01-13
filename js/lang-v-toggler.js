// Language version toggler: supports both header and menu toggles
(() => {
    const toggles = Array.from(
        document.querySelectorAll('#switch-mode, #nav--item-switch-mode')
    );

    if (!toggles.length) {
        console.warn('Language switch checkboxes not found');
        return;
    }

    const path = window.location.pathname || '/';
    const isCzech = path.includes('/cs/');

    // Unchecked = CS, Checked = EN
    toggles.forEach((checkbox) => {
        checkbox.checked = !isCzech;
        checkbox.addEventListener('change', () => {
            const current = window.location.pathname || '/';
            let target;

            if (current.includes('/cs/')) {
                // From CS to EN: remove first '/cs' segment anywhere in path
                target = current.replace(/\/cs(?=\/)/, '');
                if (target === '') target = '/';
            } else {
                // From EN to CS: add '/cs' at the root
                const normalized = current.startsWith('/') ? current : `/${current}`;
                target = normalized === '/' ? '/cs/' : `/cs${normalized}`;
            }

            window.location.assign(target);
        });
    });
})();