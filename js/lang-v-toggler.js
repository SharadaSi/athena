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
            // Preserve slug (?slug=...) and hash while flipping locale.
            const url = new URL(window.location.href);
            const currentPath = url.pathname || '/';
            let targetPath;

            if (currentPath.includes('/cs/')) {
                // CS -> EN: strip leading /cs
                targetPath = currentPath.replace(/^\/cs(?=\/)/, '');
                if (targetPath === '') targetPath = '/';
            } else {
                // EN -> CS: prefix /cs
                const normalized = currentPath.startsWith('/') ? currentPath : `/${currentPath}`;
                targetPath = normalized === '/' ? '/cs/' : `/cs${normalized}`;
            }

            url.pathname = targetPath;
            window.location.assign(url.toString());
        });
    });
})();