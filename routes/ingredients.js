import express from 'express';
import pool from '../config/database.js';
import axios from 'axios';
import multer from 'multer';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
import { authenticateToken } from '../middleware/auth.js';

if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY manquante dans .env');
}
if (!process.env.MISTRAL_API_KEY) {
    console.error('MISTRAL_API_KEY manquante dans .env');
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Seules les images et fichiers audio sont autorisés'));
        }
    }
});

const convertToBase64 = (buffer) => {
    return buffer.toString('base64');
};

const mapUnite = (unite) => {
    const normalized = unite?.toLowerCase();
    const mapping = {
        'g': 1, 'grammes': 1, 'gramme': 1, 'gr': 1,
        'l': 2, 'litres': 2, 'litre': 2,
        'unit': 3, 'unités': 3, 'unité': 3, 'pièce': 3, 'pièces': 3,
        'ml': 4, 'millilitres': 4, 'millilitre': 4,
        'portion': 5, 'portions': 5
    };
    return mapping[normalized] || 3;
};

const mapCategorie = (categorie) => {
    const normalized = categorie?.toLowerCase();
    const mapping = {
        'milk': 1, 'lait': 1, 'lait et produits laitiers': 1, 'produits laitiers': 1,
        'meat-fish': 2, 'viande': 2, 'viandes': 2, 'poisson': 2, 'poissons': 2, 'viandes volailles poissons': 2,
        'legumin-nut-seed': 3, 'légumineuses': 3, 'noix': 3, 'graines': 3, 'légumineuses noix graines': 3,
        'cereal': 4, 'céréales': 4, 'produits céréaliers': 4,
        'fruit': 5, 'fruits': 5,
        'vegetable': 6, 'légumes': 6,
        'fat': 7, 'matières grasses': 7, 'huiles': 7, 'matières grasses huiles œufs': 7,
        'drink': 8, 'boissons': 8, 'sucres boissons': 8,
        'sauce': 9, 'sauces': 9,
        'spices': 10, 'épices': 10,
        'meal': 11, 'repas': 11
    };
    return mapping[normalized] || 6;
};

const structureWithAI = async (extractedText) => {
    const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
            {
                role: 'system',
                content: "Tu es un assistant spécialisé dans l'analyse d'aliments. À partir du texte fourni, génère une liste JSON d'aliments avec les champs suivants : nom (string), quantite (number), unite (texte parmi : g, L, unit, ml, portion), categorie (texte parmi : milk, meat-fish, legumin-nut-seed, cereal, fruit, vegetable, fat, drink, sauce, spices, meal), dlc nombre de jour avant expiration, calories (estimation pour 100g). Si dlc n'est pas précisée, estime-la automatiquement avec les valeurs moyennes"
            },
            {
                role: 'user',
                content: extractedText
            }
        ],
        temperature: 0.3
    });

    let foods;
    try {
        const aiResponse = JSON.parse(response.choices[0].message.content);
        foods = Array.isArray(aiResponse) ? aiResponse : [aiResponse];
    } catch (error) {
        throw new Error('Failed to parse AI response');
    }

    return foods.map(food => ({
        nom: food.nom || '',
        quantite: Number(food.quantite) || 1,
        unite: mapUnite(food.unite),
        categorie: mapCategorie(food.categorie),
        expiration: Number(food.dlc) || 7,
        calories: Number(food.calories) || 0,
        date_ajout: new Date().toISOString().split('T')[0]
    }));
};

const saveToDatabase = async (foods, userId) => {
    const connection = await pool.getConnection();
    try {
        let totalAffected = 0;
        for (const food of foods) {
            const [result] = await connection.execute(
                'INSERT INTO inventaire_aliments (nom, quantite, unite, categorie, dlc, calories, date_ajout, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [food.nom, food.quantite, food.unite, food.categorie, food.expiration, food.calories, food.date_ajout, userId]
            );
            totalAffected += result.affectedRows;
        }
        return totalAffected;
    } finally {
        connection.release();
    }
};

const processBarcodeInput = async (barcode) => {
    const response = await axios.get(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    if (response.data.status !== 1 || !response.data.product) {
        throw new Error('Product not found');
    }

    const p = response.data.product;
    const catMap = {
        'lait et produits laitiers': 1,
        'viandes volailles poissons': 2,
        'légumineuses noix graines': 3,
        'produits céréaliers': 4,
        'fruits': 5,
        'légumes': 6,
        'matières grasses huiles œufs': 7,
        'sucres boissons': 8
    };

    const unitMap = {
        'g': 1, 'grammes': 1, 'gramme': 1,
        'l': 2, 'litres': 2, 'litre': 2,
        'ml': 4, 'millilitres': 4, 'millilitre': 4,
        'unit': 3, 'unité': 3, 'pièce': 3,
        'portion': 5, 'portions': 5
    };

    const nom = p.product_name || '';
    const quantite = parseFloat((p.quantity || '').replace(/[^0-9.,]/g, '').replace(',', '.')) || 1;
    const unite = unitMap[(p.quantity || '').replace(/[^a-zA-Z]/g, '').toLowerCase()] || 3;
    const categorie = catMap[(p.categories_tags && p.categories_tags[0] || '').replace('en:', '').replace(/-/g, ' ')] || 6;
    const expiration = -1;
    const calories = p.nutriments && (p.nutriments['energy-kcal_100g'] || p.nutriments['energy-kcal']) ? Math.round(p.nutriments['energy-kcal_100g'] || p.nutriments['energy-kcal']) : 0;

    return [{
        nom,
        quantite,
        unite,
        categorie,
        expiration,
        calories,
        date_ajout: new Date().toISOString().split('T')[0]
    }];
};

const processOCRInput = async (imageData) => {
    try {
        console.log('Taille de l\'image base64:', imageData.length);
        console.log('Début du traitement OCR...');
        
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: "Extrait tout le texte visible de cette image de ticket de caisse ou d'étiquette alimentaire. Retourne uniquement le texte brut sans formatage."
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${imageData}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 1000
        });
        
        return response.choices[0].message.content;
    } catch (error) {
        console.error('Erreur OCR:', error);
        throw new Error('Impossible de traiter l\'image OCR');
    }
};

const processPhotoInput = async (imageData) => {
    try {
        console.log('Début du traitement photo...');
        
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: "Voici une photo de produits alimentaires, fais la liste de tous les ingrédients visibles que tu peux déterminer, estime la quantité, si l'aliment ne peut pas être identifié ne le mets pas, résultat en français, seulement le résultat"
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${imageData}`
                            }
                        }
                    ]
                }
            ]
        });
        
        return response.choices[0].message.content;
    } catch (error) {
        console.error('Erreur traitement photo:', error);
        throw new Error('Impossible de traiter la photo');
    }
};

const processVoiceInput = async (audioData) => {
    try {
        console.log('Début du traitement vocal...');
        
        const audioBuffer = Buffer.from(audioData, 'base64');
        
        const audioFile = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });
        
        const response = await openai.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
            language: 'fr'
        });
        
        return response.text;
    } catch (error) {
        console.error('Erreur traitement vocal:', error);
        throw new Error('Impossible de traiter l\'audio');
    }
};

router.get('/', authenticateToken, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute(
            'SELECT * FROM inventaire_aliments WHERE user_id = ?',
            [req.user.id]
        );
        connection.release();
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/view', authenticateToken, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute(
            'SELECT * FROM inventaire_aliments WHERE user_id = ?',
            [req.user.id]
        );
        connection.release();
        
        const categoryNames = {
            1: 'Lait et produits laitiers',
            2: 'Viandes, volailles, poissons',
            3: 'Légumineuses, noix, graines',
            4: 'Céréales',
            5: 'Fruits',
            6: 'Légumes',
            7: 'Matières grasses',
            8: 'Boissons',
            9: 'Sauces',
            10: 'Épices',
            11: 'Repas'
        };

        const unitNames = {
            1: 'g',
            2: 'L',
            3: 'unité',
            4: 'ml',
            5: 'portion'
        };

        const processedIngredients = rows.map(ingredient => {
            const categoryName = categoryNames[ingredient.categorie] || 'Autre';
            const categoryClass = categoryNames[ingredient.categorie] ?
                categoryNames[ingredient.categorie].toLowerCase().replace(/[^a-z]/g, '-') : 'other';
            const unitName = unitNames[ingredient.unite] || 'unité';

            let expirationDate = 'Non définie';
            let isExpiringSoon = false;
            if (ingredient.dlc && ingredient.dlc > 0 && ingredient.date_ajout) {
                const addDate = new Date(ingredient.date_ajout);
                addDate.setDate(addDate.getDate() + ingredient.dlc);
                expirationDate = addDate.toLocaleDateString('fr-FR');
                
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                addDate.setHours(0, 0, 0, 0);
                const diffTime = addDate.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                isExpiringSoon = diffDays >= 0 && diffDays <= 3;
            } else if (ingredient.expiration && ingredient.expiration > 0 && ingredient.date_ajout) {
                const addDate = new Date(ingredient.date_ajout);
                addDate.setDate(addDate.getDate() + ingredient.expiration);
                expirationDate = addDate.toLocaleDateString('fr-FR');
                
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                addDate.setHours(0, 0, 0, 0);
                const diffTime = addDate.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                isExpiringSoon = diffDays >= 0 && diffDays <= 3;
            }

            return {
                ...ingredient,
                categoryName,
                categoryClass,
                unitName,
                expirationDate,
                isExpiringSoon
            };
        });

        res.render('ingredients', {
            ingredients: processedIngredients,
            error: req.query.error,
            success: req.query.success
        });
    } catch (error) {
        res.render('ingredients', { ingredients: [], error: error.message, success: null });
    }
});

router.get('/add', authenticateToken, (req, res) => {
    res.render('add-ingredient', {
        error: req.query.error,
        success: req.query.success
    });
});

router.post('/transcribe', authenticateToken, upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Fichier audio requis' });
        }
        
        const audioBuffer = req.file.buffer;
        const audioFile = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });
        
        const response = await openai.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
            language: 'fr'
        });
        
        res.json({ transcription: response.text });
    } catch (error) {
        console.error('Erreur transcription:', error);
        res.status(500).json({ error: 'Erreur lors de la transcription' });
    }
});

router.post('/add', authenticateToken, upload.single('image_data'), async (req, res) => {
    try {
        const { input_type, text_data, barcode, audio_data } = req.body;
        let foods = [];
        let imageData = null;

        console.log('Type d\'input reçu:', input_type);
        console.log('Fichier reçu:', req.file ? 'Oui' : 'Non');

        if (req.file) {
            imageData = convertToBase64(req.file.buffer);
        } else if (req.body.image_data) {
            imageData = req.body.image_data.replace(/^data:image\/[a-z]+;base64,/, '');
        }

        if (input_type === 'text') {
            if (!text_data) throw new Error('Texte requis pour cette méthode');
            foods = await structureWithAI(text_data);
        } else if (input_type === 'voice') {
            if (!audio_data) throw new Error('Audio requis pour cette méthode');
            const extractedText = await processVoiceInput(audio_data);
            foods = await structureWithAI('Voici une transcription audio d\'ingrédients: ' + extractedText);
        } else if (input_type === 'barcode') {
            if (!barcode) throw new Error('Code-barres requis pour cette méthode');
            foods = await processBarcodeInput(barcode);
        } else if (input_type === 'ocr') {
            if (!imageData) throw new Error('Image requise pour l\'OCR');
            const extractedText = await processOCRInput(imageData);
            foods = await structureWithAI('Voici le texte OCR d\'un ticket de caisse, traite uniquement les articles alimentaires: ' + extractedText);
        } else if (input_type === 'photo') {
            if (!imageData) throw new Error('Image requise pour la photo');
            const extractedText = await processPhotoInput(imageData);
            foods = await structureWithAI('Voici une transcription de photo: ' + extractedText);
        } else {
            throw new Error('Type d\'entrée invalide');
        }

        if (!foods || foods.length === 0) {
            throw new Error('Aucun ingrédient détecté');
        }

        const addedItems = await saveToDatabase(foods, req.user.id);
        const successMsg = `${addedItems} ingrédient(s) ajouté(s) avec succès`;
        
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return res.redirect(`/ingredients/add?success=${encodeURIComponent(successMsg)}`);
        }
        
        res.json({ message: successMsg, items_added: addedItems });
    } catch (error) {
        console.error('Erreur lors de l\'ajout:', error);
        
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return res.redirect(`/ingredients/add?error=${encodeURIComponent(error.message)}`);
        }
        
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [result] = await connection.execute(
            'DELETE FROM inventaire_aliments WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        connection.release();
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Ingredient not found or not owned by user' });
        }
        
        res.json({ message: 'Ingredient deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { nom, quantite, unite, categorie, dlc, calories } = req.body;
        let dlcDays = null;
        
        if (dlc && dlc !== '') {
            const today = new Date();
            const expirationDate = new Date(dlc);
            const diffTime = expirationDate.getTime() - today.getTime();
            dlcDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
        
        const connection = await pool.getConnection();
        const [result] = await connection.execute(
            'UPDATE inventaire_aliments SET nom = ?, quantite = ?, unite = ?, categorie = ?, dlc = ?, calories = ? WHERE id = ? AND user_id = ?',
            [nom, quantite, unite, categorie, dlcDays, calories, req.params.id, req.user.id]
        );
        connection.release();
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Ingredient not found or not owned by user' });
        }
        
        res.json({ message: 'Ingredient updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
