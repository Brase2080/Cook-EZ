function selectMethod(method) {
    console.log('Sélection de la méthode :', method);
    
    // Reset all methods
    document.querySelectorAll('.input-method').forEach(el => {
        el.classList.remove('active');
    });
    
    // Hide all inputs
    document.querySelectorAll('#text-input, #barcode-input, #image-input').forEach(el => {
        el.style.display = 'none';
    });
    
    // Activate selected method
    document.querySelector(`[data-method="${method}"]`).classList.add('active');
    document.getElementById('input_type').value = method;
    
    // Show corresponding input
    if (method === 'text') {
        document.getElementById('text-input').style.display = 'block';
        setTimeout(() => document.getElementById('text_data').focus(), 100);
    } else if (method === 'barcode') {
        document.getElementById('barcode-input').style.display = 'block';
        setTimeout(() => document.getElementById('barcode').focus(), 100);
    } else if (method === 'ocr' || method === 'photo') {
        document.getElementById('image-input').style.display = 'block';
    }
    
    // Show form
    document.getElementById('ingredientForm').style.display = 'block';
}

function resetForm() {
    document.getElementById('ingredientForm').style.display = 'none';
    document.querySelectorAll('.input-method').forEach(el => {
        el.classList.remove('active');
    });
    document.getElementById('ingredientForm').reset();
}

// Gestionnaire d'événements au chargement du DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM chargé, configuration des listeners');
    
    // Listeners pour les méthodes d'input
    document.querySelectorAll('.input-method').forEach(method => {
        method.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const methodType = this.getAttribute('data-method');
            console.log('Méthode cliquée :', methodType);
            selectMethod(methodType);
        });
    });
    
    // Listener pour le bouton reset
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', function(e) {
            e.preventDefault();
            resetForm();
        });
    }
    
    // Form submission with loading state
    const form = document.getElementById('ingredientForm');
    if (form) {
        form.addEventListener('submit', function() {
            const submitBtn = this.querySelector('button[type="submit"]');
            const btnText = submitBtn.querySelector('.btn-text');
            const loading = submitBtn.querySelector('.loading');
            
            if (btnText && loading) {
                btnText.style.display = 'none';
                loading.style.display = 'inline-block';
                submitBtn.disabled = true;
            }
        });
    }
}); 