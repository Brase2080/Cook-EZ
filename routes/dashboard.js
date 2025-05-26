import express from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
    try {
        console.log('Dashboard access attempt - User:', req.user);
        const success = req.session.success;
        delete req.session.success;
        
        res.render('dashboard', {
            user: req.user,
            success: success
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading dashboard',
            error: error.message
        });
    }
});

export default router; 