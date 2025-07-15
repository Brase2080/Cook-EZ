import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
    try {
        const [categories] = await pool.execute(`
            SELECT c.*, COUNT(r.id) as total_recettes
            FROM categories_recettes c
            LEFT JOIN recettes r ON c.id = r.categorie_id AND r.active = TRUE
            WHERE c.active = TRUE
            GROUP BY c.id
            ORDER BY c.ordre_affichage
        `);

        const categoriesWithRecipes = await Promise.all(
            categories.map(async (category) => {
                const [recipes] = await pool.execute(`
                    SELECT r.*, 
                           GROUP_CONCAT(DISTINCT rt.tag) as tags,
                           COUNT(ri.id) as ingredient_count
                    FROM recettes r
                    LEFT JOIN recettes_tags rt ON r.id = rt.recette_id
                    LEFT JOIN recettes_ingredients ri ON r.id = ri.recette_id
                    WHERE r.categorie_id = ? AND r.active = TRUE
                    GROUP BY r.id
                    ORDER BY r.created_at DESC
                    LIMIT 5
                `, [category.id]);

                return {
                    ...category,
                    recettes: recipes.map(recipe => ({
                        ...recipe,
                        tags: recipe.tags ? recipe.tags.split(',') : [],
                        temps_total: recipe.temps_preparation + (recipe.temps_cuisson || 0)
                    }))
                };
            })
        );

        res.render('recipes/index', {
            title: 'Découverte de recettes',
            categories: categoriesWithRecipes,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading recipes:', error);
        res.status(500).render('error', { error: 'Erreur lors du chargement des recettes' });
    }
});

router.get('/category/:categoryId', authenticateToken, async (req, res) => {
    try {
        const { categoryId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        const [category] = await pool.execute(
            'SELECT * FROM categories_recettes WHERE id = ? AND active = TRUE',
            [categoryId]
        );

        if (!category.length) {
            return res.status(404).render('error', { error: 'Catégorie non trouvée' });
        }

        const [recipes] = await pool.execute(`
            SELECT r.*, 
                   GROUP_CONCAT(DISTINCT rt.tag) as tags,
                   COUNT(ri.id) as ingredient_count
            FROM recettes r
            LEFT JOIN recettes_tags rt ON r.id = rt.recette_id
            LEFT JOIN recettes_ingredients ri ON r.id = ri.recette_id
            WHERE r.categorie_id = ? AND r.active = TRUE
            GROUP BY r.id
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        `, [categoryId, limit, offset]);

        const [totalCount] = await pool.execute(
            'SELECT COUNT(*) as total FROM recettes WHERE categorie_id = ? AND active = TRUE',
            [categoryId]
        );

        const recipesData = recipes.map(recipe => ({
            ...recipe,
            tags: recipe.tags ? recipe.tags.split(',') : [],
            temps_total: recipe.temps_preparation + (recipe.temps_cuisson || 0)
        }));

        res.json({
            success: true,
            category: category[0],
            recipes: recipesData,
            total: totalCount[0].total,
            page,
            hasMore: (page * limit) < totalCount[0].total
        });
    } catch (error) {
        console.error('Error loading category recipes:', error);
        res.status(500).json({ success: false, error: 'Erreur lors du chargement' });
    }
});

router.get('/details/:recipeId', authenticateToken, async (req, res) => {
    try {
        const { recipeId } = req.params;

        const [recipe] = await pool.execute(`
            SELECT r.*, c.nom as categorie_nom
            FROM recettes r
            JOIN categories_recettes c ON r.categorie_id = c.id
            WHERE r.id = ? AND r.active = TRUE
        `, [recipeId]);

        if (!recipe.length) {
            return res.status(404).render('error', { error: 'Recette non trouvée' });
        }

        const [ingredients] = await pool.execute(
            'SELECT * FROM recettes_ingredients WHERE recette_id = ? ORDER BY id',
            [recipeId]
        );

        const [tags] = await pool.execute(
            'SELECT tag FROM recettes_tags WHERE recette_id = ?',
            [recipeId]
        );

        const recipeData = {
            ...recipe[0],
            ingredients,
            tags: tags.map(t => t.tag),
            temps_total: recipe[0].temps_preparation + (recipe[0].temps_cuisson || 0)
        };

        res.render('recipes/details', {
            title: recipe[0].nom,
            recipe: recipeData,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading recipe details:', error);
        res.status(500).render('error', { error: 'Erreur lors du chargement de la recette' });
    }
});

export default router;
