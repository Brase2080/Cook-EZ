let ingredientsData = [];

function editIngredient(id, nom, quantite, unite, categorie, dlc, calories) {
    document.getElementById('editId').value = id;
    document.getElementById('editNom').value = nom;
    document.getElementById('editQuantite').value = quantite;
    document.getElementById('editUnite').value = unite;
    document.getElementById('editCategorie').value = categorie || 'other';
    
    let dlcDate = '';
    if (dlc && dlc !== 'Non définie' && dlc !== '') {
        const today = new Date();
        const expirationDate = new Date(today);
        expirationDate.setDate(today.getDate() + parseInt(dlc));
        dlcDate = expirationDate.toISOString().split('T')[0];
    }
    document.getElementById('editDlc').value = dlcDate;
    document.getElementById('editCalories').value = calories;
    
    document.getElementById('editModal').style.display = 'block';
}

function deleteIngredient(id, nom) {
    if (confirm(`Êtes-vous sûr de vouloir supprimer "${nom}" ?`)) {
        fetch(`/ingredients/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.message) {
                location.reload();
            } else {
                alert('Erreur lors de la suppression');
            }
        })
        .catch(error => {
            console.error('Erreur:', error);
            alert('Erreur lors de la suppression');
        });
    }
}

function closeModal() {
    document.getElementById('editModal').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function() {
    const editButtons = document.querySelectorAll('.btn-edit');
    editButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const ingredientId = this.getAttribute('data-id');
            const ingredientName = this.getAttribute('data-name');
            const ingredientQuantity = this.getAttribute('data-quantity');
            const ingredientUnit = this.getAttribute('data-unit');
            const ingredientCategory = this.getAttribute('data-category');
            const ingredientDlc = this.getAttribute('data-dlc');
            const ingredientCalories = this.getAttribute('data-calories');
            
            editIngredient(
                ingredientId,
                ingredientName,
                ingredientQuantity,
                ingredientUnit,
                ingredientCategory,
                ingredientDlc,
                ingredientCalories
            );
        });
    });

    const deleteButtons = document.querySelectorAll('.btn-delete');
    deleteButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const ingredientId = this.getAttribute('data-id');
            const ingredientName = this.getAttribute('data-name');
            
            deleteIngredient(ingredientId, ingredientName);
        });
    });

    const closeButton = document.querySelector('.close');
    if (closeButton) {
        closeButton.addEventListener('click', function(e) {
            e.preventDefault();
            closeModal();
        });
    }

    const cancelButton = document.getElementById('cancelBtn');
    if (cancelButton) {
        cancelButton.addEventListener('click', function(e) {
            e.preventDefault();
            closeModal();
        });
    }

    window.addEventListener('click', function(event) {
        const modal = document.getElementById('editModal');
        if (event.target == modal) {
            closeModal();
        }
    });

    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const data = Object.fromEntries(formData);
            
            fetch(`/ingredients/${data.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            })
            .then(response => response.json())
            .then(result => {
                if (result.message) {
                    closeModal();
                    location.reload();
                } else {
                    alert('Erreur lors de la modification');
                }
            })
            .catch(error => {
                console.error('Erreur:', error);
                alert('Erreur lors de la modification');
            });
        });
    }
}); 