function viewRecipe(recipeId) {
    window.location.href = `/recipes/details/${recipeId}`;
}

function loadMoreRecipes(categoryId) {
    const button = document.querySelector(`[data-category-id="${categoryId}"] .load-more-btn`);
    const grid = document.querySelector(`[data-category-id="${categoryId}"] .recipes-grid`);
    
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Chargement...';
    button.disabled = true;

    const currentRecipes = grid.children.length;
    const page = Math.ceil(currentRecipes / 5) + 1;

    fetch(`/recipes/category/${categoryId}?page=${page}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                data.recipes.forEach(recipe => {
                    const recipeCard = createRecipeCard(recipe);
                    grid.appendChild(recipeCard);
                });

                if (!data.hasMore) {
                    button.style.display = 'none';
                } else {
                    button.innerHTML = `Voir plus de recettes (${data.total - grid.children.length} restantes)`;
                    button.disabled = false;
                }
            }
        })
        .catch(error => {
            console.error('Error loading more recipes:', error);
            button.innerHTML = 'Erreur lors du chargement';
            button.disabled = false;
        });
}

function createRecipeCard(recipe) {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.onclick = () => viewRecipe(recipe.id);

    const tagsHtml = recipe.tags.map(tag => `<span class="tag-badge">#${tag}</span>`).join('');
    const imageHtml = recipe.image_url 
        ? `<img src="${recipe.image_url}" alt="${recipe.nom}">`
        : '<div class="image-placeholder"><i class="fas fa-utensils"></i></div>';

    card.innerHTML = `
        <div class="recipe-image">
            ${imageHtml}
            <div class="recipe-difficulty">
                <span class="badge bg-${recipe.difficulte === 'facile' ? 'success' : recipe.difficulte === 'moyen' ? 'warning' : 'danger'}">
                    ${recipe.difficulte}
                </span>
            </div>
        </div>
        <div class="recipe-content">
            <h4>${recipe.nom}</h4>
            <p class="recipe-description">${recipe.description}</p>
            <div class="recipe-meta">
                <span><i class="fas fa-clock"></i> ${recipe.temps_total} min</span>
                <span><i class="fas fa-users"></i> ${recipe.portions} pers.</span>
                ${recipe.calories_par_portion ? `<span><i class="fas fa-fire"></i> ${recipe.calories_par_portion} cal</span>` : ''}
            </div>
            <div class="recipe-tags">
                ${tagsHtml}
            </div>
        </div>
    `;

    return card;
}
