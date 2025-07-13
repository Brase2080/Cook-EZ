import express from 'express';
import pool from '../config/database.js';
import axios from 'axios';
import multer from 'multer';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
import { authenticateToken } from '../middleware/auth.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

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

const processVoiceInput = async (audioData) => {
  const base64Data = audioData.replace(/^data:audio\/[a-z]+;base64,/, '');
  const audioBuffer = Buffer.from(base64Data, 'base64');

  const file = await openai.files.create({
    file: audioBuffer,
    purpose: 'transcriptions',
    filename: 'audio.wav',
    contentType: 'audio/wav'
  });

  const transcription = await openai.audio.transcriptions.create({
    file: file.id,
    model: 'whisper-1',
    language: 'fr'
  });

  return transcription.text;
};

const processOCRInput = async (imageData) => {
  const response = await axios.post(
    'https://api.mistral.ai/v1/ocr',
    {
      model: 'mistral-ocr-latest',
      document: {
        type: 'image_url',
        image_url: `data:image/jpeg;base64,${imageData}`
      },
      include_image_base64: true
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
  const markdown = response.data.pages[0]?.markdown || '';
  return markdown;
};

const processPhotoInput = async (imageData) => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: "Here is a photo of alimentary products, make the list of all visible ingredients that you can determine, estimate the quantity, if the aliment can't be identified don't put it, result in french, only result"
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
};

// Route GET pour afficher les ingrédients
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

// Route GET pour la vue des ingrédients
router.get('/view', authenticateToken, async (req, res) => {
  try {
      const connection = await pool.getConnection();
      const [rows] = await connection.execute(
          'SELECT * FROM inventaire_aliments WHERE user_id = ?', 
          [req.user.id]
      );
      connection.release();
      res.render('ingredients', {
          ingredients: rows,
          error: req.query.error,
          success: req.query.success
      });
  } catch (error) {
      res.render('ingredients', { ingredients: [], error: error.message, success: null });
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
      const connection = await pool.getConnection();
      const [result] = await connection.execute(
          'UPDATE inventaire_aliments SET nom = ?, quantite = ?, unite = ?, categorie = ?, dlc = ?, calories = ? WHERE id = ? AND user_id = ?',
          [nom, quantite, unite, categorie, dlc, calories, req.params.id, req.user.id]
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

// Route GET pour le formulaire d'ajout
router.get('/add', authenticateToken, (req, res) => {
  res.render('add-ingredient', {
      error: req.query.error,
      success: req.query.success
  });
});

router.post('/add', authenticateToken, async (req, res) => {
  try {
      const { input_type, text_data, barcode, image_data } = req.body;
      let foods = [];

      if (input_type === 'text') {
          foods = await structureWithAI(text_data);
      } else if (input_type === 'barcode') {
          foods = await processBarcodeInput(barcode);
      } else if (input_type === 'ocr') {
          if (!image_data) throw new Error('Aucune image fournie');
          const extractedText = await processOCRInput(image_data);
          foods = await structureWithAI('Here is the OCR of the purchase ticket, make sure to handle nutrition articles only: ' + extractedText);
      } else if (input_type === 'photo') {
          if (!image_data) throw new Error('Aucune image fournie');
          const extractedText = await processPhotoInput(image_data);
          foods = await structureWithAI('Here is a photo transcription: ' + extractedText);
      } else {
          throw new Error('Invalid input_type');
      }

      // Passer l'ID de l'utilisateur à la fonction saveToDatabase
      const addedItems = await saveToDatabase(foods, req.user.id);
      const successMsg = `Successfully added ${addedItems} items`;
      
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
          return res.redirect(`/ingredients/add?success=${encodeURIComponent(successMsg)}`);
      }
      
      res.json({ message: successMsg, items_added: addedItems });
  } catch (error) {
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
          return res.redirect(`/ingredients/add?error=${encodeURIComponent(error.message)}`);
      }
      
      res.status(500).json({ error: error.message });
  }
});


router.post('/add', async (req, res) => {
  try {
    const { input_type, text_data, barcode, image_data } = req.body;
    let foods = [];
    if (input_type === 'text') {
      foods = await structureWithAI(text_data);
    } else if (input_type === 'barcode') {
      foods = await processBarcodeInput(barcode);
    } else if (input_type === 'ocr') {
      if (!image_data) throw new Error('Aucune image fournie');
      const extractedText = await processOCRInput(image_data);
      foods = await structureWithAI('Here is the OCR of the purchase ticket, make sure to handle nutrition articles only: ' + extractedText);
    } else if (input_type === 'photo') {
      if (!image_data) throw new Error('Aucune image fournie');
      const extractedText = await processPhotoInput(image_data);
      foods = await structureWithAI('Here is a photo transcription: ' + extractedText);
    } else {
      throw new Error('Invalid input_type');
    }
    const addedItems = await saveToDatabase(foods);
    const successMsg = `Successfully added ${addedItems} items`;
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect(`/ingredients/add?success=${encodeURIComponent(successMsg)}`);
    }
    res.json({ message: successMsg, items_added: addedItems });
  } catch (error) {
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect(`/ingredients/add?error=${encodeURIComponent(error.message)}`);
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
