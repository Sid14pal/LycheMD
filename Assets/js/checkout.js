/**
 * LycheMD - Checkout Interactive Application Logic
 * Manages treatment selection, live pricing calculation, countdown timer,
 * form formatting, input validation, and secure order submission.
 */

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. DATA STATE & CONFIGURATION
    // =========================================================================
    const checkoutState = {
        formulation: 'injection', // 'injection' | 'oral'
        treatment: 'semaglutide', // 'semaglutide' | 'tirzepatide'
        plan: '3-month',          // 'monthly' | '3-month' | '6-month'
        prices: {
            injection: {
                semaglutide: {
                    name: 'Semaglutide Injection (Compounded GLP-1)',
                    sub: 'Active ingredient in Ozempic® & Wegovy®',
                    img: 'Assets/images/semaglutide.png',
                    monthly: 299,
                    '3-month': 249, // billed $747 quarterly
                    '6-month': 199, // billed $1,194 semi-annually
                },
                tirzepatide: {
                    name: 'Tirzepatide Injection (Compounded GIP/GLP-1)',
                    sub: 'Active ingredient in Mounjaro® & Zepbound®',
                    img: 'Assets/images/tirzepatide.png',
                    monthly: 399,
                    '3-month': 349, // billed $1,047 quarterly
                    '6-month': 299, // billed $1,794 semi-annually
                }
            },
            oral: {
                semaglutide: {
                    name: 'Semaglutide Oral Drops (Sublingual GLP-1)',
                    sub: 'Needle-free daily sublingual liquid formula',
                    img: 'Assets/images/semaglutide-oral.png',
                    monthly: 249,
                    '3-month': 199, // billed $597 quarterly
                    '6-month': 169, // billed $1,014 semi-annually
                },
                tirzepatide: {
                    name: 'Tirzepatide Oral Drops (Sublingual GIP/GLP-1)',
                    sub: 'Needle-free daily dual-action liquid formula',
                    img: 'Assets/images/tirzepatide-oral.png',
                    monthly: 349,
                    '3-month': 299, // billed $897 quarterly
                    '6-month': 259, // billed $1,554 semi-annually
                }
            }
        }
    };

    // =========================================================================
    // 2. DOM ELEMENTS
    // =========================================================================
    const dosageBtns = document.querySelectorAll('.checkout-dosage-btn');
    const treatmentCards = document.querySelectorAll('.checkout-treatment-card');
    const planCards = document.querySelectorAll('.checkout-plan-card');

    // Step Navigation Anchors
    const stepTreatmentEl = document.getElementById('stepTreatment');
    const stepChoosePlanEl = document.getElementById('stepChoosePlan');
    const stepShippingInfoEl = document.getElementById('stepShippingInfo');

    // Live Order Summary Elements
    const summaryTreatmentEl = document.getElementById('summaryTreatment');
    const summaryPlanEl = document.getElementById('summaryPlan');
    const summaryTotalEl = document.getElementById('summaryTotal');
    const btnPayAmountEl = document.getElementById('btnPayAmount');

    // Countdown Timer Elements
    const timerEl = document.getElementById('checkoutTimer');
    const timerProgressEl = document.getElementById('checkoutTimerProgress');

    // Header Approval Countdown Timer Elements
    const topTimerBox1 = document.getElementById('topTimerBox1');
    const topTimerBox2 = document.getElementById('topTimerBox2');
    const topTimerBox3 = document.getElementById('topTimerBox3');

    // Form & Input Elements
    const checkoutForm = document.getElementById('checkoutForm');
    const sameBillingCheckbox = document.getElementById('sameBillingAddress');
    const billingFieldsWrap = document.getElementById('billingAddressFields');
    const cardInput = document.getElementById('cardNumber');
    const cardExpiryInput = document.getElementById('cardExpiry');
    const cardCvcInput = document.getElementById('cardCvc');
    const cardBrandBadges = document.querySelectorAll('.card-brand-badge');

    // =========================================================================
    // 3. COUNTDOWN TIMERS
    // =========================================================================
    
    // --- A. Top Header Approval Expiration Timer (HH:MM:SS matching 12:37:20) ---
    const STORAGE_KEY_APPROVAL = 'lychemd_approval_deadline';
    const INITIAL_DURATION_SEC = (12 * 3600) + (37 * 60) + 20; // 12h 37m 20s
    let approvalDeadline = sessionStorage.getItem(STORAGE_KEY_APPROVAL);

    if (!approvalDeadline) {
        approvalDeadline = Date.now() + (INITIAL_DURATION_SEC * 1000);
        sessionStorage.setItem(STORAGE_KEY_APPROVAL, approvalDeadline.toString());
    } else {
        approvalDeadline = parseInt(approvalDeadline, 10);
        // If expired or invalid, reseed
        if (isNaN(approvalDeadline) || approvalDeadline <= Date.now()) {
            approvalDeadline = Date.now() + (INITIAL_DURATION_SEC * 1000);
            sessionStorage.setItem(STORAGE_KEY_APPROVAL, approvalDeadline.toString());
        }
    }

    function updateTopApprovalCountdown() {
        if (!topTimerBox1 || !topTimerBox2 || !topTimerBox3) return;

        const remainingMs = Math.max(0, approvalDeadline - Date.now());
        const totalSec = Math.floor(remainingMs / 1000);

        const hours = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;

        topTimerBox1.textContent = String(hours).padStart(2, '0');
        topTimerBox2.textContent = String(mins).padStart(2, '0');
        topTimerBox3.textContent = String(secs).padStart(2, '0');
    }

    // --- B. In-page Reservation Timer (14:59) ---
    let totalSeconds = 14 * 60 + 59;
    const initialSeconds = totalSeconds;

    function updateCountdown() {
        if (totalSeconds <= 0) {
            if (timerEl) timerEl.textContent = '00:00';
            if (timerProgressEl) timerProgressEl.style.width = '0%';
            return;
        }

        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        if (timerEl) {
            timerEl.textContent = formatted;
        }

        if (timerProgressEl) {
            const percent = (totalSeconds / initialSeconds) * 100;
            timerProgressEl.style.width = `${percent.toFixed(1)}%`;
        }

        totalSeconds--;
    }

    // Initialize both timers and set interval
    updateTopApprovalCountdown();
    updateCountdown();
    setInterval(() => {
        updateTopApprovalCountdown();
        updateCountdown();
    }, 1000);

    // =========================================================================
    // 4. PRICING & SELECTION ENGINE
    // =========================================================================
    function updatePricingAndUI() {
        const curForm = checkoutState.formulation;
        const curTreat = checkoutState.treatment;
        const curPlan = checkoutState.plan;
        const data = checkoutState.prices[curForm][curTreat];

        // Update treatment cards display
        treatmentCards.forEach((card) => {
            const tType = card.getAttribute('data-treatment');
            const isSelected = (tType === curTreat);
            card.classList.toggle('is-selected', isSelected);
            card.setAttribute('aria-checked', isSelected ? 'true' : 'false');

            const tData = checkoutState.prices[curForm][tType];
            const nameEl = card.querySelector('.checkout-treatment-name');
            const descEl = card.querySelector('.checkout-treatment-desc');
            const priceEl = card.querySelector('.checkout-treatment-price');
            const imgEl = card.querySelector('.checkout-treatment-img');

            if (nameEl) nameEl.textContent = tData.name;
            if (descEl) descEl.textContent = tData.sub;
            if (priceEl) priceEl.innerHTML = `From <strong>$${tData['3-month']}</strong> <span>/ month</span>`;
            if (imgEl) {
                imgEl.src = tData.img;
                imgEl.alt = tData.name;
            }
        });

        // Update Plan Cards display & values
        planCards.forEach((pCard) => {
            const pType = pCard.getAttribute('data-plan');
            const isSelected = (pType === curPlan);
            pCard.classList.toggle('is-selected', isSelected);
            pCard.setAttribute('aria-checked', isSelected ? 'true' : 'false');

            const rate = data[pType];
            const priceValEl = pCard.querySelector('.checkout-plan-price');
            const billingNoteEl = pCard.querySelector('.checkout-plan-billing-note');

            if (priceValEl) {
                priceValEl.textContent = `$${rate}`;
            }

            if (billingNoteEl) {
                if (pType === 'monthly') {
                    billingNoteEl.textContent = `$${rate} billed monthly • Cancel anytime`;
                } else if (pType === '3-month') {
                    const totalQuarterly = rate * 3;
                    const savings = (data.monthly - rate) * 3;
                    billingNoteEl.textContent = `$${totalQuarterly} billed every 3 mos (Save $${savings})`;
                } else if (pType === '6-month') {
                    const totalSemi = rate * 6;
                    const savings = (data.monthly - rate) * 6;
                    billingNoteEl.textContent = `$${totalSemi} billed every 6 mos (Save $${savings})`;
                }
            }
        });

        // Calculate dynamic total due today
        let totalDue = data[curPlan];
        let planLabel = 'Month-to-Month Plan';

        if (curPlan === '3-month') {
            totalDue = data['3-month'] * 3;
            planLabel = '3-Month Protocol ($' + data['3-month'] + '/mo)';
        } else if (curPlan === '6-month') {
            totalDue = data['6-month'] * 6;
            planLabel = '6-Month Full Transformation ($' + data['6-month'] + '/mo)';
        } else {
            planLabel = 'Monthly Plan ($' + data.monthly + '/mo)';
        }

        // Update Order Summary Box
        if (summaryTreatmentEl) {
            summaryTreatmentEl.textContent = data.name;
        }
        if (summaryPlanEl) {
            summaryPlanEl.textContent = planLabel;
        }
        if (summaryTotalEl) {
            summaryTotalEl.textContent = `$${totalDue}.00`;
        }
        if (btnPayAmountEl) {
            btnPayAmountEl.textContent = `$${totalDue}.00`;
        }
    }

    // Formulation Switcher Tabs
    dosageBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            dosageBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            checkoutState.formulation = btn.getAttribute('data-dosage') || 'injection';
            updatePricingAndUI();
        });
    });

    // Smooth scroll navigation helper with tactile step indicator highlight
    function smoothScrollToElement(targetEl, offset = 32) {
        if (!targetEl) return;
        const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const targetRect = targetEl.getBoundingClientRect();
        const targetTop = targetRect.top + window.pageYOffset - offset;

        window.scrollTo({
            top: Math.max(0, targetTop),
            behavior: prefersReducedMotion ? 'auto' : 'smooth'
        });

        // Tactile step highlight animation on arrival
        targetEl.classList.remove('step-nav-highlight');
        void targetEl.offsetWidth; // Trigger reflow to restart CSS animation
        targetEl.classList.add('step-nav-highlight');
        setTimeout(() => {
            targetEl.classList.remove('step-nav-highlight');
        }, 900);
    }

    // Treatment Card Click & Keyboard Selection -> Smoothly directs to Step 2 (Choose Your Plan)
    treatmentCards.forEach((card) => {
        const handleTreatmentSelect = () => {
            checkoutState.treatment = card.getAttribute('data-treatment') || 'semaglutide';
            updatePricingAndUI();

            // Seamless smooth transition to Step 2 ("Choose Your Plan")
            setTimeout(() => {
                smoothScrollToElement(stepChoosePlanEl, 32);
            }, 180);
        };

        card.addEventListener('click', handleTreatmentSelect);

        // Keyboard accessibility: Enter or Space
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTreatmentSelect();
            }
        });
    });

    // Plan Card Click & Keyboard Selection -> Seamlessly redirects to Step 3 (Shipping Information)
    planCards.forEach((card) => {
        const handlePlanSelect = () => {
            checkoutState.plan = card.getAttribute('data-plan') || '3-month';
            updatePricingAndUI();

            // Seamless smooth transition to Step 3 ("Shipping Information")
            setTimeout(() => {
                smoothScrollToElement(stepShippingInfoEl, 32);
            }, 180);
        };

        card.addEventListener('click', handlePlanSelect);

        // Keyboard accessibility: Enter or Space
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handlePlanSelect();
            }
        });
    });

    // Initial render
    updatePricingAndUI();

    // =========================================================================
    // 5. BILLING ADDRESS TOGGLE
    // =========================================================================
    if (sameBillingCheckbox && billingFieldsWrap) {
        sameBillingCheckbox.addEventListener('change', () => {
            if (sameBillingCheckbox.checked) {
                billingFieldsWrap.style.display = 'none';
            } else {
                billingFieldsWrap.style.display = 'block';
                const firstBillingInput = billingFieldsWrap.querySelector('input');
                if (firstBillingInput) firstBillingInput.focus();
            }
        });
    }

    // =========================================================================
    // 6. CARD INPUT FORMATTING & BRAND DETECTION
    // =========================================================================
    if (cardInput) {
        cardInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (val.length > 16) val = val.substring(0, 16);

            // Add spaces every 4 characters
            const parts = [];
            for (let i = 0; i < val.length; i += 4) {
                parts.push(val.substring(i, i + 4));
            }
            e.target.value = parts.join(' ');

            // Detect card brand
            let detectedBrand = null;
            if (/^4/.test(val)) {
                detectedBrand = 'visa';
            } else if (/^5[1-5]/.test(val) || /^2[2-7]/.test(val)) {
                detectedBrand = 'mastercard';
            } else if (/^3[47]/.test(val)) {
                detectedBrand = 'amex';
            } else if (/^6(?:011|5)/.test(val)) {
                detectedBrand = 'discover';
            }

            cardBrandBadges.forEach((badge) => {
                const bType = badge.getAttribute('data-brand');
                badge.classList.toggle('active', bType === detectedBrand);
            });
        });
    }

    if (cardExpiryInput) {
        cardExpiryInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (val.length > 4) val = val.substring(0, 4);

            if (val.length >= 2) {
                e.target.value = `${val.substring(0, 2)} / ${val.substring(2)}`;
            } else {
                e.target.value = val;
            }
        });
    }

    if (cardCvcInput) {
        cardCvcInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (val.length > 4) val = val.substring(0, 4);
            e.target.value = val;
        });
    }

    // Phone number formatting
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (val.length > 10) val = val.substring(0, 10);

            if (val.length > 6) {
                e.target.value = `(${val.substring(0, 3)}) ${val.substring(3, 6)}-${val.substring(6)}`;
            } else if (val.length > 3) {
                e.target.value = `(${val.substring(0, 3)}) ${val.substring(3)}`;
            } else if (val.length > 0) {
                e.target.value = `(${val}`;
            } else {
                e.target.value = '';
            }
        });
    }

    // Dynamic State Target Synchronization for "What's Included"
    const stateSelect = document.getElementById('state');
    const stateTargetEls = document.querySelectorAll('.checkout-state-target');
    const stateCodeEls = document.querySelectorAll('.checkout-state-code');

    if (stateSelect) {
        stateSelect.addEventListener('change', () => {
            const selectedText = stateSelect.options[stateSelect.selectedIndex]?.text || 'Georgia';
            const selectedCode = stateSelect.value || 'STATE';
            stateTargetEls.forEach(el => el.textContent = selectedText);
            stateCodeEls.forEach(el => el.textContent = selectedCode);
        });
    }

    // =========================================================================
    // 7. FORM VALIDATION & SUBMISSION
    // =========================================================================
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', (e) => {
            e.preventDefault();

            let isValid = true;
            let firstInvalidEl = null;

            // Clear previous errors
            document.querySelectorAll('.checkout-input').forEach(inp => {
                inp.classList.remove('is-invalid');
            });

            function validateField(id, validatorFn) {
                const el = document.getElementById(id);
                if (!el) return true;
                const valid = validatorFn(el.value.trim());
                if (!valid) {
                    el.classList.add('is-invalid');
                    if (!firstInvalidEl) firstInvalidEl = el;
                    isValid = false;
                }
                return valid;
            }

            // Validate Shipping Fields
            validateField('firstName', val => val.length >= 2);
            validateField('lastName', val => val.length >= 2);
            validateField('email', val => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val));
            validateField('phone', val => val.replace(/\D/g, '').length >= 10);
            validateField('address', val => val.length >= 5);
            validateField('city', val => val.length >= 2);
            validateField('state', val => val !== '');
            validateField('zipCode', val => /^\d{5}(?:-\d{4})?$/.test(val));

            // Validate Payment Fields
            validateField('cardNumber', val => val.replace(/\s/g, '').length >= 15);
            validateField('cardExpiry', val => {
                const parts = val.split('/').map(p => p.trim());
                if (parts.length !== 2) return false;
                const m = parseInt(parts[0], 10);
                const y = parseInt(parts[1], 10);
                return m >= 1 && m <= 12 && y >= 24;
            });
            validateField('cardCvc', val => val.length >= 3);

            if (!isValid) {
                if (firstInvalidEl) {
                    firstInvalidEl.focus();
                    firstInvalidEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
            }

            // Submit Success State
            const submitBtn = document.getElementById('btnSubmitOrder');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `
                    <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    <span>Securing Prescription &amp; Connecting...</span>
                `;
            }

            // Store order details in sessionStorage for order-confirmation.html
            const curData = checkoutState.prices[checkoutState.formulation][checkoutState.treatment];
            let planText = '3-Month Protocol';
            let calculatedTotal = curData['3-month'] * 3;

            if (checkoutState.plan === 'monthly') {
                planText = 'Monthly Plan';
                calculatedTotal = curData.monthly;
            } else if (checkoutState.plan === '6-month') {
                planText = '6-Month Transformation';
                calculatedTotal = curData['6-month'] * 6;
            }

            const orderPayload = {
                orderId: 'AUR-' + Math.floor(100000 + Math.random() * 900000),
                treatmentName: curData.name,
                plan: planText,
                total: calculatedTotal,
                date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                customer: {
                    firstName: document.getElementById('firstName')?.value || 'Valued',
                    lastName: document.getElementById('lastName')?.value || 'Patient',
                    email: document.getElementById('email')?.value || ''
                }
            };

            sessionStorage.setItem('lychemd_order', JSON.stringify(orderPayload));

            // Redirect to order confirmation after 1.2s realistic processing
            setTimeout(() => {
                window.location.href = 'order-confirmation.html';
            }, 1200);
        });
    }

    // =========================================================================
    // 8. FAQ ACCORDION INTERACTIVITY
    // =========================================================================
    const faqItems = document.querySelectorAll('.checkout-faq-card .faq-item');
    faqItems.forEach((item) => {
        const trigger = item.querySelector('.faq-trigger');
        if (!trigger) return;

        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const isActive = item.classList.contains('is-active');

            // Close siblings
            faqItems.forEach((other) => {
                if (other !== item && other.classList.contains('is-active')) {
                    other.classList.remove('is-active');
                    const otherBtn = other.querySelector('.faq-trigger');
                    if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
                }
            });

            // Toggle active
            if (isActive) {
                item.classList.remove('is-active');
                trigger.setAttribute('aria-expanded', 'false');
            } else {
                item.classList.add('is-active');
                trigger.setAttribute('aria-expanded', 'true');
            }
        });
    });

    // =========================================================================
    // 9. SMOOTH SCROLL ANCHOR JUMPS
    // =========================================================================
    const scrollLinks = document.querySelectorAll('a[href^="#"]');
    scrollLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('href');
            if (targetId === '#' || targetId === '') return;
            const targetEl = document.querySelector(targetId);
            if (targetEl) {
                e.preventDefault();
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
});
