// Dual slider logic
const budgetMinRange = document.getElementById('input-min');
const budgetMaxRange = document.getElementById('input-max');
const budgetRangeHighlight = document.getElementById('slider-highlight');
const budgetDisplayText = document.getElementById('budget-display');
const budgetContainer = document.querySelector('.contact-form--budget-container');
const budgetSliderTrack = document.querySelector('.budget-range-slider');

if (budgetMinRange && budgetMaxRange && budgetRangeHighlight && budgetDisplayText && budgetSliderTrack) {
    const budgetConfig = {
        currency: budgetContainer?.dataset.currency || 'EUR',
        currencyDisplay: budgetContainer?.dataset.currencyDisplay || 'symbol',
        locale: budgetContainer?.dataset.locale || 'en',
        minGap: Number(budgetContainer?.dataset.minGap) || 200,
    };

    function formatBudgetAmount(value) {
        return new Intl.NumberFormat(budgetConfig.locale, {
            style: 'currency',
            currency: budgetConfig.currency,
            currencyDisplay: budgetConfig.currencyDisplay,
            maximumFractionDigits: 0,
        }).format(value);
    }

    function getSliderBounds() {
        return {
            min: Number(budgetMinRange.min),
            max: Number(budgetMinRange.max),
            step: Number(budgetMinRange.step) || 1,
        };
    }

    function snapBudgetValueToStep(value) {
        const sliderBounds = getSliderBounds();
        const steppedValue = sliderBounds.min + Math.round((value - sliderBounds.min) / sliderBounds.step) * sliderBounds.step;

        return Math.min(sliderBounds.max, Math.max(sliderBounds.min, steppedValue));
    }

    function getBudgetValueFromTrackPosition(clientX) {
        const sliderRect = budgetSliderTrack.getBoundingClientRect();
        const sliderBounds = getSliderBounds();
        const clickRatio = Math.min(1, Math.max(0, (clientX - sliderRect.left) / sliderRect.width));
        const rawValue = sliderBounds.min + clickRatio * (sliderBounds.max - sliderBounds.min);

        return snapBudgetValueToStep(rawValue);
    }

    function updateBudgetSlider(event) { // updating slider values live based on user input
        let minBudget = parseInt(budgetMinRange.value, 10);
        let maxBudget = parseInt(budgetMaxRange.value, 10);

        // Prevent the two thumbs from crossing over each other.
        if (minBudget > maxBudget - budgetConfig.minGap) {
            if (event && event.target === budgetMinRange) {
                budgetMinRange.value = maxBudget - budgetConfig.minGap;
                minBudget = maxBudget - budgetConfig.minGap;
            } else {
                budgetMaxRange.value = minBudget + budgetConfig.minGap;
                maxBudget = minBudget + budgetConfig.minGap;
            }
        }

        const sliderMin = Number(budgetMinRange.min);
        const sliderMax = Number(budgetMinRange.max);
        const totalRange = sliderMax - sliderMin;
        const minThumbPercent = ((minBudget - sliderMin) / totalRange) * 100;
        const maxThumbPercent = ((maxBudget - sliderMin) / totalRange) * 100;

        budgetRangeHighlight.style.left = minThumbPercent + '%';
        budgetRangeHighlight.style.width = (maxThumbPercent - minThumbPercent) + '%';
        budgetDisplayText.innerHTML = `${formatBudgetAmount(minBudget)} &mdash; ${formatBudgetAmount(maxBudget)}`;
    }

    function handleBudgetTrackClick(event) {
        if (event.target.closest('input.dual-range')) {
            return;
        }

        const clickedBudgetValue = getBudgetValueFromTrackPosition(event.clientX);
        const currentMinBudget = Number(budgetMinRange.value);
        const currentMaxBudget = Number(budgetMaxRange.value);
        const distanceToMinThumb = Math.abs(clickedBudgetValue - currentMinBudget);
        const distanceToMaxThumb = Math.abs(clickedBudgetValue - currentMaxBudget);

        if (distanceToMinThumb <= distanceToMaxThumb) {
            budgetMinRange.value = Math.min(clickedBudgetValue, currentMaxBudget - budgetConfig.minGap);
            updateBudgetSlider({ target: budgetMinRange });
            return;
        }

        budgetMaxRange.value = Math.max(clickedBudgetValue, currentMinBudget + budgetConfig.minGap);
        updateBudgetSlider({ target: budgetMaxRange });
    }

    budgetMinRange.addEventListener('input', updateBudgetSlider);
    budgetMaxRange.addEventListener('input', updateBudgetSlider);
    budgetSliderTrack.addEventListener('click', handleBudgetTrackClick);
    updateBudgetSlider();
}



// VALIDATION


(() => { //IIFE (Immediately Invoked Function Expression) wraps up the validation logic to not interfere with the rest of the code.
    const contactForm = document.getElementById('contactForm');
    if (!contactForm) return;

    const nameInput = document.getElementById('name');
    if (nameInput) nameInput.focus();

    const isPageCzech = document.documentElement.lang === 'cs';

    // Bilingual error messages
    const errorMessages = {
        nameRequired:     isPageCzech ? 'Prosím vyplňte své jméno.'             : 'Please enter your name.', //Ternary conditional, shorthand If/else
        nameTooShort:     isPageCzech ? 'Jméno musí mít alespoň 2 znaky.'      : 'Name must be at least 2 characters.',
        emailRequired:    isPageCzech ? 'Prosím vyplňte svůj email.'            : 'Please enter your email.',
        emailInvalid:     isPageCzech ? 'Prosím zadejte platnou emailovou adresu.' : 'Please enter a valid email address.',
        emailPattern:     isPageCzech ? 'Zadejte email ve formátu jméno@doména.cz'  : 'Enter an email in the format name@domain.com',
        interestRequired: isPageCzech ? 'Prosím vyberte alespoň jednu službu.'  : 'Please select at least one service.', 
        urgencyRequired:  isPageCzech ? 'Prosím vyberte naléhavost projektu.'   : 'Please select project urgency.',
    };

    
    const nameField           = document.getElementById('name');
    const emailField          = document.getElementById('email');
    const interestCheckboxes  = contactForm.querySelectorAll('.button-checkbox');
    const urgencyRadios       = contactForm.querySelectorAll('input[name="urgency"]');
    const interestSection     = contactForm.querySelector('.contact-form--btns-project');
    const urgencySection      = contactForm.querySelector('.contact-form--btns-urgency');

    /**
     * Create (or retrieve) an error <span> inside a parent element.
     * Uses aria-live="polite" so screen readers announce changes.
     */
    function getOrCreateErrorSpan(parentContainer, errorId) {
        let errorSpan = parentContainer.querySelector(`#${errorId}`);
        if (!errorSpan) {
            errorSpan = document.createElement('span');
            errorSpan.id = errorId;
            errorSpan.className = 'error-message';
            errorSpan.setAttribute('aria-live', 'polite');
            parentContainer.appendChild(errorSpan);
        }
        return errorSpan;
    }

    function displayFieldError(fieldElement, errorSpan, errorText) {
        fieldElement.classList.add('--invalid');
        errorSpan.textContent = errorText;
    }

    function clearFieldError(fieldElement, errorSpan) {
        fieldElement.classList.remove('--invalid');
        errorSpan.textContent = '';
    }

    // --- Individual validators -------------------------------------------------

    function validateNameField() {
        const errorSpan = getOrCreateErrorSpan(nameField.closest('.contact-form--group1'), 'name-error');
        if (nameField.validity.valueMissing) {
            displayFieldError(nameField, errorSpan, errorMessages.nameRequired);
            return false;
        }
        if (nameField.validity.tooShort) {
            displayFieldError(nameField, errorSpan, errorMessages.nameTooShort);
            return false;
        }
        clearFieldError(nameField, errorSpan);
        return true;
    }

    function validateEmailField() {
        const errorSpan = getOrCreateErrorSpan(emailField.closest('.contact-form--group2'), 'email-error');
        if (emailField.validity.valueMissing) {
            displayFieldError(emailField, errorSpan, errorMessages.emailRequired);
            return false;
        }
        if (emailField.validity.typeMismatch) { //Built-in browser email regex - 127 checks
            displayFieldError(emailField, errorSpan, errorMessages.emailInvalid);
            return false;
        }
        if (emailField.validity.patternMismatch) { //Stricter pattern attribute check
            displayFieldError(emailField, errorSpan, errorMessages.emailPattern);
            return false;
        }
        clearFieldError(emailField, errorSpan);
        return true;
    }

    function validateInterestSelection() {
        const errorSpan = getOrCreateErrorSpan(interestSection, 'interest-error');
        const hasInterestSelected = [...interestCheckboxes].some(checkbox => checkbox.checked);
        if (!hasInterestSelected) {
            displayFieldError(interestSection, errorSpan, errorMessages.interestRequired);
            return false;
        }
        clearFieldError(interestSection, errorSpan);
        return true;
    }

    function validateUrgencySelection() {
        const errorSpan = getOrCreateErrorSpan(urgencySection, 'urgency-error');
        const hasUrgencySelected = [...urgencyRadios].some(radio => radio.checked);
        if (!hasUrgencySelected) {
            displayFieldError(urgencySection, errorSpan, errorMessages.urgencyRequired);
            return false;
        }
        clearFieldError(urgencySection, errorSpan);
        return true;
    }

    // --- Live feedback ---------------------------------------------------------

    // Validate on blur, triggers when users clicks inside inp.field and then elsewhere
    nameField.addEventListener('blur',  validateNameField);
    emailField.addEventListener('blur', validateEmailField);

    // Validate groups on change
    interestCheckboxes.forEach(checkbox => checkbox.addEventListener('change', validateInterestSelection));
    urgencyRadios.forEach(radio        => radio.addEventListener('change',    validateUrgencySelection));

    // Clear errors as the user types (only after the field was already flagged)
    nameField.addEventListener('input', () => {
        if (nameField.classList.contains('--invalid')) validateNameField();
    });
    emailField.addEventListener('input', () => {
        if (emailField.classList.contains('--invalid')) validateEmailField();
    });

    // --- Submit handler --------------------------------------------------------

    contactForm.addEventListener('submit', (event) => {
        // Run every validator so all errors appear at once
        const validationResults = [
            validateNameField(),
            validateEmailField(),
            validateInterestSelection(),
            validateUrgencySelection(),
        ];

        if (validationResults.includes(false)) {
            event.preventDefault();

            // Put Focus the first invalid inp.field for accessibility
            const firstInvalidElement = contactForm.querySelector('.--invalid');
            if (firstInvalidElement) {
                const focusableInput = firstInvalidElement.matches('input, textarea, select')
                    ? firstInvalidElement
                    : firstInvalidElement.querySelector('input');
                if (focusableInput) focusableInput.focus();
            }
        } else {
            // Validation passed — form will submit naturally to PHP
        }

    });

    // --- Submission status banner ----------------------------------------------
    // After PHP processes the form, it redirects back with ?status=success or ?status=error.
    // URLSearchParams reads query parameters from the current URL.

    const urlParams     = new URLSearchParams(window.location.search);
    const submitStatus  = urlParams.get('status'); // "success", "error", or null

    if (submitStatus) {
        const banner       = document.createElement('div');
        banner.className   = 'submission-banner';

        if (submitStatus === 'success') {
            banner.classList.add('--success');
            banner.textContent = isPageCzech
                ? 'Děkujeme! Vaše poptávka byla úspěšně odeslána.'
                : 'Thank you! Your inquiry has been sent successfully.';
        } else if (submitStatus === 'captcha') {
            // ALTCHA verification failed on the server
            banner.classList.add('--error');
            banner.textContent = isPageCzech
                ? 'Ověření se nezdařilo. Zkuste to prosím znovu.'
                : 'Verification failed. Please try again.';
        } else {
            banner.classList.add('--error');
            banner.textContent = isPageCzech
                ? 'Odeslání se nezdařilo. Zkuste to prosím znovu.'
                : 'Submission failed. Please try again.';
        }

        // Insert the banner after the submit button, inside the form
        const submitButton = contactForm.querySelector('.contact-form--btn');
        submitButton.insertAdjacentElement('afterend', banner);

        // Auto-dismiss after 8 seconds
        setTimeout(() => {
            banner.remove();
        }, 8000);

        // Clean the URL so ?status= doesn't persist on refresh
        // replaceState updates the URL bar without reloading the page
        window.history.replaceState({}, '', window.location.pathname);
    }
})();

