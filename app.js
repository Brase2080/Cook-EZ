import express from 'express';
import session from 'express-session';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import flash from 'connect-flash';
import { initDatabase } from './config/database.js';
import passport from './config/passport.js';
import authRoutes from './routes/auth.js';
import { securityHeaders, generalLimiter } from './middleware/security.js';
import { authenticateToken } from './middleware/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import questionnaireRoutes from './routes/questionnaire.js';
import ingredientsRoutes from './routes/ingredients.js';
import recipesRoutes from './routes/recipes.js';
import axios from 'axios';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

await initDatabase();

app.use(securityHeaders);
app.use(generalLimiter);
app.use(cookieParser());

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || '',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  },
  name: 'sessionId'
}));

app.use(flash());

app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.static('public'));

app.get('/', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    res.redirect('/dashboard');
  } else if (req.cookies.token) {
    res.redirect('/auth/login');
  } else {
    res.redirect('/auth/login');
  }
});

app.get('/ingredients', (req, res) => {
  res.redirect('/ingredients/view');
});

app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/questionnaire', questionnaireRoutes);
app.use('/ingredients', ingredientsRoutes);
app.use('/recipes', recipesRoutes);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

// Modifier la fonction saveToDatabase dans app.js
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

// Modifier la route POST
app.post('/ingredients/add', authenticateToken, async (req, res) => {
  try {
      const { input_type, text_data, barcode, audio_data, image_data } = req.body;
      let foods = [];

      if (input_type === 'text') {
          foods = await structureWithAI(text_data);
      } else if (input_type === 'barcode') {
          foods = await processBarcodeInput(barcode);
      } else if (input_type === 'voice') {
          throw new Error('Voice input not implemented yet');
      } else if (input_type === 'ocr') {
          throw new Error('OCR input not implemented yet');
      } else if (input_type === 'photo') {
          throw new Error('Photo input not implemented yet');
      } else {
          throw new Error('Invalid input_type');
      }

      const addedItems = await saveToDatabase(foods, req.user.id);
      const successMsg = `Successfully added ${addedItems} items`;
      
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
          return res.redirect(`/ingredients/view?success=${encodeURIComponent(successMsg)}`);
      }
      
      res.json({ message: successMsg, items_added: addedItems });
  } catch (error) {
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
          return res.redirect(`/ingredients/view?error=${encodeURIComponent(error.message)}`);
      }
      
      res.status(500).json({ error: error.message });
  }
});


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


app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
