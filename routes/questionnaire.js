import express from 'express';
import { User } from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get questionnaire page
router.get('/', authenticateToken, async (req, res) => {
    try {
        const questionnaire = await User.getQuestionnaire(req.user.id);
        res.render('questionnaire', {
            questionnaire: questionnaire || {},
            error: null
        });
    } catch (error) {
        console.error('Error fetching questionnaire:', error);
        res.status(500).render('questionnaire', {
            error: 'Une erreur est survenue lors du chargement du questionnaire',
            questionnaire: {}
        });
    }
});

// Submit questionnaire
router.post('/submit', authenticateToken, async (req, res) => {
    try {
        const { name, cookingLevel, dietaryPreferences, allergies, utensils } = req.body;
        
        if (!cookingLevel || !dietaryPreferences || !allergies || !utensils) {
            return res.status(400).json({ error: 'Tous les champs sont requis' });
        }

        if (cookingLevel < 1 || cookingLevel > 5) {
            return res.status(400).json({ error: 'Le niveau de cuisine doit être entre 1 et 5' });
        }

        // Update user's name
        await User.updateName(req.user.id, name);

        const existingQuestionnaire = await User.getQuestionnaire(req.user.id);
        
        if (existingQuestionnaire) {
            await User.updateQuestionnaire(req.user.id, {
                cookingLevel,
                dietaryPreferences,
                allergies,
                utensils
            });
        } else {
            await User.createQuestionnaire(req.user.id, {
                cookingLevel,
                dietaryPreferences,
                allergies,
                utensils
            });
        }

        res.redirect('/dashboard'); } catch (error) {
        console.error('Error submitting questionnaire:', error);
        res.status(500).json({ error: 'Une erreur est survenue lors de la soumission du questionnaire' });
    }
});

export default router; 